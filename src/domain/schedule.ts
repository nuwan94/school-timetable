import { z } from 'zod';
import { Id, IsoDate } from './common';
import { Weekday } from './time';

// ------------------------------------------------------------------ rules

export const Strength = z.enum(['hard', 'low', 'medium', 'high', 'veryHigh']);
export type Strength = z.infer<typeof Strength>;

export const STRENGTH_WEIGHT: Record<Exclude<Strength, 'hard'>, number> = {
  low: 1,
  medium: 5,
  high: 25,
  veryHigh: 100,
};

export const RuleScope = z.object({
  sectionIds: z.array(Id).default([]),
  gradeLevels: z.array(z.number().int()).default([]),
  classIds: z.array(Id).default([]),
  subjectIds: z.array(Id).default([]),
  teacherIds: z.array(Id).default([]),
});
export type RuleScope = z.infer<typeof RuleScope>;

/** A rule from the built-in catalogue (R1, R4, …) as configured for this project. */
export const RuleConfig = z.object({
  id: Id,
  /** Catalogue code, e.g. "R1". */
  code: z.string(),
  enabled: z.boolean(),
  strength: Strength,
  scope: RuleScope.default({}),
  params: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}),
});
export type RuleConfig = z.infer<typeof RuleConfig>;

// -------------------------------------------------------------- timetable

export const Placement = z.object({
  /** Allocation id or option-block line id. */
  itemId: Id,
  /** Which occurrence of the item's pattern this is. */
  occurrence: z.number().int().nonnegative(),
  day: Weekday,
  /** First bell slot occupied (doubles extend into following period slots). */
  slotId: Id,
  roomId: Id.nullable().default(null),
  locked: z.boolean().default(false),
});
export type Placement = z.infer<typeof Placement>;

export const VersionStatus = z.enum(['draft', 'approved', 'superseded']);

export const TimetableVersion = z.object({
  id: Id,
  name: z.string(),
  status: VersionStatus.default('draft'),
  effectiveFrom: IsoDate.nullable().default(null),
  basedOnId: Id.nullable().default(null),
  note: z.string().default(''),
  createdAt: z.string(),
  placements: z.array(Placement).default([]),
  /** The base version's lessons as they were when this version was made (who taught what, when) — for diffs and change notices. */
  baseSnapshot: z.array(z.object({ key: z.string(), day: Weekday, slotIds: z.array(Id), teacherIds: z.array(Id), roomIds: z.array(Id) })).default([]),
});
export type TimetableVersion = z.infer<typeof TimetableVersion>;

// ------------------------------------------------------------------ relief

export const Recurrence = z.object({
  /** Weekday that recurs. */
  day: Weekday,
  /** 1 = every week, 2 = fortnightly, … */
  everyWeeks: z.number().int().positive().default(1),
  /** Anchor date the recurrence counts from. */
  from: IsoDate,
  to: IsoDate.nullable().default(null),
});

export const Absence = z.object({
  id: Id,
  teacherId: Id,
  from: IsoDate,
  to: IsoDate,
  /** Empty = whole day. */
  slotIds: z.array(Id).default([]),
  recurrence: Recurrence.nullable().default(null),
  reason: z.string().default(''),
  /** Long leave: the teacher who takes over (suggested first for relief). */
  coverTeacherId: Id.nullable().default(null),
});
export type Absence = z.infer<typeof Absence>;

export const ReliefKind = z.enum(['teacher', 'combine', 'classTeacher', 'supervised']);

export const ReliefAssignment = z.object({
  id: Id,
  date: IsoDate,
  slotId: Id,
  itemId: Id,
  absentTeacherId: Id,
  kind: ReliefKind,
  reliefTeacherId: Id.nullable().default(null),
  /** For 'combine': the class this one joins. */
  combineWithGroupId: Id.nullable().default(null),
  note: z.string().default(''),
});
export type ReliefAssignment = z.infer<typeof ReliefAssignment>;

// ------------------------------------------------------------------ term tests

export const ExamSession = z.object({ id: Id, label: z.string(), start: z.number().int(), end: z.number().int() });
export type ExamSession = z.infer<typeof ExamSession>;

export const ExamPaper = z.object({
  id: Id,
  subjectId: Id,
  classIds: z.array(Id),
  date: IsoDate,
  sessionId: Id,
});
export type ExamPaper = z.infer<typeof ExamPaper>;

/** One supervisor in one exam room (the class's own room) for one paper. */
export const Invigilation = z.object({ paperId: Id, classId: Id, teacherId: Id });
export type Invigilation = z.infer<typeof Invigilation>;

export const ExamSeries = z.object({
  id: Id,
  name: z.string(),
  from: IsoDate,
  to: IsoDate,
  sessions: z.array(ExamSession),
  papers: z.array(ExamPaper).default([]),
  invigilation: z.array(Invigilation).default([]),
});
export type ExamSeries = z.infer<typeof ExamSeries>;

// ------------------------------------------------------------ duty rosters

/** A time that needs staff on duty, e.g. "Interval 10:30–10:50" or "Morning gate 07:00–07:30". */
export const DutySession = z.object({
  id: Id,
  label: z.string(),
  start: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 - 1),
  end: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 - 1),
});
export type DutySession = z.infer<typeof DutySession>;

export const DutyAssignment = z.object({
  day: Weekday,
  sessionId: Id,
  post: z.string(),
  teacherId: Id,
});
export type DutyAssignment = z.infer<typeof DutyAssignment>;

/** A weekly duty roster (interval, gate, …): posts × sessions × days, one teacher per cell. */
export const DutyRoster = z.object({
  id: Id,
  name: z.string(),
  kind: z.enum(['interval', 'gate', 'other']).default('other'),
  posts: z.array(z.string()).default([]),
  sessions: z.array(DutySession).default([]),
  days: z.array(Weekday).default([]),
  /** Teachers never put on this roster (e.g. the principal). */
  excludedTeacherIds: z.array(Id).default([]),
  assignments: z.array(DutyAssignment).default([]),
});
export type DutyRoster = z.infer<typeof DutyRoster>;
