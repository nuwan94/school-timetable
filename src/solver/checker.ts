import { scheduleForClass } from '@/domain/checks';
import { expandPattern } from '@/domain/factories';
import type { Project } from '@/domain/project';
import { ruleAppliesToClass, ruleFor } from '@/domain/rules';
import type { Placement } from '@/domain/schedule';
import { slotsForDay, type Weekday } from '@/domain/time';

/**
 * Independent timetable checker (PLAN.md §12). Deliberately shares no code
 * with the solver: it re-derives every lesson's clock interval from the
 * placements and bell schedules and verifies the hard constraints. Every
 * generated timetable must pass with zero violations.
 */

export interface Violation {
  kind: 'clash' | 'availability' | 'slot' | 'count' | 'oncePerDay' | 'room';
  message: string;
}

export interface CheckReport {
  violations: Violation[];
  /** Lesson occurrences expected vs placed. */
  expected: number;
  placed: number;
}

interface Item {
  label: string;
  classIds: string[];
  teacherIds: string[];
  roomIds: string[];
  subjectKey: string;
  lengths: number[];
  roomTypeId: string | null;
  multiGrade: string | null;
}

interface Booking {
  start: number;
  end: number;
  label: string;
  multiGrade: string | null;
}

export function checkTimetable(p: Project, placements: Placement[], opts: { relaxedRules?: boolean } = {}): CheckReport {
  const violations: Violation[] = [];
  const name = (id: string) =>
    p.classes.find((x) => x.id === id)?.name ?? p.teachers.find((x) => x.id === id)?.name ?? p.rooms.find((x) => x.id === id)?.name ?? id;

  const classIdsOf = (ids: string[]) =>
    [...new Set(ids.flatMap((g) => (p.classes.some((c) => c.id === g) ? [g] : (p.studentGroups.find((s) => s.id === g)?.classIds ?? []))))];
  const items = new Map<string, Item>();
  for (const a of p.allocations) {
    const classIds = classIdsOf(a.groupIds);
    const subject = p.subjects.find((s) => s.id === a.subjectId);
    items.set(a.id, {
      label: `${classIds.map(name).join('+')} ${subject?.shortCode || subject?.name}`,
      classIds,
      teacherIds: a.status === 'uncovered' ? [] : a.teacherIds,
      roomIds: a.roomId ? [a.roomId] : [],
      subjectKey: a.subjectId,
      lengths: expandPattern(a.pattern),
      roomTypeId: !a.roomId && subject?.roomTypeId && p.rooms.some((r) => r.roomTypeId === subject.roomTypeId) ? subject.roomTypeId : null,
      multiGrade: classIds.length === 1 ? (p.multiGradeGroups.find((g) => g.classIds.includes(classIds[0]!))?.id ?? null) : null,
    });
  }
  for (const b of p.optionBlocks)
    for (const l of b.lines)
      if (l.sets.length)
        items.set(l.id, {
          label: `${b.name} · ${l.label}`,
          classIds: [...b.classIds],
          teacherIds: [...new Set(l.sets.flatMap((s) => s.teacherIds))],
          roomIds: l.sets.map((s) => s.roomId).filter((r): r is string => !!r),
          subjectKey: `line:${l.id}`,
          lengths: expandPattern(l.pattern),
          roomTypeId: null,
          multiGrade: null,
        });

  const bookings = new Map<string, Booking[]>();
  const book = (res: string, day: Weekday, b: Booking) => bookings.set(`${res}|${day}`, [...(bookings.get(`${res}|${day}`) ?? []), b]);
  const seen = new Set<string>();
  const subjectDays = new Map<string, number>();
  let placed = 0;

  for (const pl of placements) {
    const item = items.get(pl.itemId);
    if (!item) {
      violations.push({ kind: 'count', message: `A placement refers to a lesson that no longer exists (${pl.itemId}).` });
      continue;
    }
    const key = `${pl.itemId}#${pl.occurrence}`;
    const length = item.lengths[pl.occurrence];
    if (length === undefined || seen.has(key)) {
      violations.push({ kind: 'count', message: `${item.label} is placed more times than it has lessons.` });
      continue;
    }
    seen.add(key);
    placed++;

    const cls = p.classes.find((c) => c.id === item.classIds[0]);
    const schedule = cls && scheduleForClass(p, cls);
    const slots = schedule ? slotsForDay(schedule, pl.day) : [];
    const i = slots.findIndex((s) => s.id === pl.slotId);
    const run = i >= 0 ? slots.slice(i, i + length) : [];
    if (!p.institute.workingDays.includes(pl.day) || run.length < length || run.some((s) => s.kind !== 'period')) {
      violations.push({ kind: 'slot', message: `${item.label} is not on ${length} consecutive teaching periods (${pl.day}).` });
      continue;
    }
    for (let k = 1; k < run.length; k++)
      if (run[k]!.start !== run[k - 1]!.start + run[k - 1]!.duration)
        violations.push({ kind: 'slot', message: `${item.label} double period is split by a gap (${pl.day}).` });
    const start = run[0]!.start;
    const end = run[run.length - 1]!.start + run[run.length - 1]!.duration;
    const booking = { start, end, label: item.label, multiGrade: item.multiGrade };

    for (const c of item.classIds) {
      book(`c:${c}`, pl.day, booking);
      const sd = `${c}|${pl.day}|${item.subjectKey}`;
      subjectDays.set(sd, (subjectDays.get(sd) ?? 0) + 1);
    }
    for (const t of item.teacherIds) {
      book(`t:${t}`, pl.day, booking);
      const teacher = p.teachers.find((x) => x.id === t);
      if (!teacher) continue;
      const okDay = !teacher.contractedDays.length || teacher.contractedDays.includes(pl.day);
      const okWindow = !teacher.windows.length || teacher.windows.some((w) => w.day === pl.day && w.start <= start && end <= w.end);
      const blocked = teacher.unavailable.some((w) => w.day === pl.day && w.start < end && start < w.end);
      if (!okDay || !okWindow || blocked)
        violations.push({ kind: 'availability', message: `${teacher.name} is not available for ${item.label} (${pl.day}).` });
    }
    const rooms = [...item.roomIds, ...(pl.roomId && !item.roomIds.includes(pl.roomId) ? [pl.roomId] : [])];
    for (const r of rooms) book(`r:${r}`, pl.day, booking);
    if (item.roomTypeId) {
      const room = p.rooms.find((r) => r.id === pl.roomId);
      if (!room || room.roomTypeId !== item.roomTypeId)
        violations.push({ kind: 'room', message: `${item.label} is not in a room of the required type (${pl.day}).` });
    }
  }

  // Overlaps per resource.
  for (const [key, list] of bookings) {
    const [res, day] = key.split('|') as [string, Weekday];
    const id = res.slice(2);
    const capacity = res.startsWith('r:') ? (p.rooms.find((r) => r.id === id)?.concurrent ?? 1) : 1;
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i++) {
      const overlapping = sorted.filter((b) => b.start < sorted[i]!.end && sorted[i]!.start < b.end);
      const relevant = res.startsWith('t:')
        ? overlapping.filter((b) => b === sorted[i] || !(b.multiGrade && b.multiGrade === sorted[i]!.multiGrade))
        : overlapping;
      if (relevant.length > capacity) {
        violations.push({
          kind: 'clash',
          message: `${name(id)} is double-booked on ${day}: ${[...new Set(relevant.map((b) => b.label))].join(' / ')}.`,
        });
        break; // one message per resource-day is enough
      }
    }
  }

  const r4 = ruleFor(p, 'R4');
  if (r4?.strength === 'hard' && !opts.relaxedRules) {
    for (const [key, n] of subjectDays) {
      const [classId, day] = key.split('|') as [string, string];
      const cls = p.classes.find((c) => c.id === classId);
      if (n > 1 && cls && ruleAppliesToClass(r4, cls, p))
        violations.push({ kind: 'oncePerDay', message: `${cls.name} has the same subject ${n} times on ${day}.` });
    }
  }

  const expected = [...items.values()].reduce((s, i) => s + i.lengths.length, 0);
  return { violations, expected, placed };
}
