import { z } from 'zod';
import { Id, IsoDate, Named } from './common';

/**
 * Time model. Minutes are the base unit everywhere: clock times are minutes
 * since midnight, durations are minutes. Periods are derived from bell schedules,
 * and every placement resolves to an absolute clock interval so clash checks work
 * across sections that run different bell schedules.
 */

export const Weekday = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export type Weekday = z.infer<typeof Weekday>;
export const WEEKDAYS: readonly Weekday[] = Weekday.options;

/** Minutes since midnight, 0..1439. */
export const ClockMinutes = z.number().int().min(0).max(24 * 60 - 1);

export const SlotKind = z.enum(['period', 'break', 'assembly', 'formTime', 'registration']);
export type SlotKind = z.infer<typeof SlotKind>;

export const BellSlot = z.object({
  id: Id,
  kind: SlotKind,
  label: z.string(),
  start: ClockMinutes,
  duration: z.number().int().positive(),
});
export type BellSlot = z.infer<typeof BellSlot>;

export const BellSchedule = Named.extend({
  slots: z.array(BellSlot),
  /** Replaces the slot list on specific weekdays (e.g. shorter Friday). */
  dayOverrides: z.record(Weekday, z.array(BellSlot)).default({}),
});
export type BellSchedule = z.infer<typeof BellSchedule>;

/** Saturday / after-school / early-morning sessions. */
export const ExtraSession = Named.extend({
  day: Weekday,
  start: ClockMinutes,
  duration: z.number().int().positive(),
  countsAsTeaching: z.boolean(),
  sectionIds: z.array(Id).default([]),
});
export type ExtraSession = z.infer<typeof ExtraSession>;

export const OverlayKind = z.enum([
  'termTest',
  'mock',
  'examSeries',
  'examCentre',
  'markingCamp',
  'sportsMeet',
  'holiday',
  'other',
]);

/** Date-ranged event layered over the weekly timetable. */
export const CalendarOverlay = Named.extend({
  kind: OverlayKind,
  from: IsoDate,
  to: IsoDate,
  blockedRoomIds: z.array(Id).default([]),
  /** Classes/groups that are away or sitting exams (their teachers become free for relief). */
  removedGroupIds: z.array(Id).default([]),
  /** Teachers away for the whole range (e.g. O/L marking camp). */
  absentTeacherIds: z.array(Id).default([]),
  note: z.string().default(''),
});
export type CalendarOverlay = z.infer<typeof CalendarOverlay>;

// ---------------------------------------------------------------- helpers

export interface Interval {
  start: number;
  end: number;
}

/** Half-open overlap: [a.start, a.end) ∩ [b.start, b.end) ≠ ∅. Touching intervals do not clash. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function slotsForDay(schedule: BellSchedule, day: Weekday): BellSlot[] {
  return schedule.dayOverrides[day] ?? schedule.slots;
}

export function teachingSlots(schedule: BellSchedule, day: Weekday): BellSlot[] {
  return slotsForDay(schedule, day).filter((s) => s.kind === 'period');
}

export function slotInterval(slot: Pick<BellSlot, 'start' | 'duration'>): Interval {
  return { start: slot.start, end: slot.start + slot.duration };
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 1600 → "26 h 40 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function parseClock(text: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) throw new Error(`Invalid time "${text}"`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) throw new Error(`Invalid time "${text}"`);
  return h * 60 + m;
}

/**
 * Builds a schedule's slot list from a compact description, laying slots end to end.
 * Example: buildSlots('07:30', [['assembly','Assembly',20], ['period','P1',40], ...])
 */
export function buildSlots(
  startClock: string,
  parts: ReadonlyArray<readonly [SlotKind, string, number]>,
  idPrefix: string,
): BellSlot[] {
  let t = parseClock(startClock);
  return parts.map(([kind, label, duration], i) => {
    const slot: BellSlot = { id: `${idPrefix}_${i}`, kind, label, start: t, duration };
    t += duration;
    return slot;
  });
}

/** Total teaching minutes per week for a schedule over the given working days. */
export function weeklyTeachingMinutes(schedule: BellSchedule, days: readonly Weekday[]): number {
  return days.reduce(
    (sum, d) => sum + teachingSlots(schedule, d).reduce((s, slot) => s + slot.duration, 0),
    0,
  );
}
