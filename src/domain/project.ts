import { z } from 'zod';
import { Id, LocalText, Pack } from './common';
import {
  Allocation,
  CurriculumTemplate,
  Grade,
  House,
  MergedClass,
  MultiGradeGroup,
  OptionBlock,
  Role,
  Room,
  RoomType,
  SchoolClass,
  Section,
  Student,
  StudentGroup,
  Subject,
  Teacher,
} from './entities';
import { Absence, ReliefAssignment, RuleConfig, TimetableVersion } from './schedule';
import { BellSchedule, CalendarOverlay, ExtraSession, Weekday } from './time';

export const FILE_FORMAT = 'school-timetable';
/** Bump when the shape changes and add a step to migrations.ts. */
export const SCHEMA_VERSION = 1;

export const Institute = z.object({
  name: z.string().default(''),
  local: LocalText.default({}),
  address: z.string().default(''),
  motto: z.string().default(''),
  /** Logo as a data: URL so it travels inside the project file. */
  logo: z.string().nullable().default(null),
  academicYear: z.string().default(''),
  term: z.string().default(''),
  workingDays: z.array(Weekday).min(1),
  printLanguage: z.enum(['en', 'si', 'ta']).default('en'),
  gradeLabel: z.string().default('Grade'),
});
export type Institute = z.infer<typeof Institute>;

export const Project = z.object({
  format: z.literal(FILE_FORMAT),
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  pack: Pack,
  simpleMode: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),

  institute: Institute,
  bellSchedules: z.array(BellSchedule).default([]),
  extraSessions: z.array(ExtraSession).default([]),
  overlays: z.array(CalendarOverlay).default([]),

  sections: z.array(Section).default([]),
  grades: z.array(Grade).default([]),
  classes: z.array(SchoolClass).default([]),
  multiGradeGroups: z.array(MultiGradeGroup).default([]),
  mergedClasses: z.array(MergedClass).default([]),
  houses: z.array(House).default([]),
  studentGroups: z.array(StudentGroup).default([]),
  students: z.array(Student).default([]),

  subjects: z.array(Subject).default([]),
  roomTypes: z.array(RoomType).default([]),
  rooms: z.array(Room).default([]),
  roles: z.array(Role).default([]),
  teachers: z.array(Teacher).default([]),

  allocations: z.array(Allocation).default([]),
  optionBlocks: z.array(OptionBlock).default([]),
  templates: z.array(CurriculumTemplate).default([]),
  rules: z.array(RuleConfig).default([]),

  versions: z.array(TimetableVersion).default([]),
  activeVersionId: Id.nullable().default(null),

  absences: z.array(Absence).default([]),
  relief: z.array(ReliefAssignment).default([]),
});
export type Project = z.infer<typeof Project>;
/** Input shape (defaults optional) — handy for fixtures and pack builders. */
export type ProjectInput = z.input<typeof Project>;

/**
 * Cross-entity reference checks that Zod can't express. Returns human-readable
 * problems; an empty list means the file is internally consistent.
 */
export function findBrokenReferences(p: Project): string[] {
  const problems: string[] = [];
  const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
  const schedules = ids(p.bellSchedules);
  const sections = ids(p.sections);
  const grades = ids(p.grades);
  const classes = ids(p.classes);
  const groups = new Set([...classes, ...ids(p.studentGroups)]);
  const subjects = ids(p.subjects);
  const teachers = ids(p.teachers);
  const rooms = ids(p.rooms);

  const check = (ok: boolean, msg: string) => {
    if (!ok) problems.push(msg);
  };

  for (const s of p.sections)
    check(schedules.has(s.bellScheduleId), `Section "${s.name}" uses a missing bell schedule`);
  for (const g of p.grades) check(sections.has(g.sectionId), `Grade "${g.name}" has a missing section`);
  for (const c of p.classes) {
    check(grades.has(c.gradeId), `Class "${c.name}" has a missing grade`);
    if (c.classTeacherId)
      check(teachers.has(c.classTeacherId), `Class "${c.name}" has a missing class teacher`);
  }
  for (const g of p.studentGroups)
    for (const c of g.classIds) check(classes.has(c), `Group "${g.name}" refers to a missing class`);
  for (const a of p.allocations) {
    check(subjects.has(a.subjectId), `Allocation ${a.id} has a missing subject`);
    for (const g of a.groupIds) check(groups.has(g), `Allocation ${a.id} refers to a missing class/group`);
    for (const t of a.teacherIds) check(teachers.has(t), `Allocation ${a.id} refers to a missing teacher`);
    if (a.roomId) check(rooms.has(a.roomId), `Allocation ${a.id} refers to a missing room`);
  }
  const studentGroups = ids(p.studentGroups);
  for (const b of p.optionBlocks) {
    for (const c of b.classIds) check(classes.has(c), `Option block "${b.name}" refers to a missing class`);
    for (const l of b.lines)
      for (const s of l.sets) {
        check(subjects.has(s.subjectId), `Option block "${b.name}" has a group with a missing subject`);
        check(studentGroups.has(s.groupId), `Option block "${b.name}" has a missing student group`);
        for (const t of s.teacherIds) check(teachers.has(t), `Option block "${b.name}" refers to a missing teacher`);
      }
  }
  for (const m of p.mergedClasses)
    for (const c of m.classIds) check(classes.has(c), `Merge "${m.name}" refers to a missing class`);
  for (const g of p.multiGradeGroups)
    for (const c of g.classIds) check(classes.has(c), `Multi-grade group "${g.name}" refers to a missing class`);
  if (p.activeVersionId)
    check(
      p.versions.some((v) => v.id === p.activeVersionId),
      'The active timetable version does not exist',
    );
  return problems;
}
