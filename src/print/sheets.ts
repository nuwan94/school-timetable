import { scheduleForClass, teacherDays } from '@/domain/checks';
import type { Project } from '@/domain/project';
import type { TimetableVersion } from '@/domain/schedule';
import { classGrid, gridByClock, lessonEntries, mainSchedule, teacherGrid, type Grid, type LessonEntry } from '@/domain/timetable';
import { formatClock, slotsForDay, teachingSlots } from '@/domain/time';
import { changeNotices } from './changeSheets';
import { dayName, LABELS, localName, type Lang } from './labels';

/**
 * Printable sheets as plain data (PLAN.md §9.2). One renderer draws every
 * sheet for screen preview, browser print, image PDF/PNG and the HTML
 * review bundle, so they always look the same.
 */

export type Paper = 'A4P' | 'A4L' | 'A3P' | 'A3L';
export type SheetKind =
  | 'class'
  | 'teacher'
  | 'room'
  | 'masterStaff'
  | 'masterClassDay'
  | 'free'
  | 'classList'
  | 'reliefRegister'
  | 'reliefSlips'
  | 'changeNotice'
  | 'examTimetable'
  | 'invigilation'
  | 'dutyRoster'
  | 'report';

export interface Cell {
  lines: string[];
  muted?: boolean;
}
export type Row = { kind: 'row'; head: Cell; cells: Cell[] } | { kind: 'band'; label: string };

export type Block =
  | { type: 'table'; corner: string; headGroups?: { label: string; span: number }[]; head: string[]; rows: Row[]; compact?: boolean }
  | { type: 'facts'; items: [string, string][] }
  | { type: 'sign'; labels: string[] }
  /** Cut-out slips, two per row. */
  | { type: 'slips'; items: string[][] };

export interface Sheet {
  id: string;
  kind: SheetKind;
  /** Without extension. */
  fileName: string;
  paper: Paper;
  lang: Lang;
  school: string;
  title: string;
  subtitle: string;
  meta: string[];
  draft: boolean;
  blocks: Block[];
}

export const PAPER_MM: Record<Paper, { w: number; h: number }> = {
  A4P: { w: 210, h: 297 },
  A4L: { w: 297, h: 210 },
  A3P: { w: 297, h: 420 },
  A3L: { w: 420, h: 297 },
};
export const MARGIN_MM = 10;

export const SHEET_KINDS: { kind: SheetKind; label: string; perItem: 'class' | 'teacher' | 'room' | null }[] = [
  { kind: 'class', label: 'Class timetables', perItem: 'class' },
  { kind: 'teacher', label: 'Teacher timetables', perItem: 'teacher' },
  { kind: 'room', label: 'Room / lab timetables', perItem: 'room' },
  { kind: 'masterStaff', label: 'Master chart — staff room', perItem: null },
  { kind: 'masterClassDay', label: 'Master chart — classes by day', perItem: null },
  { kind: 'free', label: 'Free-period chart', perItem: null },
  { kind: 'classList', label: 'Section-wise class list', perItem: null },
  { kind: 'changeNotice', label: 'Change notices (mid-year)', perItem: 'teacher' },
];

export interface SheetOptions {
  lang: Lang;
  /** Restrict per-item sheets to these class/teacher/room ids. */
  ids?: string[];
}

/** "10A", "10B", "10C" → "10ABC"; other names are joined with "+". */
export function joinClassNames(names: string[]): string {
  const groups = new Map<string, string[]>();
  const rest: string[] = [];
  for (const n of names) {
    const m = /^(\d+)\s*([A-Za-z])$/.exec(n);
    if (m) groups.set(m[1]!, [...(groups.get(m[1]!) ?? []), m[2]!]);
    else rest.push(n);
  }
  return [...[...groups].map(([g, letters]) => (letters.length > 1 ? g + letters.sort().join('') : g + letters[0])), ...rest].join('+');
}

const safe = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'sheet';

interface Ctx {
  p: Project;
  version: TimetableVersion;
  lang: Lang;
  L: (typeof LABELS)[Lang];
  entries: LessonEntry[];
  school: string;
  meta: string[];
  draft: boolean;
  subject: (id: string) => string;
  teacher: (id: string) => string;
  teacherCode: (id: string) => string;
  className: (id: string) => string;
}

