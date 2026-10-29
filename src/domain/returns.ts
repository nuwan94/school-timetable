import { MEDIUM_LABELS } from './catalog';
import { normFor, teacherTotals } from './checks';
import type { Medium } from './common';
import { NOT_IN_CADRE, type Teacher } from './entities';
import { patternPeriods } from './factories';
import type { Project, ReportColumn } from './project';
import { ledgerRows } from './relief';
import { classIdsOfGroups } from './timetable';
import { tx } from '@/i18n';

/**
 * SL returns and staff reports (PLAN.md §9.3). Every report is a plain table
 * so the screen, CSV, Excel and PDF all show the same thing.
 */

export type CellValue = string | number;

export interface ReportTable {
  id: string;
  title: string;
  /** Short line under the title (what it counts, any caveat). */
  note?: string;
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, CellValue>[];
  totals?: Record<string, CellValue>;
}

/** A teacher counts in the cadre unless their category is excluded, they are inactive, or a vacancy. */
export const inCadre = (t: Teacher) => t.active && !NOT_IN_CADRE.includes(t.category);

const CATEGORY_LABELS: Record<Teacher['category'], string> = {
  get permanent() {
    return tx('Permanent');
  },
  get contract() {
    return tx('Contract');
  },
  get attached() {
    return tx('Attached');
  },
  get visiting() {
    return tx('Visiting');
  },
  get developmentOfficer() {
    return tx('Development Officer');
  },
  get trainee() {
    return tx('Trainee');
  },
  get coach() {
    return tx('Sports coach');
  },
  get vacancy() {
    return tx('Vacancy');
  },
};

type MediumKey = Medium | 'bilingual';
const mediumLabel = (m: MediumKey | null | undefined) => (m ? MEDIUM_LABELS[m] : '');

interface Teaching {
  subjectId: string;
  classIds: string[];
  teacherIds: string[];
  periods: number;
  covering: boolean;
  uncovered: boolean;
}

/** Every weekly teaching requirement: allocations plus option-block sets (a line's periods per set). */
function teachings(p: Project): Teaching[] {
  const out: Teaching[] = [];
  for (const a of p.allocations)
    out.push({
      subjectId: a.subjectId,
      classIds: classIdsOfGroups(p, a.groupIds),
      teacherIds: a.teacherIds,
      periods: patternPeriods(a.pattern),
      covering: a.status === 'covering',
      uncovered: a.status === 'uncovered' || a.teacherIds.length === 0,
    });
  for (const b of p.optionBlocks)
    for (const l of b.lines)
      for (const s of l.sets)
        out.push({
          subjectId: s.subjectId,
          classIds: b.classIds,
          teacherIds: s.teacherIds,
          periods: patternPeriods(l.pattern),
          covering: false,
          uncovered: s.teacherIds.length === 0,
        });
  return out;
}

