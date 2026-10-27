import type { Project } from '@/domain/project';
import { coverNeeds, dayContext, needKey, type CoverNeed } from '@/domain/relief';
import type { ReliefAssignment } from '@/domain/schedule';
import { formatClock } from '@/domain/time';
import { dayName, LABELS, localName, type Lang } from './labels';
import type { Row, Sheet } from './sheets';

/**
 * Daily relief outputs (PLAN.md §8 step 5): the relief register in the
 * usual register layout (with a signature column) and cut-out slips.
 * Both go through the same PDF/PNG pipeline as the timetable sheets.
 */

export interface ReliefLine {
  need: CoverNeed;
  assignment: ReliefAssignment | undefined;
  period: string;
  className: string;
  subject: string;
  absent: string;
  relief: string;
}

export function reliefLines(p: Project, date: string, lang: Lang): ReliefLine[] {
  const L = LABELS[lang];
  const ctx = dayContext(p, date);
  const byKey = new Map(p.relief.filter((r) => r.date === date).map((r) => [needKey(r), r]));
  const teacher = (id: string | null) => localName(p.teachers.find((t) => t.id === id), lang);
  const cls = (id: string | null) => localName(p.classes.find((c) => c.id === id), lang);
  let n = 0;
  const periodNo = new Map<number, number>();
  return coverNeeds(p, ctx).map((need) => {
    if (!periodNo.has(need.start)) periodNo.set(need.start, ++n);
    const a = byKey.get(need.key);
    const where = a?.note === 'Library' ? L.library : a?.note === 'Ground' ? L.ground : a?.note;
    const relief = !a
      ? `— (${L.notCovered})`
      : a.kind === 'combine'
        ? `${L.combineWith} ${cls(a.combineWithGroupId)}${a.reliefTeacherId ? ` · ${teacher(a.reliefTeacherId)}` : ''}`
        : a.kind === 'supervised'
          ? `${where || L.supervised} · ${teacher(a.reliefTeacherId)}`
          : a.kind === 'classTeacher'
            ? `${teacher(a.reliefTeacherId)} (${L.classTeacher})`
            : teacher(a.reliefTeacherId);
    return {
      need,
      assignment: a,
      period: `${lang === 'en' ? need.slotLabel : String(periodNo.get(need.start))}  ${formatClock(need.start)}–${formatClock(need.end)}`,
      className: need.classIds.map(cls).join('+'),
      subject: localName(p.subjects.find((s) => s.id === need.subjectId), lang),
      absent: teacher(need.absentTeacherId),
      relief,
    };
  });
}

function header(p: Project, date: string, lang: Lang, title: string, kind: Sheet['kind'], id: string): Sheet {
  const ctx = dayContext(p, date);
  return {
    id,
    kind,
    fileName: `${kind === 'reliefRegister' ? 'relief-register' : 'relief-slips'}-${date}`,
    paper: 'A4P',
    lang,
    school: localName(p.institute, lang) || p.institute.name,
    title,
    subtitle: `${date} · ${dayName(lang, ctx.day)}`,
    meta: [],
    draft: false,
    blocks: [],
  };
}

export function reliefRegister(p: Project, date: string, lang: Lang): Sheet {
  const L = LABELS[lang];
  const sheet = header(p, date, lang, L.reliefRegister, 'reliefRegister', `reliefRegister:${date}`);
  const ctx = dayContext(p, date);
  const absent = [...ctx.absent.values()].map((a) => {
    const name = localName(p.teachers.find((t) => t.id === a.teacherId), lang);
    return a.wholeDay ? name : `${name} (${a.slotIds.length})`;
  });
  if (absent.length) sheet.blocks.push({ type: 'facts', items: [[L.absentToday, absent.join(', ')]] });
  const rows: Row[] = reliefLines(p, date, lang).map((l) => ({
    kind: 'row',
    head: { lines: l.period.split('  ') },
    cells: [{ lines: [l.className] }, { lines: [l.subject] }, { lines: [l.absent] }, { lines: [l.relief], muted: !l.assignment }, { lines: [''] }],
  }));
  sheet.blocks.push({ type: 'table', corner: L.period, head: [L.class, L.subject, L.absentTeacher, L.reliefTeacher, L.signature], rows });
  sheet.blocks.push({ type: 'sign', labels: [L.principal] });
  return sheet;
}

/** Eight slips per A4 page, one per covered period. */
export function reliefSlips(p: Project, date: string, lang: Lang): Sheet[] {
  const L = LABELS[lang];
  const items = reliefLines(p, date, lang)
    .filter((l) => l.assignment)
    .map((l) => [
      `${L.reliefSlip} — ${date}`,
      `${L.period}: ${l.period}`,
      `${L.class}: ${l.className} · ${l.subject}`,
      `${L.insteadOf}: ${l.absent}`,
      `${L.reliefTeacher}: ${l.relief}`,
      `${L.signature}: ....................`,
    ]);
  const pages: Sheet[] = [];
  for (let i = 0; i < Math.max(items.length, 1); i += 8) {
    const sheet = header(p, date, lang, L.reliefSlip, 'reliefSlips', `reliefSlips:${date}:${i / 8}`);
    sheet.fileName += pages.length ? `-${pages.length + 1}` : '';
    sheet.blocks.push({ type: 'slips', items: items.slice(i, i + 8) });
    pages.push(sheet);
  }
  return pages;
}