function context(p: Project, version: TimetableVersion, lang: Lang): Ctx {
  const L = LABELS[lang];
  const draft = version.status === 'draft';
  const meta = [
    [p.institute.academicYear, p.institute.term].filter(Boolean).join(' · '),
    version.effectiveFrom ? `${L.effectiveFrom}: ${version.effectiveFrom}` : '',
  ].filter(Boolean);
  return {
    p,
    version,
    lang,
    L,
    entries: lessonEntries(p, version.placements),
    school: localName(p.institute, lang) || p.institute.name,
    meta,
    draft,
    subject: (id) => localName(p.subjects.find((s) => s.id === id), lang),
    teacher: (id) => localName(p.teachers.find((t) => t.id === id), lang),
    teacherCode: (id) => {
      const t = p.teachers.find((x) => x.id === id);
      return t?.shortCode || localName(t, lang);
    },
    className: (id) => localName(p.classes.find((c) => c.id === id), lang),
  };
}

const base = (c: Ctx, kind: SheetKind, id: string, fileName: string, paper: Paper, title: string, subtitle: string): Sheet => ({
  id,
  kind,
  fileName: safe(fileName),
  paper,
  lang: c.lang,
  school: c.school,
  title,
  subtitle,
  meta: c.meta,
  draft: c.draft,
  blocks: [],
});

/** Row heading and band label for a bell slot. */
function rowHead(c: Ctx, label: string, kind: string, start: number, end: number, periodNo: number): Row | { head: Cell } {
  if (kind !== 'period') {
    const band = c.lang === 'en' ? label : kind === 'assembly' ? c.L.assembly : c.L.interval;
    return { kind: 'band', label: `${band}  ${formatClock(start)}–${formatClock(end)}` };
  }
  return { head: { lines: [c.lang === 'en' ? label : String(periodNo), `${formatClock(start)}–${formatClock(end)}`] } };
}

/** Week grid (rows = bell slots, columns = days) with a cell renderer. */
function weekTable(c: Ctx, grid: Grid, cell: (lessons: LessonEntry[]) => Cell): Block {
  const rows: Row[] = [];
  let periodNo = 0;
  for (const row of grid.rows) {
    const first = row.slots.find((s) => !!s)!;
    if (row.kind === 'period') periodNo++;
    const h = rowHead(c, row.label, row.kind, first.start, first.start + first.duration, periodNo);
    if ('kind' in h) {
      rows.push(h);
      continue;
    }
    rows.push({
      kind: 'row',
      head: h.head,
      cells: grid.days.map((d, i) => {
        const s = row.slots[i];
        if (!s || s.kind !== 'period') return { lines: [] };
        return cell(grid.cells.get(`${d}|${s.id}`) ?? []);
      }),
    });
  }
  return { type: 'table', corner: c.L.period, head: grid.days.map((d) => dayName(c.lang, d)), rows };
}

// ------------------------------------------------------------------ per item

function classSheet(c: Ctx, classId: string): Sheet | null {
  const cls = c.p.classes.find((x) => x.id === classId);
  const grid = cls && classGrid(c.p, c.entries, classId);
  if (!cls || !grid) return null;
  const sheet = base(c, 'class', `class:${cls.id}`, `class-${cls.name}`, 'A4P', `${c.L.classTimetable} — ${c.className(cls.id)}`, '');
  const ct = cls.classTeacherId ? c.teacher(cls.classTeacherId) : '';
  sheet.subtitle = [ct && `${c.L.classTeacher}: ${ct}`, `${c.L.medium}: ${c.L.mediumNames[cls.medium]}`].filter(Boolean).join('   ·   ');

  sheet.blocks.push(
    weekTable(c, grid, (lessons) => {
      if (!lessons.length) return { lines: [c.L.selfStudy], muted: true };
      return {
        lines: lessons.flatMap((l) =>
          l.parts.length > 1
            ? l.parts.map((pt) => `${c.subject(pt.subjectId)} – ${pt.teacherIds.map(c.teacherCode).join('/')}`)
            : [c.subject(l.parts[0]!.subjectId), l.uncovered ? `(${c.L.noTeacher})` : l.parts[0]!.teacherIds.map(c.teacher).join(' / ')],
        ),
      };
    }),
  );

  // Subject–teacher list.
  const bySubject = new Map<string, { subject: string; teachers: Set<string>; periods: number }>();
  for (const e of c.entries.filter((x) => x.classIds.includes(classId)))
    for (const pt of e.parts) {
      const k = pt.subjectId;
      const row = bySubject.get(k) ?? { subject: c.subject(pt.subjectId), teachers: new Set<string>(), periods: 0 };
      pt.teacherIds.forEach((t) => row.teachers.add(c.teacher(t)));
      row.periods += e.slotIds.length;
      bySubject.set(k, row);
    }
  sheet.blocks.push({
    type: 'table',
    corner: c.L.subject,
    head: [c.L.teacher, c.L.periods],
    compact: true,
    rows: [...bySubject.values()]
      .sort((a, b) => b.periods - a.periods || a.subject.localeCompare(b.subject))
      .map((r) => ({ kind: 'row', head: { lines: [r.subject] }, cells: [{ lines: [[...r.teachers].join(', ') || c.L.noTeacher] }, { lines: [String(r.periods)] }] })),
  });
  sheet.blocks.push({ type: 'sign', labels: [c.L.classTeacher, c.L.principal] });
  return sheet;
}

