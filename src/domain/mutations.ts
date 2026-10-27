import type { Draft } from 'immer';
import type { Allocation, SchoolClass } from './entities';
import { makeAllocation, makeClass, makeGrade, patternPeriods } from './factories';
import type { Project } from './project';

/**
 * Edits that must keep the project internally consistent. They run on Immer
 * drafts inside `useProjectStore.update`.
 */

export type EntityKind = 'section' | 'grade' | 'class' | 'subject' | 'roomType' | 'room' | 'role' | 'teacher' | 'bellSchedule';

/** What would be affected by deleting an entity; shown in the confirm dialog. */
export function deleteImpact(p: Project, kind: EntityKind, id: string): string[] {
  const n = (count: number, what: string) => (count > 0 ? [`${count} ${what}`] : []);
  switch (kind) {
    case 'section':
      return n(p.grades.filter((g) => g.sectionId === id).length, 'grade(s) and their classes');
    case 'grade': {
      const classIds = new Set(p.classes.filter((c) => c.gradeId === id).map((c) => c.id));
      return [
        ...n(classIds.size, 'class(es)'),
        ...n(p.allocations.filter((a) => a.groupIds.some((g) => classIds.has(g))).length, 'allocation(s)'),
      ];
    }
    case 'class':
      return n(p.allocations.filter((a) => a.groupIds.includes(id)).length, 'allocation(s)');
    case 'subject':
      return n(p.allocations.filter((a) => a.subjectId === id).length, 'allocation(s)');
    case 'teacher':
      return [
        ...n(p.allocations.filter((a) => a.teacherIds.includes(id)).length, 'allocation(s) become uncovered'),
        ...n(p.classes.filter((c) => c.classTeacherId === id).length, 'class(es) lose their class teacher'),
      ];
    case 'room':
      return n(p.classes.filter((c) => c.homeRoomId === id).length, 'class(es) lose their home room');
    case 'roomType':
      return n(p.rooms.filter((r) => r.roomTypeId === id).length, 'room(s) lose their type');
    case 'role':
      return n(p.teachers.filter((t) => t.roleId === id).length, 'teacher(s) lose their role');
    case 'bellSchedule':
      return n(p.sections.filter((s) => s.bellScheduleId === id).length, 'section(s) use it');
  }
}

/** Deletes an entity and cleans up everything that referenced it. */
export function deleteEntity(d: Draft<Project>, kind: EntityKind, id: string): void {
  switch (kind) {
    case 'section':
      for (const g of d.grades.filter((x) => x.sectionId === id)) deleteEntity(d, 'grade', g.id);
      d.sections = d.sections.filter((x) => x.id !== id);
      break;
    case 'grade':
      for (const c of d.classes.filter((x) => x.gradeId === id)) deleteEntity(d, 'class', c.id);
      d.grades = d.grades.filter((x) => x.id !== id);
      break;
    case 'class':
      d.classes = d.classes.filter((x) => x.id !== id);
      d.studentGroups = d.studentGroups.filter((g) => {
        g.classIds = g.classIds.filter((c) => c !== id);
        return g.classIds.length > 0;
      });
      d.allocations = d.allocations.filter((a) => {
        a.groupIds = a.groupIds.filter((g) => g !== id);
        return a.groupIds.length > 0;
      });
      break;
    case 'subject':
      d.subjects = d.subjects.filter((x) => x.id !== id);
      d.allocations = d.allocations.filter((a) => a.subjectId !== id);
      for (const t of d.teachers) {
        t.subjectIds = t.subjectIds.filter((s) => s !== id);
        if (t.appointmentSubjectId === id) t.appointmentSubjectId = null;
      }
      break;
    case 'teacher':
      d.teachers = d.teachers.filter((x) => x.id !== id);
      for (const a of d.allocations) {
        if (!a.teacherIds.includes(id)) continue;
        a.teacherIds = a.teacherIds.filter((t) => t !== id);
        if (a.teacherIds.length === 0) a.status = 'uncovered';
      }
      for (const c of d.classes) if (c.classTeacherId === id) c.classTeacherId = null;
      break;
    case 'room':
      d.rooms = d.rooms.filter((x) => x.id !== id);
      for (const c of d.classes) if (c.homeRoomId === id) c.homeRoomId = null;
      for (const a of d.allocations) if (a.roomId === id) a.roomId = null;
      break;
    case 'roomType':
      d.roomTypes = d.roomTypes.filter((x) => x.id !== id);
      for (const r of d.rooms) if (r.roomTypeId === id) r.roomTypeId = null;
      for (const s of d.subjects) if (s.roomTypeId === id) s.roomTypeId = null;
      break;
    case 'role':
      d.roles = d.roles.filter((x) => x.id !== id);
      for (const t of d.teachers) if (t.roleId === id) t.roleId = null;
      break;
    case 'bellSchedule':
      if (d.sections.some((s) => s.bellScheduleId === id)) throw new Error('This bell schedule is still used by a section.');
      d.bellSchedules = d.bellSchedules.filter((x) => x.id !== id);
      break;
  }
}

