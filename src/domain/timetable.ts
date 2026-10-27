import { scheduleForClass } from './checks';
import { expandPattern } from './factories';
import type { Project } from './project';
import type { Placement, TimetableVersion } from './schedule';
import { slotsForDay, teachingSlots, type BellSchedule, type BellSlot, type Weekday } from './time';
import type { Draft } from 'immer';
import { newId } from './common';

/**
 * Turns placements into displayable lessons and per-class / per-teacher grids.
 * Shared by the Generate viewer and (P3) the printed sheets.
 */

export interface LessonEntry {
  itemId: string;
  occurrence: number;
  day: Weekday;
  slotIds: string[];
  start: number;
  end: number;
  classIds: string[];
  teacherIds: string[];
  roomIds: string[];
  /** Subject code or block line label. */
  title: string;
  /** For block lines: "BUD · Perera / HIN · Rajan". */
  parts: { subjectId: string; teacherIds: string[]; subject: string; teacher: string; room: string }[];
  uncovered: boolean;
  locked: boolean;
}

export function classIdsOfGroups(p: Project, groupIds: string[]): string[] {
  return [...new Set(groupIds.flatMap((g) => (p.classes.some((c) => c.id === g) ? [g] : (p.studentGroups.find((s) => s.id === g)?.classIds ?? []))))];
}

export function lessonEntries(p: Project, placements: readonly Placement[]): LessonEntry[] {
  const subjectCode = (id: string) => {
    const s = p.subjects.find((x) => x.id === id);
    return s?.shortCode || s?.name || '?';
  };
  const teacherCode = (id: string) => {
    const t = p.teachers.find((x) => x.id === id);
    return t?.shortCode || t?.name || '?';
  };
  const roomName = (id: string | null) => (id ? (p.rooms.find((r) => r.id === id)?.name ?? '') : '');
  const lines = new Map(p.optionBlocks.flatMap((b) => b.lines.map((l) => [l.id, { block: b, line: l }] as const)));

  const out: LessonEntry[] = [];
  for (const pl of placements) {
    const alloc = p.allocations.find((a) => a.id === pl.itemId);
    const bl = alloc ? undefined : lines.get(pl.itemId);
    if (!alloc && !bl) continue;
    const pattern = alloc ? alloc.pattern : bl!.line.pattern;
    const length = expandPattern(pattern)[pl.occurrence] ?? 1;
    const classIds = alloc ? classIdsOfGroups(p, alloc.groupIds) : [...bl!.block.classIds];
    const cls = p.classes.find((c) => c.id === classIds[0]);
    const schedule = cls && scheduleForClass(p, cls);
    const slots = schedule ? slotsForDay(schedule, pl.day) : [];
    const i = slots.findIndex((s) => s.id === pl.slotId);
    const run = i >= 0 ? slots.slice(i, i + length) : [];
    if (!run.length) continue;

    const base = {
      itemId: pl.itemId,
      occurrence: pl.occurrence,
      day: pl.day,
      slotIds: run.map((s) => s.id),
      start: run[0]!.start,
      end: run[run.length - 1]!.start + run[run.length - 1]!.duration,
      classIds,
      locked: pl.locked,
    };
    if (alloc) {
      const room = pl.roomId ?? alloc.roomId;
      out.push({
        ...base,
        teacherIds: alloc.status === 'uncovered' ? [] : [...alloc.teacherIds],
        roomIds: room ? [room] : [],
        title: subjectCode(alloc.subjectId),
        parts: [
          {
            subjectId: alloc.subjectId,
            teacherIds: alloc.status === 'uncovered' ? [] : [...alloc.teacherIds],
            subject: subjectCode(alloc.subjectId),
            teacher: alloc.status === 'uncovered' ? '' : alloc.teacherIds.map(teacherCode).join('/'),
            room: roomName(room),
          },
        ],
        uncovered: alloc.status === 'uncovered' || alloc.teacherIds.length === 0,
      });
    } else {
      const { line } = bl!;
      out.push({
        ...base,
        teacherIds: [...new Set(line.sets.flatMap((s) => s.teacherIds))],
        roomIds: line.sets.map((s) => s.roomId).filter((r): r is string => !!r),
        title: line.label,
        parts: line.sets.map((s) => ({
          subjectId: s.subjectId,
          teacherIds: [...s.teacherIds],
          subject: subjectCode(s.subjectId), teacher: s.teacherIds.map(teacherCode).join('/'), room: roomName(s.roomId) })),
        uncovered: line.sets.some((s) => s.teacherIds.length === 0),
      });
    }
  }
  return out;
}

export interface GridRow {
  /** Row label from the first working day ("P1", "Interval"). */
  label: string;
  kind: BellSlot['kind'];
  /** Per working day: that day's slot at this row (days can have their own bells). */
  slots: (BellSlot | undefined)[];
}

export interface Grid {
  days: Weekday[];
  rows: GridRow[];
  /** `${day}|${slotId}` → lessons in that cell. */
  cells: Map<string, LessonEntry[]>;
}