/** The medium most of these classes learn in (bilingual stays bilingual). */
function mediumOf(p: Project, classIds: string[]): MediumKey | null {
  const count = new Map<MediumKey, number>();
  for (const id of classIds) {
    const m = p.classes.find((c) => c.id === id)?.medium;
    if (m) count.set(m, (count.get(m) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

const subjectName = (p: Project, id: string | null) => (id ? (p.subjects.find((s) => s.id === id)?.name ?? '?') : '');
const subjectCode = (p: Project, id: string | null) => (id ? (p.subjects.find((s) => s.id === id)?.shortCode ?? '') : '');

/** A lesson is outside the teacher's appointment when it is cover, another subject, or another medium. */
function outsideAppointment(p: Project, t: Teacher, x: Teaching): boolean {
  if (x.covering) return true;
  if (t.appointmentSubjectId && x.subjectId !== t.appointmentSubjectId) return true;
  const m = mediumOf(p, x.classIds);
  return !!t.appointmentMedium && !!m && m !== 'bilingual' && m !== t.appointmentMedium;
}

// ------------------------------------------------------------ deployment

export function deploymentReturn(p: Project): ReportTable {
  const totals = teacherTotals(p);
  const all = teachings(p);
  const gradeName = (classId: string) => {
    const c = p.classes.find((x) => x.id === classId);
    return p.grades.find((g) => g.id === c?.gradeId)?.name ?? '';
  };
  const rows = p.teachers
    .filter((t) => t.active)
    .map((t, i) => {
      const mine = all.filter((x) => x.teacherIds.includes(t.id));
      const bySubject = new Map<string, Set<string>>();
      for (const x of mine) {
        const set = bySubject.get(x.subjectId) ?? new Set<string>();
        x.classIds.forEach((c) => set.add(gradeName(c)));
        bySubject.set(x.subjectId, set);
      }
      const taught = [...bySubject]
        .map(([s, grades]) => `${subjectCode(p, s) || subjectName(p, s)} (${[...grades].filter(Boolean).join(', ')})`)
        .join('; ');
      const total = totals.get(t.id);
      const norm = normFor(p, t);
      const normText =
        norm && (norm.min !== null || norm.max !== null) ? `${norm.min ?? '–'}–${norm.max ?? '–'}${norm.unit === 'minutes' ? ' min' : ''}` : '';
      const status = !total
        ? ''
        : !normText && total.level !== 'over'
          ? tx('No norm set')
          : total.level === 'under'
            ? tx('Under norm')
            : total.level === 'over'
              ? tx('Over')
              : total.level === 'ok'
                ? tx('Within norm')
                : tx('No lessons');
      return {
        no: i + 1,
        name: t.name,
        category: inCadre(t) ? CATEGORY_LABELS[t.category] : tx('{category} (not in cadre)', { category: CATEGORY_LABELS[t.category] }),
        serviceGrade: t.serviceGrade,
        appointmentType: t.appointmentType,
        appointmentSubject: subjectName(p, t.appointmentSubjectId),
        appointmentMedium: mediumLabel(t.appointmentMedium),
        taught,
        periods: total?.periods ?? 0,
        outside: mine.filter((x) => outsideAppointment(p, t, x)).reduce((s, x) => s + x.periods, 0),
        norm: normText,
        status,
      };
    });
  return {
    id: 'deployment',
    title: tx('Teacher deployment return'),
    note: tx('Periods outside appointment: cover, or a subject or medium other than the appointment.'),
    columns: [
      { key: 'no', label: tx('No.'), numeric: true },
      { key: 'name', label: tx('Name') },
      { key: 'category', label: tx('Category') },
      { key: 'serviceGrade', label: tx('Service grade') },
      { key: 'appointmentType', label: tx('Appointment type') },
      { key: 'appointmentSubject', label: tx('Appointment subject') },
      { key: 'appointmentMedium', label: tx('Medium') },
      { key: 'taught', label: tx('Subjects taught (grades)') },
      { key: 'periods', label: tx('Periods / week'), numeric: true },
      { key: 'outside', label: tx('Outside appointment'), numeric: true },
      { key: 'norm', label: tx('Norm') },
      { key: 'status', label: tx('Norm status') },
    ],
    rows,
    totals: {
      name: tx('{n} teachers', { n: rows.length }),
      periods: rows.reduce((s, r) => s + r.periods, 0),
      outside: rows.reduce((s, r) => s + r.outside, 0),
    },
  };
}

// ------------------------------------------------------------------ cadre

/** The generic cadre layout; a school can rename, reorder and hide these columns. */
export const CADRE_COLUMNS: ReportColumn[] = [
  { key: 'no', get label() { return tx('No.'); }, visible: true },
  { key: 'code', get label() { return tx('Code'); }, visible: false },
  { key: 'subject', get label() { return tx('Subject'); }, visible: true },
  { key: 'medium', get label() { return tx('Medium'); }, visible: true },
  { key: 'approved', get label() { return tx('Approved'); }, visible: true },
  { key: 'actual', get label() { return tx('Actual'); }, visible: true },
  { key: 'excess', get label() { return tx('Excess'); }, visible: true },
  { key: 'deficit', get label() { return tx('Deficit'); }, visible: true },
  { key: 'remarks', get label() { return tx('Remarks'); }, visible: true },
];
const NUMERIC = new Set(['no', 'approved', 'actual', 'excess', 'deficit']);

/** Saved layout, with any columns added since (e.g. after an update) appended hidden. */
export function cadreLayout(p: Project): ReportColumn[] {
  const saved = p.reports.cadreColumns;
  if (!saved.length) return CADRE_COLUMNS;
  const known = new Set(saved.map((c) => c.key));
  return [
    ...saved.filter((c) => CADRE_COLUMNS.some((d) => d.key === c.key)),
    ...CADRE_COLUMNS.filter((c) => !known.has(c.key)).map((c) => ({ ...c, visible: false })),
  ];
}

export function cadreReturn(p: Project): ReportTable {
  const key = (s: string, m: string) => `${s}|${m}`;
  const rows = new Map<string, { subjectId: string; medium: Medium; approved: number; actual: number; names: string[] }>();
  const get = (subjectId: string, medium: Medium) => {
    const k = key(subjectId, medium);
    let r = rows.get(k);
    if (!r) rows.set(k, (r = { subjectId, medium, approved: 0, actual: 0, names: [] }));
    return r;
  };
  for (const c of p.cadre) get(c.subjectId, c.medium).approved += c.approved;
  const unrecorded: string[] = [];
  for (const t of p.teachers.filter(inCadre)) {
    if (!t.appointmentSubjectId || !t.appointmentMedium) {
      unrecorded.push(t.name);
      continue;
    }
    const r = get(t.appointmentSubjectId, t.appointmentMedium);
    r.actual++;
    r.names.push(t.name);
  }
  const order = (id: string) => p.subjects.findIndex((s) => s.id === id);
  const list = [...rows.values()].sort((a, b) => order(a.subjectId) - order(b.subjectId) || a.medium.localeCompare(b.medium));
  const data = list.map((r, i) => ({
    no: i + 1,
    code: subjectCode(p, r.subjectId),
    subject: subjectName(p, r.subjectId),
    medium: mediumLabel(r.medium),
    approved: r.approved,
    actual: r.actual,
    excess: Math.max(0, r.actual - r.approved),
    deficit: Math.max(0, r.approved - r.actual),
    remarks: r.approved === 0 && r.actual > 0 ? tx('Not in approved cadre') : '',
  }));
  const layout = cadreLayout(p).filter((c) => c.visible);
  const sum = (k: 'approved' | 'actual' | 'excess' | 'deficit') => data.reduce((s, r) => s + r[k], 0);
  return {
    id: 'cadre',
    title: tx('Cadre return'),
    note: tx('Approved vs actual teachers by appointment subject and medium. Not counted: {join}.{x}', { join: NOT_IN_CADRE.map((c) => CATEGORY_LABELS[c].toLowerCase()).join(', '), x: unrecorded.length ? ' ' + tx('{n} teacher(s) have no appointment subject or medium recorded: {names}.', { n: unrecorded.length, names: unrecorded.join(', ') }) : '' }),
    columns: layout.map((c) => ({ key: c.key, label: tx(c.label), numeric: NUMERIC.has(c.key) })),
    rows: data,
    totals: { subject: tx('Total'), approved: sum('approved'), actual: sum('actual'), excess: sum('excess'), deficit: sum('deficit') },
  };
}

// ------------------------------------------------------- surplus / deficit

export interface SurplusRow {
  subjectId: string;
  medium: MediumKey;
  needed: number;
  byAppointed: number;
  byOthers: number;
  uncovered: number;
  appointed: number;
  /** Null until periods-per-teacher is set. */
  teachersNeeded: number | null;
  /** Appointed − needed: positive = surplus, negative = deficit. */
  balance: number | null;
}

export function surplusRows(p: Project): SurplusRow[] {
  const per = p.reports.periodsPerTeacher;
  const teachers = new Map(p.teachers.map((t) => [t.id, t]));
  const map = new Map<string, SurplusRow>();
  const get = (subjectId: string, medium: MediumKey) => {
    const k = `${subjectId}|${medium}`;
    let r = map.get(k);
    if (!r)
      map.set(
        k,
        (r = { subjectId, medium, needed: 0, byAppointed: 0, byOthers: 0, uncovered: 0, appointed: 0, teachersNeeded: null, balance: null }),
      );
    return r;
  };
  for (const x of teachings(p)) {
    const m = mediumOf(p, x.classIds);
    if (!m) continue;
    const r = get(x.subjectId, m);
    r.needed += x.periods;
    if (x.uncovered) r.uncovered += x.periods;
    else if (
      x.teacherIds.some((id) => {
        const t = teachers.get(id);
        return t && inCadre(t) && t.appointmentSubjectId === x.subjectId && (m === 'bilingual' || t.appointmentMedium === m);
      })
    )
      r.byAppointed += x.periods;
    else r.byOthers += x.periods;
  }
  for (const t of p.teachers.filter(inCadre))
    if (t.appointmentSubjectId && t.appointmentMedium) get(t.appointmentSubjectId, t.appointmentMedium).appointed++;
  for (const r of map.values()) {
    r.teachersNeeded = per ? Math.ceil(r.needed / per) : null;
    r.balance = r.teachersNeeded === null ? null : r.appointed - r.teachersNeeded;
  }
  const order = (id: string) => p.subjects.findIndex((s) => s.id === id);
  return [...map.values()].sort((a, b) => order(a.subjectId) - order(b.subjectId) || a.medium.localeCompare(b.medium));
}

export function surplusReport(p: Project, onlyDeficits = false): ReportTable {
  const per = p.reports.periodsPerTeacher;
  const rows = surplusRows(p)
    .filter((r) => !onlyDeficits || (r.balance !== null && r.balance < 0))
    .map((r, i) => ({
      no: i + 1,
      subject: subjectName(p, r.subjectId),
      medium: mediumLabel(r.medium),
      needed: r.needed,
      byAppointed: r.byAppointed,
      byOthers: r.byOthers,
      uncovered: r.uncovered,
      appointed: r.appointed,
      teachersNeeded: r.teachersNeeded ?? '—',
      surplus: r.balance !== null && r.balance > 0 ? r.balance : r.balance === null ? '—' : 0,
      deficit: r.balance !== null && r.balance < 0 ? -r.balance : r.balance === null ? '—' : 0,
    }));
  const n = (k: 'needed' | 'byAppointed' | 'byOthers' | 'uncovered' | 'appointed') => rows.reduce((s, r) => s + r[k], 0);
  const sumNum = (k: 'surplus' | 'deficit') => (per ? rows.reduce((s, r) => s + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0) : '—');
  return {
    id: onlyDeficits ? 'request' : 'surplus',
    title: onlyDeficits ? tx('Request for teachers') : tx('Surplus and deficit'),
    note: per
      ? tx('Periods per week by subject and medium. Teachers needed = periods ÷ {per}, rounded up.', { per })
      : tx('Periods per week by subject and medium. Set "periods per teacher" to see surplus and deficit in teachers.'),
    columns: [
      { key: 'no', label: tx('No.'), numeric: true },
      { key: 'subject', label: tx('Subject') },
      { key: 'medium', label: tx('Medium') },
      { key: 'needed', label: tx('Periods needed'), numeric: true },
      { key: 'byAppointed', label: tx('By appointed teachers'), numeric: true },
      { key: 'byOthers', label: tx('By others'), numeric: true },
      { key: 'uncovered', label: tx('Uncovered'), numeric: true },
      { key: 'appointed', label: tx('Teachers appointed'), numeric: true },
      { key: 'teachersNeeded', label: tx('Teachers needed'), numeric: true },
      { key: 'surplus', label: tx('Surplus'), numeric: true },
      { key: 'deficit', label: tx('Deficit'), numeric: true },
    ],
    rows,
    totals: {
      subject: tx('Total'),
      needed: n('needed'),
      byAppointed: n('byAppointed'),
      byOthers: n('byOthers'),
      uncovered: n('uncovered'),
      appointed: n('appointed'),
      surplus: sumNum('surplus'),
      deficit: sumNum('deficit'),
    },
  };
}

// ------------------------------------------------------ workload summary

/** Duties per teacher across every duty roster. */
export function dutyCounts(p: Project): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of p.dutyRosters) for (const a of r.assignments) m.set(a.teacherId, (m.get(a.teacherId) ?? 0) + 1);
  return m;
}

export function workloadReport(p: Project, date: string): ReportTable {
  const totals = teacherTotals(p);
  const relief = new Map(ledgerRows(p, date).map((r) => [r.teacherId, r]));
  const duties = dutyCounts(p);
  const invig = new Map<string, number>();
  for (const e of p.exams) for (const i of e.invigilation) invig.set(i.teacherId, (invig.get(i.teacherId) ?? 0) + 1);
  const rows = p.teachers
    .filter((t) => t.active)
    .map((t) => {
      const tt = totals.get(t.id);
      const r = relief.get(t.id);
      const periods = tt?.periods ?? 0;
      return {
        name: t.name,
        periods,
        free: Math.max(0, (tt?.capacity ?? 0) - periods),
        status: !tt ? '' : tt.level === 'under' ? tx('Under norm') : tt.level === 'over' ? tx('Over') : tt.level === 'ok' ? tx('OK') : tx('No lessons'),
        reliefWeek: r?.week ?? 0,
        reliefTerm: r?.term ?? 0,
        absentDays: r?.absentDays ?? 0,
        duties: duties.get(t.id) ?? 0,
        invigilation: invig.get(t.id) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const term = rows.map((r) => r.reliefTerm);
  const avg = term.length ? term.reduce((s, x) => s + x, 0) / term.length : 0;
  return {
    id: 'workload',
    title: tx('Teacher workload and relief fairness'),
    note: rows.length
      ? tx('Relief this term: average {toFixed}, highest {max}, lowest {min}. Duties are per week across all duty rosters.', { toFixed: avg.toFixed(1), max: Math.max(...term), min: Math.min(...term) })
      : undefined,
    columns: [
      { key: 'name', label: tx('Teacher') },
      { key: 'periods', label: tx('Periods / week'), numeric: true },
      { key: 'free', label: tx('Free periods'), numeric: true },
      { key: 'status', label: tx('Load') },
      { key: 'reliefWeek', label: tx('Relief this week'), numeric: true },
      { key: 'reliefTerm', label: tx('Relief this term'), numeric: true },
      { key: 'absentDays', label: tx('Days absent (term)'), numeric: true },
      { key: 'duties', label: tx('Duties / week'), numeric: true },
      { key: 'invigilation', label: tx('Invigilation'), numeric: true },
    ],
    rows,
    totals: {
      name: tx('{n} teachers', { n: rows.length }),
      periods: rows.reduce((s, r) => s + r.periods, 0),
      reliefTerm: rows.reduce((s, r) => s + r.reliefTerm, 0),
      duties: rows.reduce((s, r) => s + r.duties, 0),
      invigilation: rows.reduce((s, r) => s + r.invigilation, 0),
    },
  };
}
