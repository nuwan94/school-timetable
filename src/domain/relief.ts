import { teacherDays } from './checks';
import { newId } from './common';
import type { Project } from './project';
import { numParam, ruleFor } from './rules';
import type { Absence, ReliefAssignment, TimetableVersion } from './schedule';
import { classIdsOfGroups, lessonEntries, type LessonEntry } from './timetable';
import { slotsForDay, type BellSlot, type Weekday } from './time';

/**
 * Daily relief (PLAN.md §8, §3.10): who is away on a date, which lessons
 * need cover, who can take them (ranked for fairness), and the ledger.
 * Pure functions over the project, so the Today screen stays thin.
 */

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_MS = 86_400_000;

const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10);
export const weekdayOf = (iso: string): Weekday => WEEKDAYS[new Date(toTime(iso)).getUTCDay()]!;
export const addDays = (iso: string, n: number) => isoDate(toTime(iso) + n * DAY_MS);
/** Monday of the week containing `iso`. */
export const weekStart = (iso: string) => addDays(iso, -((new Date(toTime(iso)).getUTCDay() + 6) % 7));

/** The timetable in force on a date: latest approved effective by then, else the active version. */
export function timetableFor(p: Project, date: string): TimetableVersion | undefined {
  const approved = p.versions
    .filter((v) => v.status !== 'draft' && (!v.effectiveFrom || v.effectiveFrom <= date))
    .sort((a, b) => (a.effectiveFrom ?? '').localeCompare(b.effectiveFrom ?? '') || a.createdAt.localeCompare(b.createdAt));
  const inForce = approved.filter((v) => v.status === 'approved').pop() ?? approved.pop();
  return inForce ?? p.versions.find((v) => v.id === p.activeVersionId);
}

// ------------------------------------------------------------------ absences

export type AbsenceSource = { kind: 'manual' | 'recurring'; absenceId: string; reason: string } | { kind: 'overlay'; overlayId: string; reason: string };

export interface AbsentInfo {
  teacherId: string;
  wholeDay: boolean;
  /** Clock intervals away (when not the whole day). */
  intervals: { start: number; end: number }[];
  slotIds: string[];
  sources: AbsenceSource[];
  /** Long leave: the named cover teacher, suggested first. */
  coverTeacherId: string | null;
}

/** Does an absence (or recurrence) cover this date? */
export function absenceOn(a: Absence, date: string): boolean {
  if (!a.recurrence) return a.from <= date && date <= a.to;
  const r = a.recurrence;
  if (weekdayOf(date) !== r.day || date < r.from || (r.to && date > r.to)) return false;
  const weeks = Math.round((toTime(weekStart(date)) - toTime(weekStart(r.from))) / (7 * DAY_MS));
  return weeks % r.everyWeeks === 0;
}

function slotById(p: Project, day: Weekday): Map<string, BellSlot> {
  const m = new Map<string, BellSlot>();
  for (const b of p.bellSchedules) for (const s of slotsForDay(b, day)) m.set(s.id, s);
  return m;
}

export interface DayContext {
  date: string;
  day: Weekday;
  /** Why there is no school (holiday overlay / not a working day), else null. */
  closed: string | null;
  version: TimetableVersion | undefined;
  /** Lessons on this weekday, minus classes that are away. */
  entries: LessonEntry[];
  absent: Map<string, AbsentInfo>;
  /** Classes away (exams, trips): their lessons need no cover and free their teachers. */
  removedClasses: Set<string>;
}

