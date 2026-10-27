import { newId } from './common';
import {
  Allocation,
  Grade,
  Role,
  Room,
  RoomType,
  SchoolClass,
  Section,
  Subject,
  Teacher,
} from './entities';

/** Builders that fill every schema default, so UI code only passes what it knows. */

export const makeSection = (input: { name: string; bellScheduleId: string; order?: number }): Section =>
  Section.parse({ id: newId('sec'), ...input });

export const makeGrade = (input: { name: string; sectionId: string; level: number }): Grade =>
  Grade.parse({ id: newId('grd'), ...input });

export const makeClass = (
  input: { name: string; gradeId: string; medium: SchoolClass['medium'] } & Partial<SchoolClass>,
): SchoolClass => SchoolClass.parse({ id: newId('cls'), ...input });

export const makeSubject = (input: { name: string } & Partial<Subject>): Subject =>
  Subject.parse({ id: newId('sub'), ...input });

export const makeRoomType = (name: string): RoomType => RoomType.parse({ id: newId('rtp'), name });

export const makeRoom = (input: { name: string } & Partial<Room>): Room => Room.parse({ id: newId('room'), ...input });

export const makeRole = (input: { name: string; norm: Role['norm'] }): Role => Role.parse({ id: newId('role'), ...input });

export const makeTeacher = (input: { name: string } & Partial<Teacher>): Teacher =>
  Teacher.parse({ id: newId('tch'), ...input });

export const makeAllocation = (
  input: { subjectId: string; groupIds: string[]; periods: number } & Partial<Omit<Allocation, 'pattern'>>,
): Allocation => {
  const { periods, ...rest } = input;
  return Allocation.parse({ id: newId('alc'), pattern: singles(periods), ...rest });
};

/** n single periods. */
export function singles(n: number): Allocation['pattern'] {
  return n > 0 ? [{ length: 1, count: n }] : [];
}

/** Total periods per week implied by a block pattern. */
export function patternPeriods(pattern: Allocation['pattern']): number {
  return pattern.reduce((s, p) => s + p.length * p.count, 0);
}

/** Builds a pattern with `doubles` double periods and the rest singles. */
export function patternFrom(periods: number, doubles: number): Allocation['pattern'] {
  const d = Math.max(0, Math.min(doubles, Math.floor(periods / 2)));
  const s = periods - 2 * d;
  const out: Allocation['pattern'] = [];
  if (d > 0) out.push({ length: 2, count: d });
  if (s > 0) out.push({ length: 1, count: s });
  return out;
}

/**
 * The lesson lengths a pattern expands to, in pattern order — e.g.
 * [{2×1},{1×3}] → [2,1,1,1]. Index = placement `occurrence`.
 */
export function expandPattern(pattern: Allocation['pattern']): number[] {
  return pattern.flatMap((p) => Array<number>(p.count).fill(p.length));
}

export function doublesIn(pattern: Allocation['pattern']): number {
  return pattern.filter((p) => p.length === 2).reduce((s, p) => s + p.count, 0);
}