function rowsFor(schedule: BellSchedule, days: Weekday[]): GridRow[] {
  const perDay = days.map((d) => slotsForDay(schedule, d));
  const longest = perDay.reduce((a, b) => (b.length > a.length ? b : a), [] as BellSlot[]);
  return longest.map((s, i) => ({ label: s.label, kind: s.kind, slots: perDay.map((list) => list[i]) }));
}

/** One class's week. Empty teaching cells are gaps (Self-study). */
export function classGrid(p: Project, entries: LessonEntry[], classId: string): Grid | null {
  const cls = p.classes.find((c) => c.id === classId);
  const schedule = cls && scheduleForClass(p, cls);
  if (!schedule) return null;
  const days = [...p.institute.workingDays];
  const cells = new Map<string, LessonEntry[]>();
  for (const e of entries)
    if (e.classIds.includes(classId)) for (const s of e.slotIds) cells.set(`${e.day}|${s}`, [...(cells.get(`${e.day}|${s}`) ?? []), e]);
  return { days, rows: rowsFor(schedule, days), cells };
}

/** One teacher's week, laid on the bell schedule of the classes they teach most. Cells match by clock time. */
export function teacherGrid(p: Project, entries: LessonEntry[], teacherId: string): Grid | null {
  return gridByClock(
    p,
    entries.filter((e) => e.teacherIds.includes(teacherId)),
  );
}

/** A week grid for any set of lessons (teacher, room), matched to bell slots by clock time. */
export function gridByClock(p: Project, mine: LessonEntry[]): Grid | null {
  const schedule = mainSchedule(p, mine);
  if (!schedule) return null;
  const days = [...p.institute.workingDays];
  const cells = new Map<string, LessonEntry[]>();
  for (const day of days)
    for (const s of slotsForDay(schedule, day)) {
      const hit = mine.filter((e) => e.day === day && e.start < s.start + s.duration && s.start < e.end);
      if (hit.length) cells.set(`${day}|${s.id}`, hit);
    }
  return { days, rows: rowsFor(schedule, days), cells };
}

/** The bell schedule most of these lessons follow (or the first one). */
export function mainSchedule(p: Project, entries: LessonEntry[] = []): BellSchedule | undefined {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const cls = p.classes.find((c) => c.id === e.classIds[0]);
    const id = cls && scheduleForClass(p, cls)?.id;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const id = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  return p.bellSchedules.find((b) => b.id === id) ?? p.bellSchedules[0];
}

/** Teaching periods in a class's week with no lesson. */
export function countGaps(p: Project, entries: LessonEntry[], classId: string): number {
  const grid = classGrid(p, entries, classId);
  if (!grid) return 0;
  let gaps = 0;
  for (const row of grid.rows)
    row.slots.forEach((s, i) => {
      if (s?.kind === 'period' && !grid.cells.has(`${grid.days[i]}|${s.id}`)) gaps++;
    });
  return gaps;
}

/** Teaching periods per week for the class's schedule (for headers). */
export function classWeekPeriods(p: Project, classId: string): number {
  const cls = p.classes.find((c) => c.id === classId);
  const schedule = cls && scheduleForClass(p, cls);
  return schedule ? p.institute.workingDays.reduce((s, d) => s + teachingSlots(schedule, d).length, 0) : 0;
}

/**
 * Stores a generated timetable as the active draft. Replaces the current
 * draft (drafts are scratch), never an approved version.
 */
export function saveDraftVersion(d: Draft<Project>, placements: Placement[], note: string): string {
  const active = d.versions.find((v) => v.id === d.activeVersionId);
  const version: TimetableVersion = {
    id: newId('ver'),
    name: `Draft ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
    status: 'draft',
    effectiveFrom: null,
    basedOnId: active?.status === 'approved' ? active.id : (active?.basedOnId ?? null),
    note,
    createdAt: new Date().toISOString(),
    placements,
  };
  d.versions = [...d.versions.filter((v) => !(v.status === 'draft' && v.id === d.activeVersionId)), version];
  d.activeVersionId = version.id;
  return version.id;
}

/**
 * Replaces the active version's placements. Editing an approved version
 * first makes a draft copy of it, so the approved one stays as printed.
 */
export function setActivePlacements(d: Draft<Project>, placements: Placement[]): void {
  const active = d.versions.find((v) => v.id === d.activeVersionId);
  if (!active) return;
  if (active.status !== 'draft') {
    const copy: TimetableVersion = {
      id: newId('ver'),
      name: `${active.name} (edited)`,
      status: 'draft',
      effectiveFrom: null,
      basedOnId: active.id,
      note: active.note,
      createdAt: new Date().toISOString(),
      placements,
    };
    d.versions.push(copy);
    d.activeVersionId = copy.id;
    return;
  }
  active.placements = placements;
}

/** Marks the active draft approved; the previously approved version becomes superseded. */
export function approveActiveVersion(d: Draft<Project>, effectiveFrom: string | null): void {
  const active = d.versions.find((v) => v.id === d.activeVersionId);
  if (!active || active.status !== 'draft') return;
  for (const v of d.versions) if (v.status === 'approved') v.status = 'superseded';
  active.status = 'approved';
  active.effectiveFrom = effectiveFrom;
  if (active.name.startsWith('Draft')) active.name = active.name.replace(/^Draft/, 'Timetable');
}
