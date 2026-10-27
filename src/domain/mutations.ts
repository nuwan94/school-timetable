import type { Draft } from 'immer';
import { newId } from './common';
import { MergedClass, MultiGradeGroup, type Allocation, type SchoolClass } from './entities';
import { makeAllocation, makeClass, makeGrade, patternPeriods } from './factories';
import type { Project } from './project';

/**
 * Edits that must keep the project internally consistent. They run on Immer
 * drafts inside `useProjectStore.update`.
 */

export type EntityKind = 'section' | 'grade' | 'class' | 'subject' | 'roomType' | 'room' | 'role' | 'teacher' | 'bellSchedule';

const blockSets = (p: Project) => p.optionBlocks.flatMap((b) => b.lines.flatMap((l) => l.sets));

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
      return [
        ...n(p.allocations.filter((a) => a.groupIds.includes(id)).length, 'allocation(s)'),
        ...n(p.optionBlocks.filter((b) => b.classIds.includes(id)).length, 'option block(s) lose this class'),
      ];
    case 'subject':
      return [
        ...n(p.allocations.filter((a) => a.subjectId === id).length, 'allocation(s)'),
        ...n(blockSets(p).filter((s) => s.subjectId === id).length, 'option-block group(s)'),
      ];
    case 'teacher':
      return [
        ...n(p.allocations.filter((a) => a.teacherIds.includes(id)).length, 'allocation(s) become uncovered'),
        ...n(blockSets(p).filter((s) => s.teacherIds.includes(id)).length, 'option-block group(s) lose their teacher'),
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
    case 'class': {
      d.classes = d.classes.filter((x) => x.id !== id);
      d.studentGroups = d.studentGroups.filter((g) => {
        g.classIds = g.classIds.filter((c) => c !== id);
        return g.classIds.length > 0;
      });
      const groups = new Set(d.studentGroups.map((g) => g.id));
      d.allocations = d.allocations.filter((a) => {
        a.groupIds = a.groupIds.filter((g) => g !== id);
        return a.groupIds.length > 0;
      });
      d.optionBlocks = d.optionBlocks.filter((b) => {
        b.classIds = b.classIds.filter((c) => c !== id);
        for (const line of b.lines) line.sets = line.sets.filter((s) => groups.has(s.groupId));
        return b.classIds.length > 0;
      });
      d.multiGradeGroups = d.multiGradeGroups.filter((g) => (g.classIds = g.classIds.filter((c) => c !== id)).length >= 2);
      d.mergedClasses = d.mergedClasses.filter((m) => (m.classIds = m.classIds.filter((c) => c !== id)).length >= 2);
      break;
    }
    case 'subject':
      d.subjects = d.subjects.filter((x) => x.id !== id);
      d.allocations = d.allocations.filter((a) => a.subjectId !== id);
      for (const t of d.teachers) {
        t.subjectIds = t.subjectIds.filter((s) => s !== id);
        if (t.appointmentSubjectId === id) t.appointmentSubjectId = null;
      }
      for (const b of d.optionBlocks) for (const line of b.lines) line.sets = line.sets.filter((s) => s.subjectId !== id);
      for (const m of d.mergedClasses) m.exceptSubjectIds = m.exceptSubjectIds.filter((s) => s !== id);
      pruneStudentGroups(d);
      break;
    case 'teacher':
      d.teachers = d.teachers.filter((x) => x.id !== id);
      for (const a of d.allocations) {
        if (!a.teacherIds.includes(id)) continue;
        a.teacherIds = a.teacherIds.filter((t) => t !== id);
        if (a.teacherIds.length === 0) a.status = 'uncovered';
      }
      for (const b of d.optionBlocks) for (const line of b.lines) for (const s of line.sets) s.teacherIds = s.teacherIds.filter((t) => t !== id);
      for (const c of d.classes) if (c.classTeacherId === id) c.classTeacherId = null;
      break;
    case 'room':
      d.rooms = d.rooms.filter((x) => x.id !== id);
      for (const c of d.classes) if (c.homeRoomId === id) c.homeRoomId = null;
      for (const a of d.allocations) if (a.roomId === id) a.roomId = null;
      for (const b of d.optionBlocks) for (const line of b.lines) for (const s of line.sets) if (s.roomId === id) s.roomId = null;
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

/** Removes sub-groups that no block set or allocation refers to any more. */
export function pruneStudentGroups(d: Draft<Project>): void {
  const used = new Set<string>();
  for (const a of d.allocations) for (const g of a.groupIds) used.add(g);
  for (const b of d.optionBlocks) for (const line of b.lines) for (const s of line.sets) used.add(s.groupId);
  d.studentGroups = d.studentGroups.filter((g) => used.has(g.id));
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

type CellSource = Pick<Project, 'allocations' | 'mergedClasses'>;

/** The merge that combines this class for this subject, if any. */
export function mergeFor(p: Pick<Project, 'mergedClasses'>, classId: string, subjectId: string) {
  return p.mergedClasses.find((m) => m.classIds.includes(classId) && !m.exceptSubjectIds.includes(subjectId));
}

/** Groups a matrix cell's allocation covers: the class alone, or all classes merged with it for this subject. */
export function cellGroupIds(p: Pick<Project, 'mergedClasses'>, classId: string, subjectId: string): string[] {
  return mergeFor(p, classId, subjectId)?.classIds ?? [classId];
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** The matrix allocation for class × subject (shared by all classes merged with it). */
export function findCellAllocation(p: CellSource, classId: string, subjectId: string): Allocation | undefined {
  const groups = cellGroupIds(p, classId, subjectId);
  return p.allocations.find((a) => a.subjectId === subjectId && sameSet(a.groupIds, groups));
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
    d.allocations.push(makeAllocation({ subjectId, groupIds: cellGroupIds(d, classId, subjectId), periods, status: 'uncovered' }));
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
  const source = d.subjects
    .map((s) => findCellAllocation(d, fromClassId, s.id))
    .filter((a): a is Draft<Allocation> => !!a)
    .map((a) => ({ subjectId: a.subjectId, pattern: a.pattern.map((p) => ({ ...p })) }));
  for (const target of toClassIds) {
    if (target === fromClassId) continue;
    for (const a of source) setCellAllocation(d, target, a.subjectId, { pattern: a.pattern.map((p) => ({ ...p })) });
  }
}

// ------------------------------------------------------------ merged classes

/**
 * Merges classes for every subject except `exceptSubjectIds`. Existing
 * per-class allocations of merged subjects collapse into one combined
 * allocation (the first class's periods and teacher win).
 */
export function mergeClasses(d: Draft<Project>, input: { name: string; classIds: string[]; exceptSubjectIds: string[] }): string {
  if (input.classIds.length < 2) throw new Error('Pick at least two classes to merge.');
  const taken = d.mergedClasses.find((m) => m.classIds.some((c) => input.classIds.includes(c)));
  if (taken) throw new Error(`A class is already in merge "${taken.name}".`);
  const id = newId('mrg');
  for (const subject of d.subjects) {
    if (input.exceptSubjectIds.includes(subject.id)) continue;
    const singles = input.classIds
      .map((c) => d.allocations.find((a) => a.subjectId === subject.id && a.groupIds.length === 1 && a.groupIds[0] === c))
      .filter((a): a is Draft<Allocation> => !!a);
    const [keep, ...drop] = singles;
    if (!keep) continue;
    keep.groupIds = [...input.classIds];
    d.allocations = d.allocations.filter((a) => !drop.includes(a));
  }
  d.mergedClasses.push(MergedClass.parse({ id, name: input.name, classIds: input.classIds, exceptSubjectIds: input.exceptSubjectIds }));
  return id;
}

/** Splits a merge: each combined allocation becomes one copy per class (same teacher and periods). */
export function unmergeClasses(d: Draft<Project>, mergeId: string): void {
  const merge = d.mergedClasses.find((m) => m.id === mergeId);
  if (!merge) return;
  const combined = d.allocations.filter((a) => sameSet(a.groupIds, merge.classIds));
  const copies = combined.flatMap((a) =>
    merge.classIds.map((c) => ({ ...JSON.parse(JSON.stringify(a)), id: newId('alc'), groupIds: [c] }) as Allocation),
  );
  d.allocations = [...d.allocations.filter((a) => !combined.includes(a)), ...copies];
  d.mergedClasses = d.mergedClasses.filter((m) => m.id !== mergeId);
}

/** Changes which subjects stay separate, re-merging allocations accordingly. */
export function setMergeExceptions(d: Draft<Project>, mergeId: string, exceptSubjectIds: string[]): void {
  const merge = d.mergedClasses.find((m) => m.id === mergeId);
  if (!merge) return;
  const { name, classIds } = merge;
  unmergeClasses(d, mergeId);
  const id = mergeClasses(d, { name, classIds: [...classIds], exceptSubjectIds });
  // Keep the original id so UI selection survives.
  d.mergedClasses.find((m) => m.id === id)!.id = mergeId;
}

// ------------------------------------------------------- multi-grade groups

export function addMultiGradeGroup(d: Draft<Project>, input: { name: string; classIds: string[] }): void {
  if (input.classIds.length < 2) throw new Error('Pick at least two classes.');
  const taken = d.multiGradeGroups.find((g) => g.classIds.some((c) => input.classIds.includes(c)));
  if (taken) throw new Error(`A class is already in multi-grade group "${taken.name}".`);
  d.multiGradeGroups.push(MultiGradeGroup.parse({ id: newId('mgg'), ...input }));
}
