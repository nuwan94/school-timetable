import type { Draft } from 'immer';
import { newId, type Medium } from './common';
import { OptionBlock, StudentGroup, type Subject } from './entities';
import { patternFrom } from './factories';
import { pruneStudentGroups } from './mutations';
import type { Project } from './project';
import { tx } from '@/i18n';

/**
 * Option blocks: lines of parallel sets placed as one unit. Each set teaches
 * one student group (Buddhism group, English-medium Science group, an A/L
 * Physics set…). Groups are created and kept in step with their block here.
 */

type BlockDraft = Draft<Project>['optionBlocks'][number];
type LineDraft = BlockDraft['lines'][number];
type SetDraft = LineDraft['sets'][number];

const block = (d: Draft<Project>, id: string): BlockDraft => {
  const b = d.optionBlocks.find((x) => x.id === id);
  if (!b) throw new Error(tx('Option block not found'));
  return b;
};
const line = (d: Draft<Project>, blockId: string, lineId: string): LineDraft => {
  const l = block(d, blockId).lines.find((x) => x.id === lineId);
  if (!l) throw new Error(tx('Line not found'));
  return l;
};

export function addBlock(d: Draft<Project>, input: { name: string; classIds: string[] }): string {
  const id = newId('blk');
  d.optionBlocks.push(OptionBlock.parse({ id, name: input.name, classIds: input.classIds, lines: [] }));
  return id;
}

export function setBlockClasses(d: Draft<Project>, blockId: string, classIds: string[]): void {
  if (classIds.length === 0) throw new Error(tx('A block needs at least one class.'));
  const b = block(d, blockId);
  b.classIds = classIds;
  const groupIds = new Set(b.lines.flatMap((l) => l.sets.map((s) => s.groupId)));
  for (const g of d.studentGroups) if (groupIds.has(g.id)) g.classIds = [...classIds];
}

export function removeBlock(d: Draft<Project>, blockId: string): void {
  d.optionBlocks = d.optionBlocks.filter((b) => b.id !== blockId);
  pruneStudentGroups(d);
}

export function addLine(d: Draft<Project>, blockId: string, input: { label: string; periods: number; doubles?: number }): string {
  const id = newId('line');
  block(d, blockId).lines.push({ id, label: input.label, pattern: patternFrom(input.periods, input.doubles ?? 0), sets: [] });
  return id;
}

export function updateLine(d: Draft<Project>, blockId: string, lineId: string, change: { label?: string; periods?: number; doubles?: number }) {
  const l = line(d, blockId, lineId);
  if (change.label !== undefined) l.label = change.label;
  if (change.periods !== undefined || change.doubles !== undefined) {
    const periods = change.periods ?? l.pattern.reduce((s, p) => s + p.length * p.count, 0);
    const doubles = change.doubles ?? l.pattern.filter((p) => p.length === 2).reduce((s, p) => s + p.count, 0);
    l.pattern = patternFrom(periods, doubles);
  }
}

export function removeLine(d: Draft<Project>, blockId: string, lineId: string): void {
  const b = block(d, blockId);
  b.lines = b.lines.filter((l) => l.id !== lineId);
  pruneStudentGroups(d);
}

export interface SetInput {
  subjectId: string;
  groupName?: string;
  teacherId?: string | null;
  studentCount?: number;
  medium?: Medium | null;
}

export function addSet(d: Draft<Project>, blockId: string, lineId: string, input: SetInput): string {
  const b = block(d, blockId);
  const subject = d.subjects.find((s) => s.id === input.subjectId);
  const groupId = newId('grp');
  const sameSubject = b.lines.flatMap((l) => l.sets).filter((s) => s.subjectId === input.subjectId).length;
  d.studentGroups.push(
    StudentGroup.parse({
      id: groupId,
      name: input.groupName ?? `${subject?.name ?? tx('Group')}${sameSubject ? ` ${sameSubject + 1}` : ''}`,
      classIds: [...b.classIds],
      kind: b.classIds.length > 1 ? 'set' : 'subGroup',
      medium: input.medium ?? null,
      studentCount: input.studentCount ?? 0,
    }),
  );
  const id = newId('set');
  line(d, blockId, lineId).sets.push({
    id,
    subjectId: input.subjectId,
    groupId,
    teacherIds: input.teacherId ? [input.teacherId] : [],
    roomId: null,
  });
  return id;
}

export function updateSet(
  d: Draft<Project>,
  blockId: string,
  lineId: string,
  setId: string,
  change: { subjectId?: string; teacherId?: string | null; roomId?: string | null; groupName?: string; studentCount?: number; medium?: Medium | null },
): void {
  const s = line(d, blockId, lineId).sets.find((x) => x.id === setId) as SetDraft | undefined;
  if (!s) return;
  if (change.subjectId !== undefined) s.subjectId = change.subjectId;
  if (change.teacherId !== undefined) s.teacherIds = change.teacherId ? [change.teacherId] : [];
  if (change.roomId !== undefined) s.roomId = change.roomId;
  const g = d.studentGroups.find((x) => x.id === s.groupId);
  if (!g) return;
  if (change.groupName !== undefined) g.name = change.groupName;
  if (change.studentCount !== undefined) g.studentCount = change.studentCount;
  if (change.medium !== undefined) g.medium = change.medium;
}

export function removeSet(d: Draft<Project>, blockId: string, lineId: string, setId: string): void {
  const l = line(d, blockId, lineId);
  l.sets = l.sets.filter((s) => s.id !== setId);
  pruneStudentGroups(d);
}

/** Common Sri Lankan splits, by subject short code. */
export const LINE_PRESETS: { label: string; codes: string[] }[] = [
  { get label() { return tx('Religion'); }, codes: ['BUD', 'HIN', 'ISL', 'CHR', 'CAT'] },
  { get label() { return tx('Aesthetics'); }, codes: ['MUS', 'ART', 'DAN', 'DRA'] },
  { get label() { return tx('Second National Language'); }, codes: ['SIN', 'TAM'] },
];

export function presetSubjects(subjects: Subject[], codes: string[]): Subject[] {
  return codes.flatMap((c) => subjects.filter((s) => s.shortCode.toUpperCase() === c));
}
