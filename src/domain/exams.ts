import type { Draft } from 'immer';
import { newId } from './common';
import type { Project } from './project';
import { dayContext, isAbsentAt, type DayContext } from './relief';
import type { ExamPaper, ExamSeries, ExamSession, Invigilation } from './schedule';
import { classIdsOfGroups } from './timetable';
import { joinAnd, tx } from '@/i18n';

/**
 * Term-test mode (PLAN.md §8.5): a paper grid by date and session, fair
 * invigilation duties, and clash checks. The weekly timetable is untouched;
 * an overlay tells daily relief which classes are sitting papers.
 */

export const DEFAULT_SESSIONS: Omit<ExamSession, 'id'>[] = [
  { get label() { return tx('Morning'); }, start: 8 * 60, end: 10 * 60 },
  { get label() { return tx('Mid-day'); }, start: 10 * 60 + 30, end: 12 * 60 + 30 },
];

export function makeExamSeries(input: { name: string; from: string; to: string }): ExamSeries {
  return {
    id: newId('exam'),
    name: input.name,
    from: input.from,
    to: input.to,
    sessions: DEFAULT_SESSIONS.map((s) => ({ ...s, id: newId('ses') })),
    papers: [],
    invigilation: [],
  };
}

/** Every school date in the series (working days that are not holidays). */
export function examDates(p: Project, s: Pick<ExamSeries, 'from' | 'to'>): string[] {
  const out: string[] = [];
  if (!s.from || !s.to || s.to < s.from) return out;
  for (let d = new Date(`${s.from}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > s.to || out.length > 120) break;
    if (!dayContext(p, iso).closed) out.push(iso);
  }
  return out;
}

const slotKey = (pp: Pick<ExamPaper, 'date' | 'sessionId'>) => `${pp.date}|${pp.sessionId}`;

/** Teachers who teach this subject to this class (they should not invigilate their own paper). */
function ownTeachers(p: Project, subjectId: string, classId: string): Set<string> {
  const out = new Set<string>();
  for (const a of p.allocations)
    if (a.subjectId === subjectId && classIdsOfGroups(p, a.groupIds).includes(classId)) a.teacherIds.forEach((t) => out.add(t));
  for (const b of p.optionBlocks)
    if (b.classIds.includes(classId))
      for (const l of b.lines) for (const st of l.sets) if (st.subjectId === subjectId) st.teacherIds.forEach((t) => out.add(t));
  return out;
}

function contexts(p: Project) {
  const cache = new Map<string, DayContext>();
  return (date: string) => {
    let c = cache.get(date);
    if (!c) cache.set(date, (c = dayContext(p, date)));
    return c;
  };
}

/**
 * Fills missing invigilators: for each paper and class, the present teacher
 * with the fewest duties so far who does not teach that subject to that class
 * and is not already invigilating in that session. Existing duties are kept.
 */
export function autoInvigilate(p: Project, series: ExamSeries): Invigilation[] {
  const ctx = contexts(p);
  const sessions = new Map(series.sessions.map((s) => [s.id, s]));
  const kept = series.invigilation.filter((i) => series.papers.some((pp) => pp.id === i.paperId && pp.classIds.includes(i.classId)));
  const load = new Map<string, number>();
  const busy = new Set<string>();
  const paperOf = new Map(series.papers.map((pp) => [pp.id, pp]));
  for (const i of kept) {
    load.set(i.teacherId, (load.get(i.teacherId) ?? 0) + 1);
    busy.add(`${slotKey(paperOf.get(i.paperId)!)}|${i.teacherId}`);
  }
  const out = [...kept];
  const teachers = p.teachers.filter((t) => t.active);
  const papers = [...series.papers].sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
  for (const pp of papers) {
    const s = sessions.get(pp.sessionId);
    for (const classId of pp.classIds) {
      if (out.some((i) => i.paperId === pp.id && i.classId === classId)) continue;
      const own = ownTeachers(p, pp.subjectId, classId);
      const c = ctx(pp.date);
      const pick = teachers
        .filter((t) => !own.has(t.id) && !busy.has(`${slotKey(pp)}|${t.id}`) && !(s && isAbsentAt(c, t.id, s)))
        .sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.name.localeCompare(b.name))[0];
      if (!pick) continue;
      out.push({ paperId: pp.id, classId, teacherId: pick.id });
      load.set(pick.id, (load.get(pick.id) ?? 0) + 1);
      busy.add(`${slotKey(pp)}|${pick.id}`);
    }
  }
  return out;
}

export interface ExamClash {
  kind: 'classTwice' | 'invigilatorTwice' | 'invigilatorAbsent' | 'ownSubject' | 'noInvigilator' | 'outsideDates';
  message: string;
  paperIds: string[];
}

export function examClashes(p: Project, series: ExamSeries): ExamClash[] {
  const out: ExamClash[] = [];
  const ctx = contexts(p);
  const cls = (id: string) => p.classes.find((c) => c.id === id)?.name ?? '?';
  const sub = (id: string) => p.subjects.find((s) => s.id === id)?.name ?? '?';
  const tea = (id: string) => p.teachers.find((t) => t.id === id)?.name ?? '?';
  const ses = (id: string) => series.sessions.find((s) => s.id === id);
  const at = (pp: ExamPaper) => `${pp.date} ${ses(pp.sessionId)?.label ?? ''}`.trim();

  const byClassSlot = new Map<string, ExamPaper[]>();
  for (const pp of series.papers) {
    if (pp.date < series.from || pp.date > series.to)
      out.push({
        kind: 'outsideDates',
        message: tx('{sub} on {date} is outside {from} – {to}', { sub: sub(pp.subjectId), date: pp.date, from: series.from, to: series.to }),
        paperIds: [pp.id],
      });
    for (const c of pp.classIds) {
      const k = `${slotKey(pp)}|${c}`;
      byClassSlot.set(k, [...(byClassSlot.get(k) ?? []), pp]);
    }
  }
  for (const [k, list] of byClassSlot)
    if (list.length > 1)
      out.push({
        kind: 'classTwice',
        message: tx('{cls} has {join} at the same time ({at})', { cls: cls(k.split('|')[2]!), join: joinAnd(list.map((x) => sub(x.subjectId))), at: at(list[0]!) }),
        paperIds: list.map((x) => x.id),
      });

  const paperOf = new Map(series.papers.map((pp) => [pp.id, pp]));
  const byTeacherSlot = new Map<string, Invigilation[]>();
  for (const i of series.invigilation) {
    const pp = paperOf.get(i.paperId);
    if (!pp) continue;
    const k = `${slotKey(pp)}|${i.teacherId}`;
    byTeacherSlot.set(k, [...(byTeacherSlot.get(k) ?? []), i]);
    const s = ses(pp.sessionId);
    if (s && isAbsentAt(ctx(pp.date), i.teacherId, s))
      out.push({
        kind: 'invigilatorAbsent',
        message: tx('{tea} is absent on {date} but invigilates {cls}', { tea: tea(i.teacherId), date: pp.date, cls: cls(i.classId) }),
        paperIds: [pp.id],
      });
    if (ownTeachers(p, pp.subjectId, i.classId).has(i.teacherId))
      out.push({
        kind: 'ownSubject',
        message: tx('{tea} invigilates their own {sub} paper for {cls}', { tea: tea(i.teacherId), sub: sub(pp.subjectId), cls: cls(i.classId) }),
        paperIds: [pp.id],
      });
  }
  for (const [k, list] of byTeacherSlot)
    if (list.length > 1)
      out.push({
        kind: 'invigilatorTwice',
        message: tx('{tea} invigilates {join} at the same time', { tea: tea(k.split('|')[2]!), join: joinAnd(list.map((i) => cls(i.classId))) }),
        paperIds: [...new Set(list.map((i) => i.paperId))],
      });
  for (const pp of series.papers)
    for (const c of pp.classIds)
      if (!series.invigilation.some((i) => i.paperId === pp.id && i.classId === c))
        out.push({
          kind: 'noInvigilator',
          message: tx('{sub} {cls} ({at}) has no invigilator', { sub: sub(pp.subjectId), cls: cls(c), at: at(pp) }),
          paperIds: [pp.id],
        });
  return out;
}

/** Duties per teacher, for the fairness summary. */
export function invigilationLoad(series: ExamSeries): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of series.invigilation) m.set(i.teacherId, (m.get(i.teacherId) ?? 0) + 1);
  return m;
}

/** Adds (or refreshes) a calendar event for the series: the sitting classes are away from normal lessons. */
export function examOverlay(d: Draft<Project>, series: ExamSeries): void {
  const id = `ovl_${series.id}`;
  const classIds = [...new Set(series.papers.flatMap((pp) => pp.classIds))];
  const existing = d.overlays.find((o) => o.id === id);
  const data = {
    name: series.name,
    kind: 'termTest' as const,
    from: series.from,
    to: series.to,
    removedGroupIds: classIds,
  };
  if (existing) Object.assign(existing, data);
  else
    d.overlays.push({
      id,
      shortCode: '',
      local: {},
      active: true,
      blockedRoomIds: [],
      absentTeacherIds: [],
      note: '',
      ...data,
    });
}
