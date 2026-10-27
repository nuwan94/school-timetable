import { newId } from './common';
import { teacherDays } from './checks';
import type { Project } from './project';
import type { DutyAssignment, DutyRoster, DutySession } from './schedule';
import { lessonEntries, mainSchedule } from './timetable';
import { formatClock, slotsForDay, type Weekday } from './time';

/**
 * Interval and gate duty rosters (PLAN.md §8): a weekly grid of posts ×
 * sessions × days, filled fairly, never clashing with lessons or another duty.
 */

/** Visiting staff, coaches and vacancies are never put on duty. */
const NO_DUTY = new Set(['visiting', 'coach', 'vacancy']);

/** A new roster: interval sessions come from the bell schedule's breaks; gate uses before and after school. */
export function makeDutyRoster(p: Project, kind: DutyRoster['kind']): DutyRoster {
  const bell = mainSchedule(p);
  const day = p.institute.workingDays[0] ?? 'mon';
  const slots = bell ? slotsForDay(bell, day) : [];
  let sessions: DutySession[];
  let posts: string[];
  let name: string;
  if (kind === 'interval') {
    name = 'Interval duty';
    posts = ['Playground', 'Canteen', 'Corridors'];
    sessions = slots
      .filter((s) => s.kind === 'break')
      .map((s) => ({ id: newId('dses'), label: s.label || 'Interval', start: s.start, end: s.start + s.duration }));
    if (!sessions.length) sessions = [{ id: newId('dses'), label: 'Interval', start: 10 * 60 + 30, end: 10 * 60 + 50 }];
  } else if (kind === 'gate') {
    name = 'Gate duty';
    posts = ['Main gate'];
    const first = slots[0]?.start ?? 7 * 60 + 30;
    const lastSlot = slots[slots.length - 1];
    const last = lastSlot ? lastSlot.start + lastSlot.duration : 13 * 60 + 30;
    sessions = [
      { id: newId('dses'), label: 'Morning', start: first - 30, end: first },
      { id: newId('dses'), label: 'After school', start: last, end: last + 30 },
    ];
  } else {
    name = 'Duty roster';
    posts = ['Post 1'];
    sessions = [{ id: newId('dses'), label: 'Session', start: 12 * 60, end: 12 * 60 + 30 }];
  }
  return { id: newId('duty'), name, kind, posts, sessions, days: [...p.institute.workingDays], excludedTeacherIds: [], assignments: [] };
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

/** Teacher × day → busy intervals: lessons in the active timetable plus duties on every roster. */
function busyMap(p: Project, skipRosterId?: string) {
  const busy = new Map<string, { start: number; end: number }[]>();
  const add = (t: string, d: Weekday, iv: { start: number; end: number }) => {
    const k = `${t}|${d}`;
    busy.set(k, [...(busy.get(k) ?? []), iv]);
  };
  const v = p.versions.find((x) => x.id === p.activeVersionId);
  if (v) for (const e of lessonEntries(p, v.placements)) for (const t of e.teacherIds) add(t, e.day, e);
  for (const r of p.dutyRosters) {
    if (r.id === skipRosterId) continue;
    for (const a of r.assignments) {
      const s = r.sessions.find((x) => x.id === a.sessionId);
      if (s) add(a.teacherId, a.day, s);
    }
  }
  return { isBusy: (t: string, d: Weekday, iv: { start: number; end: number }) => (busy.get(`${t}|${d}`) ?? []).some((b) => overlaps(b, iv)), add };
}

/** Weekly cap from the teacher's duty quotas: a quota whose label matches the roster name (or kind). */
function quotaFor(p: Project, teacherId: string, roster: DutyRoster): number {
  const t = p.teachers.find((x) => x.id === teacherId);
  const q = t?.duties.find((d) => {
    const l = d.label.toLowerCase();
    return l === roster.name.toLowerCase() || l.includes(roster.kind);
  });
  return q?.perWeek ?? Infinity;
}

export const dutyKey = (a: Pick<DutyAssignment, 'day' | 'sessionId' | 'post'>) => `${a.day}|${a.sessionId}|${a.post}`;

/**
 * Fills empty cells: for each day, session and post, the eligible teacher with
 * the fewest duties (on all rosters) who works that day and is free then.
 * Existing assignments are kept.
 */
export function autoAssignDuties(p: Project, roster: DutyRoster): DutyAssignment[] {
  const valid = (a: DutyAssignment) =>
    roster.days.includes(a.day) && roster.posts.includes(a.post) && roster.sessions.some((s) => s.id === a.sessionId);
  const kept = roster.assignments.filter(valid);
  const { isBusy, add } = busyMap(p, roster.id);
  const total = new Map<string, number>();
  const here = new Map<string, number>();
  for (const r of p.dutyRosters) if (r.id !== roster.id) for (const a of r.assignments) total.set(a.teacherId, (total.get(a.teacherId) ?? 0) + 1);
  for (const a of kept) {
    total.set(a.teacherId, (total.get(a.teacherId) ?? 0) + 1);
    here.set(a.teacherId, (here.get(a.teacherId) ?? 0) + 1);
    const s = roster.sessions.find((x) => x.id === a.sessionId)!;
    add(a.teacherId, a.day, s);
  }
  const eligible = p.teachers.filter((t) => t.active && !NO_DUTY.has(t.category) && !roster.excludedTeacherIds.includes(t.id));
  const filled = new Set(kept.map(dutyKey));
  const out = [...kept];
  for (const day of roster.days)
    for (const s of roster.sessions)
      for (const post of roster.posts) {
        if (filled.has(dutyKey({ day, sessionId: s.id, post }))) continue;
        const pick = eligible
          .filter((t) => teacherDays(p, t).includes(day) && !isBusy(t.id, day, s) && (here.get(t.id) ?? 0) < quotaFor(p, t.id, roster))
          .sort((a, b) => (total.get(a.id) ?? 0) - (total.get(b.id) ?? 0) || a.name.localeCompare(b.name))[0];
        if (!pick) continue;
        out.push({ day, sessionId: s.id, post, teacherId: pick.id });
        total.set(pick.id, (total.get(pick.id) ?? 0) + 1);
        here.set(pick.id, (here.get(pick.id) ?? 0) + 1);
        add(pick.id, day, s);
      }
  return out;
}

export interface DutyClash {
  kind: 'twice' | 'teaching' | 'notWorking' | 'empty' | 'notAllowed';
  message: string;
}

export function dutyClashes(p: Project, roster: DutyRoster): DutyClash[] {
  const out: DutyClash[] = [];
  const name = (id: string) => p.teachers.find((t) => t.id === id)?.name ?? '?';
  const ses = (id: string) => roster.sessions.find((s) => s.id === id);
  const v = p.versions.find((x) => x.id === p.activeVersionId);
  const entries = v ? lessonEntries(p, v.placements) : [];
  const { isBusy } = busyMap(p, roster.id);
  const at = (a: DutyAssignment) => `${a.day} ${ses(a.sessionId)?.label ?? ''}`;
  for (const a of roster.assignments) {
    const s = ses(a.sessionId);
    const t = p.teachers.find((x) => x.id === a.teacherId);
    if (!s || !t) continue;
    if (!teacherDays(p, t).includes(a.day)) out.push({ kind: 'notWorking', message: `${t.name} does not work on ${a.day} (${a.post}).` });
    if (entries.some((e) => e.day === a.day && e.teacherIds.includes(a.teacherId) && overlaps(e, s)))
      out.push({ kind: 'teaching', message: `${t.name} has a lesson during ${at(a)} (${a.post}).` });
    else if (isBusy(a.teacherId, a.day, s)) out.push({ kind: 'twice', message: `${t.name} is on another roster during ${at(a)}.` });
    if (NO_DUTY.has(t.category) || roster.excludedTeacherIds.includes(t.id))
      out.push({ kind: 'notAllowed', message: `${t.name} is not normally put on duty (${a.post}, ${at(a)}).` });
  }
  const seen = new Map<string, DutyAssignment[]>();
  for (const a of roster.assignments) {
    const k = `${a.day}|${a.sessionId}|${a.teacherId}`;
    seen.set(k, [...(seen.get(k) ?? []), a]);
  }
  for (const list of seen.values())
    if (list.length > 1)
      out.push({
        kind: 'twice',
        message: `${name(list[0]!.teacherId)} is on ${list.map((a) => a.post).join(' and ')} at the same time (${at(list[0]!)}).`,
      });
  const filled = new Set(roster.assignments.map(dutyKey));
  let empty = 0;
  for (const day of roster.days)
    for (const s of roster.sessions) for (const post of roster.posts) if (!filled.has(dutyKey({ day, sessionId: s.id, post }))) empty++;
  if (empty) out.push({ kind: 'empty', message: `${empty} duty slot(s) have nobody.` });
  return out;
}

export const sessionLabel = (s: DutySession) => `${s.label} ${formatClock(s.start)}–${formatClock(s.end)}`;