function teacherSheet(c: Ctx, teacherId: string): Sheet | null {
  const t = c.p.teachers.find((x) => x.id === teacherId);
  const grid = t && teacherGrid(c.p, c.entries, teacherId);
  if (!t || !grid) return null;
  const sheet = base(c, 'teacher', `teacher:${t.id}`, `teacher-${t.name}`, 'A4P', `${c.L.teacherTimetable} — ${c.teacher(t.id)}`, '');
  sheet.blocks.push(
    weekTable(c, grid, (lessons) => ({
      lines: lessons.flatMap((l) => {
        const own = l.parts.find((pt) => pt.teacherIds.includes(teacherId)) ?? l.parts[0]!;
        return [joinClassNames(l.classIds.map(c.className)), c.subject(own.subjectId) + (own.room ? ` · ${own.room}` : '')];
      }),
    })),
  );
  const mine = c.entries.filter((e) => e.teacherIds.includes(teacherId));
  const taught = new Set(mine.flatMap((e) => e.slotIds.map((s) => `${e.day}|${s}`))).size;
  const schedule = mainSchedule(c.p, mine);
  const available = schedule ? teacherDays(c.p, t).reduce((s, d) => s + teachingSlots(schedule, d).length, 0) : 0;
  sheet.blocks.push({
    type: 'facts',
    items: [
      [c.L.totalPerWeek, String(taught)],
      [c.L.freePerWeek, String(Math.max(0, available - taught))],
    ],
  });
  sheet.blocks.push({ type: 'sign', labels: [c.L.teacher, c.L.principal] });
  return sheet;
}

function roomSheet(c: Ctx, roomId: string): Sheet | null {
  const room = c.p.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const grid = gridByClock(
    c.p,
    c.entries.filter((e) => e.roomIds.includes(roomId)),
  );
  if (!grid) return null;
  const sheet = base(c, 'room', `room:${room.id}`, `room-${room.name}`, 'A4P', `${c.L.roomTimetable} — ${localName(room, c.lang)}`, '');
  sheet.blocks.push(
    weekTable(c, grid, (lessons) => ({
      lines: lessons.flatMap((l) => [joinClassNames(l.classIds.map(c.className)), l.parts.map((pt) => c.subject(pt.subjectId)).join(', ')]),
    })),
  );
  return sheet;
}

// ------------------------------------------------------------------ charts

/** Splits rows into pages, repeating the band (section heading) a page starts inside. */
function paginate(rows: Row[], perPage: number): Row[][] {
  const pages: Row[][] = [];
  let page: Row[] = [];
  let band: Row | null = null;
  for (const r of rows) {
    if (r.kind === 'band') band = r;
    if (page.length >= perPage) {
      pages.push(page);
      page = band && r !== band ? [band] : [];
    }
    page.push(r);
  }
  if (page.length) pages.push(page);
  return pages.length ? pages : [[]];
}

function sectionOfClass(p: Project, classId: string) {
  const cls = p.classes.find((c) => c.id === classId);
  const grade = cls && p.grades.find((g) => g.id === cls.gradeId);
  return p.sections.find((s) => s.id === grade?.sectionId);
}

const periodColumns = (c: Ctx) => {
  const schedule = mainSchedule(c.p, c.entries);
  const days = c.p.institute.workingDays;
  return { schedule, days, perDay: days.map((d) => (schedule ? teachingSlots(schedule, d) : [])) };
};

