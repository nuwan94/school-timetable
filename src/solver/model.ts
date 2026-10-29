import { scheduleForClass } from '@/domain/checks';
import type { Teacher } from '@/domain/entities';
import { expandPattern } from '@/domain/factories';
import type { Project } from '@/domain/project';
import { numParam, ruleAppliesToClass, ruleFor } from '@/domain/rules';
import type { Placement } from '@/domain/schedule';
import { slotsForDay, type BellSchedule, type Weekday } from '@/domain/time';
import { dayShort, tx } from '@/i18n';

/**
 * Solver model: the project flattened into placeable *units* (one per lesson
 * occurrence; a double is one unit of length 2) and, for each unit, the
 * positions that pass the static constraints (availability, consecutive
 * periods, fixed slots). Dynamic constraints (clashes) live in state.ts.
 */

export interface Position {
  day: Weekday;
  /** First bell slot id (what a Placement stores). */
  slotId: string;
  slotIds: string[];
  /** Index of the first period within the day's periods (0 = first period). */
  periodIndex: number;
  start: number;
  end: number;
}

export interface Unit {
  key: string;
  itemId: string;
  occurrence: number;
  kind: 'allocation' | 'line';
  length: number;
  label: string;
  classIds: string[];
  teacherIds: string[];
  /** Rooms the unit always occupies (allocation room, block-set rooms). */
  fixedRoomIds: string[];
  /** Needs one room of this type, assigned by the solver. */
  roomTypeId: string | null;
  /** Same key on the same day in a class counts for "once per day" (R4). */
  subjectKey: string;
  /** R4 enforced as a hard constraint for this unit. */
  oncePerDay: boolean;
  /** Eviction cost: lower gives way first in repair and in shortage. */
  weight: number;
  heavy: boolean;
  uncovered: boolean;
  multiGradeGroupId: string | null;
  /** Fixed/locked units never move and are never evicted. */
  pinned: boolean;
  /** R1: taught by the class teacher of its (single) class, so it belongs in P1. */
  classTeacherLesson: boolean;
  /** R1 applies to its class, so P1 should be left for the class teacher. */
  keepP1Free: boolean;
  positions: Position[];
  /** Why `positions` is empty, when it is. */
  noPositionReason?: string;
}

export interface Model {
  days: Weekday[];
  units: Unit[];
  /** Max periods per teacher per day when R12 is a hard rule. */
  teacherDailyMax: Map<string, number>;
  roomsByType: Map<string, string[]>;
  roomConcurrent: Map<string, number>;
  names: Map<string, string>;
  /** Per class: every teaching position (single period) for gap reporting. */
  classPeriods: Map<string, Position[]>;
}

export interface ModelOptions {
  /** Treat Hard catalogue rules (R4, R12) as soft — shortage mode. */
  relaxRules?: boolean;
  /** Placements to keep exactly where they are (locked in a base version). */
  locked?: Placement[];
}

const PRIORITY_WEIGHT = { core: 8, normal: 4, low: 1 } as const;

/** All positions of `length` consecutive periods (no break between) on each day. */
export function positionsFor(schedule: BellSchedule, days: readonly Weekday[], length: number): Position[] {
  const out: Position[] = [];
  for (const day of days) {
    const slots = slotsForDay(schedule, day);
    let periodIndex = -1;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i]!.kind !== 'period') continue;
      periodIndex++;
      const run = slots.slice(i, i + length);
      if (run.length < length || run.some((s) => s.kind !== 'period')) continue;
      out.push({
        day,
        slotId: run[0]!.id,
        slotIds: run.map((s) => s.id),
        periodIndex,
        start: run[0]!.start,
        end: run[run.length - 1]!.start + run[run.length - 1]!.duration,
      });
    }
  }
  return out;
}

/** Is the teacher available for the whole interval (contract days, windows, blocked times)? */
export function teacherAvailable(t: Teacher, pos: Pick<Position, 'day' | 'start' | 'end'>): boolean {
  if (t.contractedDays.length && !t.contractedDays.includes(pos.day)) return false;
  if (t.windows.length && !t.windows.some((w) => w.day === pos.day && w.start <= pos.start && pos.end <= w.end)) return false;
  if (t.unavailable.some((w) => w.day === pos.day && w.start < pos.end && pos.start < w.end)) return false;
  return true;
}

