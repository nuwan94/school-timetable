import { z } from 'zod';
import { Id, IsoDate, Medium, Named } from './common';
import { ClockMinutes, Weekday } from './time';

// ------------------------------------------------------------ structure

export const Section = Named.extend({
  bellScheduleId: Id,
  order: z.number().int().default(0),
});
export type Section = z.infer<typeof Section>;

export const Grade = Named.extend({
  sectionId: Id,
  /** Numeric level used for scoping rules (e.g. R4 applies to grades 6–11). */
  level: z.number().int(),
});
export type Grade = z.infer<typeof Grade>;

export const ClassMedium = z.union([Medium, z.literal('bilingual')]);

export const SchoolClass = Named.extend({
  gradeId: Id,
  medium: ClassMedium,
  stream: z.string().default(''),
  classTeacherId: Id.nullable().default(null),
  homeRoomId: Id.nullable().default(null),
  studentCount: z.number().int().nonnegative().default(0),
  /** Exam classes (Grade 11 / 13) leave on this date; later versions free their teachers. */
  activeUntil: IsoDate.nullable().default(null),
  houseId: Id.nullable().default(null),
});
export type SchoolClass = z.infer<typeof SchoolClass>;

/** One teacher and one room holding several grades together (small-school primary). */
export const MultiGradeGroup = Named.extend({
  classIds: z.array(Id).min(2),
});
export type MultiGradeGroup = z.infer<typeof MultiGradeGroup>;

/** Classes combined for every subject except the listed ones (low numbers). */
export const MergedClass = Named.extend({
  classIds: z.array(Id).min(2),
  exceptSubjectIds: z.array(Id).default([]),
});
export type MergedClass = z.infer<typeof MergedClass>;

export const House = Named.extend({ colour: z.string().default('#888888') });
export type House = z.infer<typeof House>;

// ------------------------------------------------------- student groups

/**
 * The clash unit. A class is implicitly a group; sub-groups model bilingual
 * splits, SNL / Religion / Aesthetics groups, O/L baskets, A/L combinations
 * and international sets (which may span Year groups).
 */
export const StudentGroup = Named.extend({
  /** Classes whose students this group draws from. */
  classIds: z.array(Id).min(1),
  kind: z.enum(['subGroup', 'combination', 'set']),
  medium: Medium.nullable().default(null),
  /** Count-based membership (government default). Ignored when students are listed. */
  studentCount: z.number().int().nonnegative().default(0),
  /** Listed members (International): every student in this set. Empty = count-based. */
  studentIds: z.array(Id).default([]),
});
export type StudentGroup = z.infer<typeof StudentGroup>;

export const SubjectChoice = z.object({
  subjectId: Id,
  from: IsoDate.nullable().default(null),
  to: IsoDate.nullable().default(null),
});

/** Individual student (International pack; optional elsewhere). */
export const Student = Named.extend({
  admissionNo: z.string().default(''),
  classId: Id,
  houseId: Id.nullable().default(null),
  medium: Medium.nullable().default(null),
  choices: z.array(SubjectChoice).default([]),
});
export type Student = z.infer<typeof Student>;

// --------------------------------------------------------------- subjects

export const Subject = Named.extend({
  colour: z.string().default('#64748b'),
  kind: z.enum(['theory', 'practical', 'activity', 'selfStudy']).default('theory'),
  /** Cuts in shortage mode remove low-priority periods first. */
  priority: z.enum(['core', 'normal', 'low']).default('normal'),
  heavy: z.boolean().default(false),
  roomTypeId: Id.nullable().default(null),
  board: z.enum(['national', 'cambridge', 'edexcel', 'other']).default('national'),
  syllabusCode: z.string().default(''),
  level: z.string().default(''),
  tier: z.string().default(''),
  /** Classes may be merged for this subject when short of teachers. */
  combinable: z.boolean().default(false),
  /** Contact-time target in minutes per week (International). Null = no target. */
  targetMinutes: z.number().int().positive().nullable().default(null),
  /** Guided learning hours for the whole course, from the board's specification. */
  glh: z.number().positive().nullable().default(null),
  /** School years the course runs over (IGCSE and A Level usually 2). */
  courseYears: z.number().int().positive().default(1),
});
export type Subject = z.infer<typeof Subject>;

// ------------------------------------------------------------------ rooms

export const RoomType = Named;
export type RoomType = z.infer<typeof RoomType>;

export const Room = Named.extend({
  roomTypeId: Id.nullable().default(null),
  seats: z.number().int().nonnegative().default(0),
  /** Lessons the room can host at once (playground 2, hall 3). */
  concurrent: z.number().int().positive().default(1),
});
export type Room = z.infer<typeof Room>;

// --------------------------------------------------------------- teachers

export const EmploymentCategory = z.enum([
  'permanent',
  'contract',
  'attached',
  'visiting',
  'developmentOfficer',
  'trainee',
  'coach',
  'vacancy',
]);
export type EmploymentCategory = z.infer<typeof EmploymentCategory>;