function masterStaff(c: Ctx): Sheet[] {
  const { days, perDay } = periodColumns(c);
  const groups = new Map<string, { name: string; order: number; teachers: string[] }>();
  for (const t of c.p.teachers.filter((x) => x.active)) {
    const counts = new Map<string, number>();
    for (const e of c.entries) if (e.teacherIds.includes(t.id)) {
      const s = sectionOfClass(c.p, e.classIds[0]!);
      if (s) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
    }
    const sid = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const s = c.p.sections.find((x) => x.id === sid);
    const g = groups.get(sid) ?? { name: s ? localName(s, c.lang) : '—', order: s?.order ?? 999, teachers: [] };
    g.teachers.push(t.id);
    groups.set(sid, g);
  }
  const rows: Row[] = [];
  const multi = groups.size > 1;
  for (const g of [...groups.values()].sort((a, b) => a.order - b.order)) {
    if (multi) rows.push({ kind: 'band', label: g.name });
    for (const tid of g.teachers.sort((a, b) => c.teacher(a).localeCompare(c.teacher(b)))) {
      const mine = c.entries.filter((e) => e.teacherIds.includes(tid));
      const cells: Cell[] = [];
      days.forEach((d, i) => {
        for (const s of perDay[i]!) {
          const hit = mine.filter((e) => e.day === d && e.start < s.start + s.duration && s.start < e.end);
          cells.push({ lines: hit.length ? [hit.map((e) => joinClassNames(e.classIds.map(c.className))).join(' / ')] : [] });
        }
      });
      const total = mine.reduce((n, e) => n + e.slotIds.length, 0);
      rows.push({ kind: 'row', head: { lines: [`${c.teacher(tid)}`, `${c.teacherCode(tid)} · ${total}`] }, cells });
    }
  }
  const pages = paginate(rows, 26);
  return pages.map((pageRows, i) => {
    const sheet = base(c, 'masterStaff', `masterStaff:${i}`, `master-staff-${i + 1}`, 'A3L', c.L.masterStaff, pages.length > 1 ? `${c.L.page} ${i + 1} / ${pages.length}` : '');
    sheet.blocks.push({
      type: 'table',
      corner: c.L.teacher,
      headGroups: days.map((d, k) => ({ label: dayName(c.lang, d), span: perDay[k]!.length })),
      head: perDay.flatMap((slots) => slots.map((_, n) => String(n + 1))),
      rows: pageRows,
      compact: true,
    });
    return sheet;
  });
}