export function dayContext(p: Project, date: string): DayContext {
  const day = weekdayOf(date);
  const overlays = p.overlays.filter((o) => o.from <= date && date <= o.to);
  const holiday = overlays.find((o) => o.kind === 'holiday');
  const closed = holiday ? holiday.name || 'Holiday' : !p.institute.workingDays.includes(day) ? 'Not a school day' : null;
  const version = timetableFor(p, date);
  const removedClasses = new Set(overlays.flatMap((o) => classIdsOfGroups(p, o.removedGroupIds)));
  const entries = (version ? lessonEntries(p, version.placements) : []).filter(
    (e) => e.day === day && !e.classIds.every((c) => removedClasses.has(c)),
  );

  const slots = slotById(p, day);
  const absent = new Map<string, AbsentInfo>();
  const info = (teacherId: string) => {
    let a = absent.get(teacherId);
    if (!a) absent.set(teacherId, (a = { teacherId, wholeDay: false, intervals: [], slotIds: [], sources: [], coverTeacherId: null }));
    return a;
  };
  for (const a of p.absences) {
    if (!absenceOn(a, date)) continue;
    const x = info(a.teacherId);
    x.sources.push({ kind: a.recurrence ? 'recurring' : 'manual', absenceId: a.id, reason: a.reason });
    if (a.coverTeacherId) x.coverTeacherId = a.coverTeacherId;
    if (!a.slotIds.length) x.wholeDay = true;
    for (const id of a.slotIds) {
      const s = slots.get(id);
      if (!s) continue;
      x.slotIds.push(id);
      x.intervals.push({ start: s.start, end: s.start + s.duration });
    }
  }
  for (const o of overlays)
    for (const t of o.absentTeacherIds) {
      const x = info(t);
      x.wholeDay = true;
      x.sources.push({ kind: 'overlay', overlayId: o.id, reason: o.name });
    }
  return { date, day, closed, version, entries, absent, removedClasses };
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

export function isAbsentAt(ctx: DayContext, teacherId: string, at: { start: number; end: number }): boolean {
  const a = ctx.absent.get(teacherId);
  return !!a && (a.wholeDay || a.intervals.some((i) => overlaps(i, at)));
}

// ------------------------------------------------------------------ needs

export interface CoverNeed {
  /** `${itemId}|${slotId}|${absentTeacherId}` — one per period, per absent teacher. */
  key: string;
  itemId: string;
  slotId: string;
  slotLabel: string;
  start: number;
  end: number;
  classIds: string[];
  subjectId: string;
  absentTeacherId: string;
  entry: LessonEntry;
}

export const needKey = (a: Pick<ReliefAssignment, 'itemId' | 'slotId' | 'absentTeacherId'>) => `${a.itemId}|${a.slotId}|${a.absentTeacherId}`;

export function coverNeeds(p: Project, ctx: DayContext): CoverNeed[] {
  if (ctx.closed) return [];
  const slots = slotById(p, ctx.day);
  const out: CoverNeed[] = [];
  for (const e of ctx.entries)
    for (const slotId of e.slotIds) {
      const s = slots.get(slotId);
      if (!s) continue;
      const at = { start: s.start, end: s.start + s.duration };
      for (const t of e.teacherIds) {
        if (!isAbsentAt(ctx, t, at)) continue;
        const part = e.parts.find((pt) => pt.teacherIds.includes(t)) ?? e.parts[0]!;
        out.push({
          key: `${e.itemId}|${slotId}|${t}`,
          itemId: e.itemId,
          slotId,
          slotLabel: s.label,
          ...at,
          classIds: e.classIds,
          subjectId: part.subjectId,
          absentTeacherId: t,
          entry: e,
        });
      }
    }
  return out.sort((a, b) => a.start - b.start || a.classIds.join().localeCompare(b.classIds.join()));
}

// ------------------------------------------------------------------ ranking

export interface Ledger {
  week: Map<string, number>;
  term: Map<string, number>;
  termFrom: string;
}

const counts = (list: ReliefAssignment[], from: string, to: string) => {
  const m = new Map<string, number>();
  for (const r of list) if (r.reliefTeacherId && r.date >= from && r.date <= to) m.set(r.reliefTeacherId, (m.get(r.reliefTeacherId) ?? 0) + 1);
  return m;
};

/** Relief counts per teacher for the week and term containing `date`. */
export function ledger(p: Project, date: string, relief: ReliefAssignment[] = p.relief): Ledger {
  const ws = weekStart(date);
  const termFrom = p.institute.termStart && p.institute.termStart <= date ? p.institute.termStart : addDays(ws, -7 * 12);
  return { week: counts(relief, ws, addDays(ws, 6)), term: counts(relief, termFrom, addDays(ws, 6)), termFrom };
}

export interface Candidate {
  teacherId: string;
  name: string;
  week: number;
  term: number;
  /** Periods taught + relief already that day. */
  load: number;
  teachesClass: boolean;
  teachesSubject: boolean;
  sameDepartment: boolean;
  /** Named cover for this absent teacher's long leave. */
  designated: boolean;
}

/** Teachers who are at school, free at that time and under the daily maximum — best first. */
export function candidates(p: Project, ctx: DayContext, need: CoverNeed, relief: ReliefAssignment[] = p.relief): Candidate[] {
  const max = numParam(ruleFor(p, 'R12'), 'maxPerDay', 7);
  const today = relief.filter((r) => r.date === ctx.date);
  const slots = slotById(p, ctx.day);
  const reliefAt = (r: ReliefAssignment) => {
    const s = slots.get(r.slotId);
    return s ? { start: s.start, end: s.start + s.duration } : null;
  };
  const absentTeacher = p.teachers.find((t) => t.id === need.absentTeacherId);
  const L = ledger(p, ctx.date, relief);
  const out: Candidate[] = [];
  for (const t of p.teachers) {
    if (!t.active || t.id === need.absentTeacherId) continue;
    if (!teacherDays(p, t).includes(ctx.day)) continue;
    if (isAbsentAt(ctx, t.id, need)) continue;
    if (t.windows.length && !t.windows.some((w) => w.day === ctx.day && w.start <= need.start && need.end <= w.end)) continue;
    if (t.unavailable.some((w) => w.day === ctx.day && overlaps(w, need))) continue;
    const mine = ctx.entries.filter((e) => e.teacherIds.includes(t.id));
    if (mine.some((e) => overlaps(e, need))) continue;
    const myRelief = today.filter((r) => r.reliefTeacherId === t.id);
    if (myRelief.some((r) => needKey(r) !== need.key && overlapsOrNull(reliefAt(r), need))) continue;
    const load = mine.reduce((n, e) => n + e.slotIds.length, 0) + myRelief.filter((r) => needKey(r) !== need.key).length;
    if (load >= max) continue;
    out.push({
      teacherId: t.id,
      name: t.name,
      week: L.week.get(t.id) ?? 0,
      term: L.term.get(t.id) ?? 0,
      load,
      teachesClass: ctx.version ? lessonsOf(p, ctx.version, t.id).some((e) => e.classIds.some((c) => need.classIds.includes(c))) : false,
      teachesSubject: t.subjectIds.includes(need.subjectId),
      sameDepartment: !!t.department && t.department === absentTeacher?.department,
      designated: ctx.absent.get(need.absentTeacherId)?.coverTeacherId === t.id,
    });
  }
  return out.sort(
    (a, b) =>
      Number(b.designated) - Number(a.designated) ||
      a.week - b.week ||
      a.term - b.term ||
      Number(b.teachesClass) - Number(a.teachesClass) ||
      Number(b.teachesSubject) - Number(a.teachesSubject) ||
      Number(b.sameDepartment) - Number(a.sameDepartment) ||
      a.load - b.load ||
      a.name.localeCompare(b.name),
  );
}

const overlapsOrNull = (a: { start: number; end: number } | null, b: { start: number; end: number }) => !a || overlaps(a, b);

const weekLessons = new WeakMap<TimetableVersion, Map<string, LessonEntry[]>>();
/** A teacher's lessons across the week (cached per version). */
function lessonsOf(p: Project, v: TimetableVersion, teacherId: string): LessonEntry[] {
  let m = weekLessons.get(v);
  if (!m) {
    m = new Map();
    for (const e of lessonEntries(p, v.placements)) for (const t of e.teacherIds) m.set(t, [...(m.get(t) ?? []), e]);
    weekLessons.set(v, m);
  }
  return m.get(teacherId) ?? [];
}

// ------------------------------------------------------------------ alternatives

export interface Alternative {
  kind: 'classTeacher' | 'combine' | 'supervised';
  label: string;
  reliefTeacherId: string | null;
  combineWithGroupId: string | null;
  note: string;
}

/** Other ways to cover a lesson when no relief teacher is wanted or free. */
export function alternatives(p: Project, ctx: DayContext, need: CoverNeed, relief: ReliefAssignment[] = p.relief): Alternative[] {
  const out: Alternative[] = [];
  const free = candidates(p, ctx, need, relief);
  const cls = p.classes.find((c) => c.id === need.classIds[0]);
  const name = (id: string) => p.teachers.find((t) => t.id === id)?.name ?? '?';

  if (need.classIds.length === 1 && cls?.classTeacherId && free.some((c) => c.teacherId === cls.classTeacherId))
    out.push({ kind: 'classTeacher', label: `Class teacher (${name(cls.classTeacherId)})`, reliefTeacherId: cls.classTeacherId, combineWithGroupId: null, note: '' });

  // Neighbouring classes with a teacher present at the same time — same grade first.
  if (cls) {
    const others = ctx.entries
      .filter((e) => overlaps(e, need) && !e.classIds.some((c) => need.classIds.includes(c)) && e.classIds.length === 1)
      .filter((e) => e.teacherIds.length > 0 && e.teacherIds.every((t) => !isAbsentAt(ctx, t, need)))
      .map((e) => ({ e, other: p.classes.find((c) => c.id === e.classIds[0])! }))
      .filter((x) => !!x.other && x.other.medium === cls.medium)
      .sort((a, b) => Number(b.other.gradeId === cls.gradeId) - Number(a.other.gradeId === cls.gradeId) || a.other.name.localeCompare(b.other.name));
    for (const { e, other } of others.filter((x) => x.other.gradeId === cls.gradeId).slice(0, 3))
      out.push({
        kind: 'combine',
        label: `Combine with ${other.name} (${e.parts[0]?.subject ?? e.title}, ${e.teacherIds.map(name).join('/')})`,
        reliefTeacherId: e.teacherIds[0] ?? null,
        combineWithGroupId: other.id,
        note: '',
      });
  }

  // Library / ground: a supervisor who is free, or already supervising then.
  const supervising = relief.find((r) => r.date === ctx.date && r.kind === 'supervised' && r.slotId === need.slotId && r.reliefTeacherId);
  const supervisor = supervising?.reliefTeacherId ?? free[0]?.teacherId ?? null;
  if (supervisor)
    for (const place of ['Library', 'Ground'])
      out.push({ kind: 'supervised', label: `${place} — supervised by ${name(supervisor)}`, reliefTeacherId: supervisor, combineWithGroupId: null, note: place });
  return out;
}

// ------------------------------------------------------------------ assign

export function makeAssignment(
  ctx: DayContext,
  need: CoverNeed,
  choice: { kind: ReliefAssignment['kind']; reliefTeacherId: string | null; combineWithGroupId?: string | null; note?: string },
): ReliefAssignment {
  return {
    id: newId('rel'),
    date: ctx.date,
    slotId: need.slotId,
    itemId: need.itemId,
    absentTeacherId: need.absentTeacherId,
    kind: choice.kind,
    reliefTeacherId: choice.reliefTeacherId,
    combineWithGroupId: choice.combineWithGroupId ?? null,
    note: choice.note ?? '',
  };
}

/** Replaces the assignment for one need (or clears it with `null`). Returns the new relief list. */
export function setAssignment(relief: ReliefAssignment[], date: string, needKeyStr: string, a: ReliefAssignment | null): ReliefAssignment[] {
  const rest = relief.filter((r) => !(r.date === date && needKey(r) === needKeyStr));
  return a ? [...rest, a] : rest;
}

/**
 * Fills every uncovered need with the best-ranked free teacher, hardest
 * periods first, updating fairness counts as it goes. Existing choices stay.
 */
export function autoAssign(p: Project, ctx: DayContext, needs: CoverNeed[], relief: ReliefAssignment[] = p.relief): ReliefAssignment[] {
  let list = [...relief];
  const done = new Set(list.filter((r) => r.date === ctx.date).map(needKey));
  const open = needs.filter((n) => !done.has(n.key));
  const order = open
    .map((n) => ({ n, options: candidates(p, ctx, n, list).length }))
    .sort((a, b) => a.options - b.options || a.n.start - b.n.start)
    // Doubles: put the second half right after the first so it can follow it.
    .sort((a, b) => (a.n.itemId === b.n.itemId && a.n.absentTeacherId === b.n.absentTeacherId ? a.n.start - b.n.start : 0))
    .map((x) => x.n);
  for (const n of order) {
    const options = candidates(p, ctx, n, list);
    // Keep both halves of a double with the same relief teacher when they are free.
    const sibling = list.find((r) => r.date === ctx.date && r.itemId === n.itemId && r.absentTeacherId === n.absentTeacherId && r.slotId !== n.slotId);
    const best = options.find((c) => c.teacherId === sibling?.reliefTeacherId) ?? options[0];
    if (best) list = [...list, makeAssignment(ctx, n, { kind: 'teacher', reliefTeacherId: best.teacherId })];
  }
  return list;
}

/** Drops assignments whose need no longer exists (absence removed, timetable changed). */
export function staleAssignments(relief: ReliefAssignment[], date: string, needs: CoverNeed[]): ReliefAssignment[] {
  const keys = new Set(needs.map((n) => n.key));
  return relief.filter((r) => r.date === date && !keys.has(needKey(r)));
}

export interface LedgerRow {
  teacherId: string;
  name: string;
  week: number;
  term: number;
  total: number;
  absentDays: number;
}

/** Fairness summary: reliefs taken per teacher this week / term / all time, and days absent this term. */
export function ledgerRows(p: Project, date: string): LedgerRow[] {
  const L = ledger(p, date);
  const total = counts(p.relief, '0000-00-00', '9999-99-99');
  const absentDays = new Map<string, number>();
  for (let d = L.termFrom; d <= date; d = addDays(d, 1)) {
    if (!p.institute.workingDays.includes(weekdayOf(d))) continue;
    for (const a of p.absences) if (!a.slotIds.length && absenceOn(a, d)) absentDays.set(a.teacherId, (absentDays.get(a.teacherId) ?? 0) + 1);
  }
  return p.teachers
    .filter((t) => t.active)
    .map((t) => ({
      teacherId: t.id,
      name: t.name,
      week: L.week.get(t.id) ?? 0,
      term: L.term.get(t.id) ?? 0,
      total: total.get(t.id) ?? 0,
      absentDays: absentDays.get(t.id) ?? 0,
    }))
    .sort((a, b) => b.term - a.term || b.week - a.week || a.name.localeCompare(b.name));
}