/** Categories excluded from cadre counts in SL returns. */
export const NOT_IN_CADRE: readonly EmploymentCategory[] = [
  'visiting',
  'developmentOfficer',
  'trainee',
  'coach',
  'vacancy',
];

export const LoadUnit = z.enum(['periods', 'minutes']);

export const LoadNorm = z.object({
  unit: LoadUnit,
  min: z.number().nonnegative().nullable(),
  max: z.number().nonnegative().nullable(),
});
export type LoadNorm = z.infer<typeof LoadNorm>;

export const Role = Named.extend({ norm: LoadNorm });
export type Role = z.infer<typeof Role>;

export const TimeWindow = z.object({
  day: Weekday,
  start: ClockMinutes,
  end: ClockMinutes,
});
export type TimeWindow = z.infer<typeof TimeWindow>;

export const DutyQuota = z.object({
  label: z.string(),
  perWeek: z.number().int().positive(),
});

export const Teacher = Named.extend({
  title: z.string().default(''),
  roleId: Id.nullable().default(null),
  normOverride: LoadNorm.nullable().default(null),
  category: EmploymentCategory.default('permanent'),
  department: z.string().default(''),

  // Service data for SL returns (all optional).
  serviceGrade: z.string().default(''),
  appointmentType: z.string().default(''),
  appointmentSubjectId: Id.nullable().default(null),
  appointmentMedium: Medium.nullable().default(null),
  appointedToSchoolOn: IsoDate.nullable().default(null),
  nic: z.string().default(''),

  subjectIds: z.array(Id).default([]),
  media: z.array(Medium).default([]),

  /** Empty = every working day. */
  contractedDays: z.array(Weekday).default([]),
  /** If non-empty, the teacher is available only inside these windows. */
  windows: z.array(TimeWindow).default([]),
  /** The other school a visiting/attached teacher works at. */
  hostSchool: z.string().default(''),
  /** Specific blocked times (exceptions). */
  unavailable: z.array(TimeWindow).default([]),
  duties: z.array(DutyQuota).default([]),
  /** Contracted working minutes per week (expatriate staff): teaching plus duties. */
  contractMinutes: z.number().int().positive().nullable().default(null),
  /** Hourly rate for visiting specialists' claims (any currency). */
  hourlyRate: z.number().nonnegative().nullable().default(null),
});
export type Teacher = z.infer<typeof Teacher>;

// ------------------------------------------------------------ allocations

export const AllocationStatus = z.enum(['appointed', 'covering', 'uncovered']);
export type AllocationStatus = z.infer<typeof AllocationStatus>;

/** e.g. 1 double + 3 singles = [{length:2,count:1},{length:1,count:3}]. */
export const BlockPattern = z.array(
  z.object({ length: z.number().int().positive(), count: z.number().int().positive() }),
);

export const FixedPlacement = z.object({ day: Weekday, slotId: Id });

/** One lesson requirement: group(s) × subject × teacher(s) × weekly amount × pattern. */
export const Allocation = z.object({
  id: Id,
  subjectId: Id,
  /** Class ids or student-group ids (several = combined lesson). */
  groupIds: z.array(Id).min(1),
  /** Several = co-teaching. Empty only when status is 'uncovered'. */
  teacherIds: z.array(Id).default([]),
  status: AllocationStatus.default('appointed'),
  pattern: BlockPattern,
  roomId: Id.nullable().default(null),
  fixed: z.array(FixedPlacement).default([]),
  note: z.string().default(''),
});
export type Allocation = z.infer<typeof Allocation>;

export const BlockSet = z.object({
  id: Id,
  subjectId: Id,
  groupId: Id,
  teacherIds: z.array(Id).default([]),
  roomId: Id.nullable().default(null),
});

export const BlockLine = z.object({
  id: Id,
  label: z.string(),
  pattern: BlockPattern,
  sets: z.array(BlockSet),
});

/** Option block: lines placed as single units; every set in a line runs at once. */
export const OptionBlock = Named.extend({
  /** Classes involved (may span grades / Year groups). */
  classIds: z.array(Id).min(1),
  lines: z.array(BlockLine),
});
export type OptionBlock = z.infer<typeof OptionBlock>;

// ------------------------------------------------------------- templates

export const CurriculumTemplate = Named.extend({
  /** Curriculum year / reform version, e.g. "NIE 2024 reform". */
  version: z.string(),
  gradeLevel: z.number().int(),
  stream: z.string().default(''),
  items: z.array(
    z.object({
      subjectCode: z.string(),
      amount: z.number().positive(),
      unit: LoadUnit,
      /** Double periods within `amount` (periods unit only). */
      doubles: z.number().int().nonnegative().default(0),
    }),
  ),
});
export type CurriculumTemplate = z.infer<typeof CurriculumTemplate>;