function masterClassDay(c: Ctx): Sheet[] {
  const out: Sheet[] = [];
  const classes = [...c.p.classes].sort((a, b) => {
    const sa = sectionOfClass(c.p, a.id)?.order ?? 0;
    const sb = sectionOfClass(c.p, b.id)?.order ?? 0;
    return sa - sb || a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  for (const day of c.p.institute.workingDays) {
    const rows: Row[] = [];
    let section = '';
    let width = 0;
    for (const cls of classes) {
      const sec = sectionOfClass(c.p, cls.id);
      if (c.p.sections.length > 1 && sec && sec.id !== section) {
        section = sec.id;
        rows.push({ kind: 'band', label: localName(sec, c.lang) });
      }
      const schedule = scheduleForClass(c.p, cls);
      const slots = schedule ? teachingSlots(schedule, day) : [];
      width = Math.max(width, slots.length);
      const mine = c.entries.filter((e) => e.day === day && e.classIds.includes(cls.id));
      rows.push({
        kind: 'row',
        head: { lines: [c.className(cls.id)] },
        cells: slots.map((s) => {
          const hit = mine.filter((e) => e.slotIds.includes(s.id));
          if (!hit.length) return { lines: ['—'], muted: true };
          return {
            lines: hit.flatMap((e) =>
              e.parts.length > 1
                ? [c.lang === 'en' ? e.title : c.subject(e.parts[0]!.subjectId) + '…']
                : [c.p.subjects.find((x) => x.id === e.parts[0]!.subjectId)?.shortCode || c.subject(e.parts[0]!.subjectId), e.parts[0]!.teacherIds.map(c.teacherCode).join('/')],
            ),
          };
        }),
      });
    }
    const pages = paginate(rows, 30);
    pages.forEach((pageRows, i) => {
      const sheet = base(
        c,
        'masterClassDay',
        `masterClassDay:${day}:${i}`,
        `master-classes-${day}${pages.length > 1 ? `-${i + 1}` : ''}`,
        width > 9 ? 'A3L' : 'A4L',
        `${c.L.masterClassDay} — ${dayName(c.lang, day)}`,
        pages.length > 1 ? `${c.L.page} ${i + 1} / ${pages.length}` : '',
      );
      sheet.blocks.push({
        type: 'table',
        corner: c.L.class,
        head: Array.from({ length: width }, (_, n) => String(n + 1)),
        rows: pageRows,
        compact: true,
      });
      out.push(sheet);
    });
  }
  return out;
}

function freeChart(c: Ctx): Sheet[] {
  const { schedule, days } = periodColumns(c);
  if (!schedule) return [];
  const teachers = c.p.teachers.filter((t) => t.active);
  const grid: Grid = { days: [...days], rows: [], cells: new Map() };
  const perDay = days.map((d) => slotsForDay(schedule, d));
  const longest = perDay.reduce((a, b) => (b.length > a.length ? b : a), []);
  grid.rows = longest.map((s, i) => ({ label: s.label, kind: s.kind, slots: perDay.map((l) => l[i]) }));
  const sheet = base(c, 'free', 'free', 'free-periods', 'A4L', c.L.freePeriods, c.L.freeTeachers);
  const block = weekTable(c, grid, () => ({ lines: [] }));
  // Fill cells with free teachers (the week table gave empty cells in the right shape).
  if (block.type === 'table') {
    let r = 0;
    for (const row of grid.rows) {
      const tr = block.rows[r++]!;
      if (row.kind !== 'period' || tr.kind !== 'row') continue;
      tr.cells = days.map((d, i) => {
        const s = row.slots[i];
        if (!s || s.kind !== 'period') return { lines: [] };
        const free = teachers.filter(
          (t) =>
            teacherDays(c.p, t).includes(d) &&
            !c.entries.some((e) => e.day === d && e.teacherIds.includes(t.id) && e.start < s.start + s.duration && s.start < e.end),
        );
        return { lines: [free.map((t) => c.teacherCode(t.id)).join(', ')] };
      });
    }
    block.compact = true;
  }
  sheet.blocks.push(block);
  return [sheet];
}

function classList(c: Ctx): Sheet[] {
  const sheet = base(c, 'classList', 'classList', 'class-list', 'A4P', c.L.classList, '');
  const rows: Row[] = [];
  for (const sec of [...c.p.sections].sort((a, b) => a.order - b.order)) {
    const grades = c.p.grades.filter((g) => g.sectionId === sec.id).sort((a, b) => a.level - b.level);
    const classes = grades.flatMap((g) =>
      c.p.classes.filter((x) => x.gradeId === g.id).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    );
    if (!classes.length) continue;
    rows.push({ kind: 'band', label: localName(sec, c.lang) });
    for (const cls of classes)
      rows.push({
        kind: 'row',
        head: { lines: [c.className(cls.id)] },
        cells: [
          { lines: [cls.classTeacherId ? c.teacher(cls.classTeacherId) : '—'] },
          { lines: [c.L.mediumNames[cls.medium]] },
          { lines: [cls.studentCount ? String(cls.studentCount) : ''] },
        ],
      });
  }
  sheet.blocks.push({ type: 'table', corner: c.L.class, head: [c.L.classTeacher, c.L.medium, c.L.students], rows, compact: true });
  return [sheet];
}

// ------------------------------------------------------------------ entry

export function buildSheets(p: Project, version: TimetableVersion, kind: SheetKind, opts: SheetOptions): Sheet[] {
  const c = context(p, version, opts.lang);
  const pick = <T extends { id: string }>(list: T[]) => (opts.ids ? list.filter((x) => opts.ids!.includes(x.id)) : list);
  const sortedClasses = [...p.classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  switch (kind) {
    case 'class':
      return pick(sortedClasses).flatMap((x) => classSheet(c, x.id) ?? []);
    case 'teacher':
      return pick([...p.teachers].filter((t) => t.active).sort((a, b) => a.name.localeCompare(b.name))).flatMap((x) => teacherSheet(c, x.id) ?? []);
    case 'room':
      return pick(p.rooms).flatMap((x) => roomSheet(c, x.id) ?? []);
    case 'masterStaff':
      return masterStaff(c);
    case 'masterClassDay':
      return masterClassDay(c);
    case 'free':
      return freeChart(c);
    case 'classList':
      return classList(c);
    case 'changeNotice':
      return changeNotices(p, version, opts.lang, opts.ids);
    case 'reliefRegister':
    case 'reliefSlips':
    case 'examTimetable':
    case 'invigilation':
    case 'dutyRoster':
    case 'report':
      return []; // built per date / exam series in reliefSheets.ts and examSheets.ts
  }
}