/**
 * Bulk-creates grades `fromLevel..toLevel` with classes named "<level><letter>"
 * (6A, 6B…), reusing grades that already exist at a level in the section.
 * Returns the number of classes created.
 */
export function quickAddClasses(
  d: Draft<Project>,
  opts: { sectionId: string; fromLevel: number; toLevel: number; letters: string[]; medium: SchoolClass['medium'] },
): number {
  let created = 0;
  for (let level = opts.fromLevel; level <= opts.toLevel; level++) {
    let grade = d.grades.find((g) => g.sectionId === opts.sectionId && g.level === level);
    if (!grade) {
      d.grades.push(makeGrade({ name: `${d.institute.gradeLabel} ${level}`, sectionId: opts.sectionId, level }));
      grade = d.grades[d.grades.length - 1]!;
    }
    for (const letter of opts.letters) {
      const name = `${level}${letter}`;
      if (d.classes.some((c) => c.gradeId === grade!.id && c.name === name)) continue;
      d.classes.push(makeClass({ name, gradeId: grade.id, medium: opts.medium }));
      created++;
    }
  }
  return created;
}

/** The simple matrix allocation for one class × subject (single class, not combined). */
export function findCellAllocation(p: Pick<Project, 'allocations'>, classId: string, subjectId: string): Allocation | undefined {
  return p.allocations.find((a) => a.subjectId === subjectId && a.groupIds.length === 1 && a.groupIds[0] === classId);
}

/**
 * Sets the matrix cell for class × subject. `periods: 0` removes it.
 * Status is derived when not given: no teacher → uncovered; teacher not
 * qualified for the subject → covering.
 */
export function setCellAllocation(
  d: Draft<Project>,
  classId: string,
  subjectId: string,
  change: { periods?: number; teacherId?: string | null; pattern?: Allocation['pattern']; status?: Allocation['status'] },
): void {
  let alloc = findCellAllocation(d, classId, subjectId) as Draft<Allocation> | undefined;
  const periods = change.periods ?? (change.pattern ? patternPeriods(change.pattern) : alloc ? patternPeriods(alloc.pattern) : 0);
  if (periods <= 0) {
    if (alloc) d.allocations = d.allocations.filter((a) => a !== alloc);
    return;
  }
  if (!alloc) {
    d.allocations.push(makeAllocation({ subjectId, groupIds: [classId], periods, status: 'uncovered' }));
    alloc = d.allocations[d.allocations.length - 1]!;
  }
  if (change.pattern) alloc.pattern = change.pattern;
  else if (change.periods !== undefined && patternPeriods(alloc.pattern) !== periods) {
    alloc.pattern = [{ length: 1, count: periods }];
  }
  if (change.teacherId !== undefined) alloc.teacherIds = change.teacherId ? [change.teacherId] : [];
  if (change.status) alloc.status = change.status;
  else if (change.teacherId !== undefined) {
    const teacher = d.teachers.find((t) => t.id === change.teacherId);
    alloc.status = !teacher ? 'uncovered' : teacher.subjectIds.includes(subjectId) ? 'appointed' : 'covering';
  }
}

/**
 * Copies one class's subject periods (not teachers) to other classes —
 * the "apply to whole grade" shortcut. Existing teachers in targets are kept.
 */
export function copyClassPeriods(d: Draft<Project>, fromClassId: string, toClassIds: string[]): void {
  const source = d.allocations.filter((a) => a.groupIds.length === 1 && a.groupIds[0] === fromClassId);
  for (const target of toClassIds) {
    if (target === fromClassId) continue;
    for (const a of source) setCellAllocation(d, target, a.subjectId, { pattern: a.pattern.map((p) => ({ ...p })) });
  }
}
