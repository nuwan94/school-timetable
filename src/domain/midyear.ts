import type { Draft } from 'immer';
import { newId } from './common';
import { makeTeacher } from './factories';
import type { Project } from './project';
import type { TimetableVersion } from './schedule';
import { lessonEntries, snapshotOf } from './timetable';
import { tx } from '@/i18n';

/**
 * Mid-year changes (PLAN.md §7): templates that change the data, a diff
 * between the approved timetable and the new draft, and who is affected.
 */

type Snap = TimetableVersion['baseSnapshot'][number];

export interface LessonChange {
  key: string;
  itemId: string;
  classIds: string[];
  subjectId: string;
  before: Snap | null;
  after: Snap | null;
  /** What changed, for the notice wording. */
  what: ('time' | 'teacher' | 'room' | 'added' | 'removed')[];
}

export interface VersionDiff {
  changes: LessonChange[];
  teachers: Map<string, LessonChange[]>;
  classes: Set<string>;
  rooms: Set<string>;
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Compares a version's base snapshot (or an explicit one) with what it now says. */
export function diffVersion(p: Project, version: TimetableVersion, base?: Snap[]): VersionDiff {
  const before = new Map((base ?? version.baseSnapshot).map((s) => [s.key, s]));
  const entries = lessonEntries(p, version.placements);
  const after = new Map(snapshotOf(p, version).map((s) => [s.key, s]));
  const info = new Map(entries.map((e) => [`${e.itemId}#${e.occurrence}`, e]));
  const meta = (key: string) => {
    const itemId = key.split('#')[0]!;
    const e = info.get(key);
    if (e)
      return {
        itemId,
        classIds: e.classIds,
        subjectId: e.parts[0]?.subjectId ?? '',
      };
    const a = p.allocations.find((x) => x.id === itemId);
    if (a) return { itemId, classIds: a.groupIds, subjectId: a.subjectId };
    const b = p.optionBlocks.find((x) => x.lines.some((l) => l.id === itemId));
    return { itemId, classIds: b?.classIds ?? [], subjectId: '' };
  };

  const changes: LessonChange[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(key) ?? null;
    const a = after.get(key) ?? null;
    const what: LessonChange['what'] = [];
    if (!b) what.push('added');
    else if (!a) what.push('removed');
    else {
      if (b.day !== a.day || !same(b.slotIds, a.slotIds)) what.push('time');
      if (!same(b.teacherIds, a.teacherIds)) what.push('teacher');
      if (!same(b.roomIds, a.roomIds)) what.push('room');
    }
    if (what.length) changes.push({ key, ...meta(key), before: b, after: a, what });
  }

  const teachers = new Map<string, LessonChange[]>();
  const classes = new Set<string>();
  const rooms = new Set<string>();
  for (const c of changes) {
    for (const t of new Set([...(c.before?.teacherIds ?? []), ...(c.after?.teacherIds ?? [])])) teachers.set(t, [...(teachers.get(t) ?? []), c]);
    c.classIds.forEach((x) => classes.add(x));
    for (const r of new Set([...(c.before?.roomIds ?? []), ...(c.after?.roomIds ?? [])])) rooms.add(r);
  }
  return { changes, teachers, classes, rooms };
}

// ------------------------------------------------------------------ templates

/** Teacher leaves or transfers: their whole load (and class-teacher roles) moves to one replacement, or becomes uncovered. */
export function teacherLeaves(d: Draft<Project>, teacherId: string, replacementId: string | null): number {
  let moved = 0;
  for (const a of d.allocations) {
    if (!a.teacherIds.includes(teacherId)) continue;
    moved++;
    a.teacherIds = a.teacherIds.filter((t) => t !== teacherId);
    if (replacementId && !a.teacherIds.includes(replacementId)) a.teacherIds.push(replacementId);
    if (!a.teacherIds.length) a.status = 'uncovered';
  }
  for (const b of d.optionBlocks)
    for (const l of b.lines)
      for (const s of l.sets)
        if (s.teacherIds.includes(teacherId)) {
          moved++;
          s.teacherIds = s.teacherIds.filter((t) => t !== teacherId);
          if (replacementId) s.teacherIds.push(replacementId);
        }
  for (const c of d.classes) if (c.classTeacherId === teacherId) c.classTeacherId = replacementId;
  const t = d.teachers.find((x) => x.id === teacherId);
  if (t) t.active = false;
  return moved;
}

/** New appointee: adds the teacher and hands them the chosen lessons. Returns the new teacher's id. */
export function newAppointee(d: Draft<Project>, input: { name: string; subjectIds: string[] }, allocationIds: string[]): string {
  const t = makeTeacher({ name: input.name, subjectIds: input.subjectIds });
  d.teachers.push(t);
  for (const a of d.allocations)
    if (allocationIds.includes(a.id)) {
      a.teacherIds = [t.id];
      a.status = input.subjectIds.includes(a.subjectId) ? 'appointed' : 'covering';
    }
  return t.id;
}

/** Long leave: a dated absence with a named cover teacher; the timetable itself does not change and the teacher returns automatically. */
export function longLeave(
  d: Draft<Project>,
  input: {
    teacherId: string;
    from: string;
    to: string;
    coverTeacherId: string | null;
    reason: string;
  },
): void {
  d.absences.push({
    id: newId('abs'),
    teacherId: input.teacherId,
    from: input.from,
    to: input.to,
    slotIds: [],
    recurrence: null,
    reason: input.reason || tx('Long leave'),
    coverTeacherId: input.coverTeacherId,
  });
}

/** Exam classes leave (e.g. Grade 11 after the O/L): from that date they need no lessons, and their teachers are free for relief. */
export function examClassesLeave(d: Draft<Project>, input: { classIds: string[]; from: string; to: string; name: string }): void {
  d.overlays.push({
    id: newId('ovl'),
    name: input.name,
    shortCode: '',
    local: {},
    active: true,
    kind: 'examSeries',
    from: input.from,
    to: input.to,
    blockedRoomIds: [],
    removedGroupIds: input.classIds,
    absentTeacherIds: [],
    note: '',
  });
}

/**
 * Saves a timetable for a change as a new draft based on the approved one,
 * keeping a snapshot of the approved lessons (taken before the data changed).
 */
export function saveChangeVersion(
  d: Draft<Project>,
  input: {
    name: string;
    effectiveFrom: string;
    placements: TimetableVersion['placements'];
    baseId: string;
    baseSnapshot: TimetableVersion['baseSnapshot'];
  },
): string {
  const id = newId('ver');
  d.versions = d.versions.filter((v) => !(v.status === 'draft' && v.id === d.activeVersionId));
  d.versions.push({
    id,
    name: input.name,
    status: 'draft',
    effectiveFrom: input.effectiveFrom,
    basedOnId: input.baseId,
    note: tx('mid-year change'),
    createdAt: new Date().toISOString(),
    placements: input.placements,
    baseSnapshot: input.baseSnapshot,
  });
  d.activeVersionId = id;
  return id;
}