export function buildModel(p: Project, opts: ModelOptions = {}): Model {
  const days = p.institute.workingDays;
  const names = new Map<string, string>();
  for (const x of [...p.classes, ...p.teachers, ...p.rooms, ...p.subjects]) names.set(x.id, x.name);

  const r4 = opts.relaxRules ? undefined : ruleFor(p, 'R4');
  const r4Hard = r4?.strength === 'hard';
  const r12 = ruleFor(p, 'R12');
  const teacherDailyMax = new Map<string, number>();
  if (r12?.strength === 'hard' && !opts.relaxRules) for (const t of p.teachers) teacherDailyMax.set(t.id, numParam(r12, 'maxPerDay', 7));

  const roomsByType = new Map<string, string[]>();
  const roomConcurrent = new Map<string, number>();
  for (const r of p.rooms) {
    roomConcurrent.set(r.id, r.concurrent);
    if (r.roomTypeId) roomsByType.set(r.roomTypeId, [...(roomsByType.get(r.roomTypeId) ?? []), r.id]);
  }

  // Resolve group ids (class or student group) to class ids.
  const classIdsOf = (groupIds: string[]) =>
    [...new Set(groupIds.flatMap((g) => (p.classes.some((c) => c.id === g) ? [g] : (p.studentGroups.find((x) => x.id === g)?.classIds ?? []))))];
  const multiGradeOf = (classIds: string[]) =>
    classIds.length === 1 ? (p.multiGradeGroups.find((g) => g.classIds.includes(classIds[0]!))?.id ?? null) : null;

  const r1 = ruleFor(p, 'R1');
  const r1Classes = new Set(r1 && r1.strength !== 'hard' ? p.classes.filter((c) => c.classTeacherId && ruleAppliesToClass(r1, c, p)).map((c) => c.id) : []);
  const lockedByKey = new Map((opts.locked ?? []).map((pl) => [`${pl.itemId}#${pl.occurrence}`, pl]));
  const units: Unit[] = [];

  const finishUnit = (u: Omit<Unit, 'positions' | 'noPositionReason' | 'classTeacherLesson' | 'keepP1Free'>, fixed: { day: Weekday; slotId: string } | undefined) => {
    const cls = p.classes.find((c) => c.id === u.classIds[0]);
    const schedule = cls ? scheduleForClass(p, cls) : p.bellSchedules[0];
    let positions = schedule ? positionsFor(schedule, days, u.length) : [];
    let noPositionReason: string | undefined;
    if (positions.length === 0) noPositionReason = u.length > 1 ? tx('no {n} periods in a row without a break', { n: u.length }) : tx('no teaching periods');
    const teachers = u.teacherIds.map((id) => p.teachers.find((t) => t.id === id)).filter((t): t is Teacher => !!t);
    const available = positions.filter((pos) => teachers.every((t) => teacherAvailable(t, pos)));
    if (positions.length && !available.length)
      noPositionReason = tx('{names} not available at any possible time', { names: teachers.map((t) => t.name).join(' / ') });
    positions = available;
    const lock = lockedByKey.get(u.key);
    const pin = lock ?? fixed;
    if (pin) {
      const at = positions.filter((pos) => pos.day === pin.day && pos.slotId === pin.slotId);
      if (!at.length) noPositionReason = tx('its fixed time ({day}) is not a valid time for this lesson', { day: dayShort(pin.day) });
      positions = at;
    }
    const r1Class = u.classIds.length === 1 && r1Classes.has(u.classIds[0]!);
    const ct = r1Class ? p.classes.find((c) => c.id === u.classIds[0])?.classTeacherId : null;
    units.push({
      ...u,
      pinned: !!pin,
      positions,
      noPositionReason,
      classTeacherLesson: !!ct && u.teacherIds.includes(ct),
      keepP1Free: r1Class && !(ct && u.teacherIds.includes(ct)),
    });
  };

  for (const a of p.allocations) {
    const classIds = classIdsOf(a.groupIds);
    if (classIds.length === 0) continue;
    const subject = p.subjects.find((s) => s.id === a.subjectId);
    const classNames = classIds.map((c) => names.get(c)).join('+');
    const oncePerDay =
      !!r4 && r4Hard && classIds.every((c) => ruleAppliesToClass(r4, p.classes.find((x) => x.id === c)!, p));
    const needsType = subject?.roomTypeId && !a.roomId && (roomsByType.get(subject.roomTypeId)?.length ?? 0) > 0 ? subject.roomTypeId : null;
    expandPattern(a.pattern).forEach((length, occurrence) => {
      finishUnit(
        {
          key: `${a.id}#${occurrence}`,
          itemId: a.id,
          occurrence,
          kind: 'allocation',
          length,
          label: `${classNames} ${subject?.shortCode || subject?.name || '?'}${length > 1 ? ' (double)' : ''}`,
          classIds,
          teacherIds: a.status === 'uncovered' ? [] : a.teacherIds,
          fixedRoomIds: a.roomId ? [a.roomId] : [],
          roomTypeId: needsType || null,
          subjectKey: a.subjectId,
          oncePerDay,
          weight: (a.status === 'uncovered' ? 1 : PRIORITY_WEIGHT[subject?.priority ?? 'normal']) * length,
          heavy: !!subject?.heavy,
          uncovered: a.status === 'uncovered' || a.teacherIds.length === 0,
          multiGradeGroupId: multiGradeOf(classIds),
          pinned: false,
        },
        a.fixed[occurrence],
      );
    });
  }

  for (const b of p.optionBlocks) {
    for (const line of b.lines) {
      if (line.sets.length === 0 || b.classIds.length === 0) continue;
      const teacherIds = [...new Set(line.sets.flatMap((s) => s.teacherIds))];
      const rooms = line.sets.map((s) => s.roomId).filter((r): r is string => !!r);
      const oncePerDay = !!r4 && r4Hard && b.classIds.every((c) => ruleAppliesToClass(r4, p.classes.find((x) => x.id === c)!, p));
      expandPattern(line.pattern).forEach((length, occurrence) => {
        finishUnit(
          {
            key: `${line.id}#${occurrence}`,
            itemId: line.id,
            occurrence,
            kind: 'line',
            length,
            label: `${b.name} · ${line.label}`,
            classIds: [...b.classIds],
            teacherIds,
            fixedRoomIds: rooms,
            roomTypeId: null,
            subjectKey: `line:${line.id}`,
            oncePerDay,
            weight: 6 * length,
            heavy: false,
            uncovered: false,
            multiGradeGroupId: null,
            pinned: false,
          },
          undefined,
        );
      });
    }
  }

  const classPeriods = new Map<string, Position[]>();
  for (const c of p.classes) {
    const s = scheduleForClass(p, c);
    classPeriods.set(c.id, s ? positionsFor(s, days, 1) : []);
  }

  return { days: [...days], units, teacherDailyMax, roomsByType, roomConcurrent, names, classPeriods };
}
