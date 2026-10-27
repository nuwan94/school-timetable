import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { parseAllocationPaste } from '@/io/paste';
import { createProject } from '@/packs';
import { addBlock, addLine, addSet, removeBlock, setBlockClasses, updateSet } from './blocks';
import { runChecks } from './checks';
import { makeRoom, makeSubject, makeTeacher, patternPeriods } from './factories';
import {
  addMultiGradeGroup,
  deleteEntity,
  findCellAllocation,
  mergeClasses,
  quickAddClasses,
  setCellAllocation,
  setMergeExceptions,
  unmergeClasses,
} from './mutations';
import { findBrokenReferences, type Project } from './project';
import { applyTemplate, exportTemplates, parseTemplateFile, templateFromClass } from './templates';

/** Grade 8 A–C, five subjects, four teachers. */
function school(): Project {
  return produce(createProject('sl-gov', 'Test'), (d) => {
    quickAddClasses(d, { sectionId: d.sections[0]!.id, fromLevel: 8, toLevel: 8, letters: ['A', 'B', 'C'], medium: 'si' });
    d.classes.forEach((c) => (c.studentCount = 30));
    for (const [name, code] of [
      ['Mathematics', 'MAT'],
      ['Science', 'SCI'],
      ['Buddhism', 'BUD'],
      ['Hinduism', 'HIN'],
      ['Christianity', 'CHR'],
    ] as const)
      d.subjects.push(makeSubject({ name, shortCode: code }));
    const sub = (code: string) => d.subjects.find((s) => s.shortCode === code)!.id;
    d.teachers.push(
      makeTeacher({ name: 'Perera', shortCode: 'KP', subjectIds: [sub('MAT')], media: ['si'] }),
      makeTeacher({ name: 'Thero', shortCode: 'TH', subjectIds: [sub('BUD')], media: ['si'] }),
      makeTeacher({ name: 'Rajan', shortCode: 'AR', subjectIds: [sub('HIN')], media: ['ta'] }),
      makeTeacher({ name: 'Mendis', shortCode: 'MM', subjectIds: [sub('CHR')], media: ['si'] }),
    );
  });
}

const sub = (p: Project, code: string) => p.subjects.find((s) => s.shortCode === code)!.id;
const tch = (p: Project, code: string) => p.teachers.find((t) => t.shortCode === code)!.id;
const cls = (p: Project, name: string) => p.classes.find((c) => c.name === name)!.id;

describe('curriculum templates', () => {
  it('captures a class and applies it to other classes, keeping teachers', () => {
    const p = produce(school(), (d) => {
      setCellAllocation(d, cls(d as Project, '8A'), sub(d as Project, 'MAT'), { periods: 6, teacherId: tch(d as Project, 'KP') });
      setCellAllocation(d, cls(d as Project, '8A'), sub(d as Project, 'SCI'), { periods: 5 });
      setCellAllocation(d, cls(d as Project, '8B'), sub(d as Project, 'MAT'), { periods: 3, teacherId: tch(d as Project, 'KP') });
    });
    const tpl = templateFromClass(p, cls(p, '8A'), { name: 'Grade 8', version: 'NIE 2024' });
    expect(tpl).toMatchObject({ gradeLevel: 8, version: 'NIE 2024' });
    expect(tpl.items).toEqual([
      { subjectCode: 'MAT', amount: 6, unit: 'periods', doubles: 0 },
      { subjectCode: 'SCI', amount: 5, unit: 'periods', doubles: 0 },
    ]);
    let result = { cells: 0, missing: [] as string[] };
    const next = produce(p, (d) => {
      result = applyTemplate(d, { ...tpl, items: [...tpl.items, { subjectCode: 'XYZ', amount: 2, unit: 'periods', doubles: 0 }] }, [
        cls(d as Project, '8B'),
        cls(d as Project, '8C'),
      ]);
    });
    expect(result).toEqual({ cells: 4, missing: ['XYZ'] });
    const b = findCellAllocation(next, cls(next, '8B'), sub(next, 'MAT'))!;
    expect(patternPeriods(b.pattern)).toBe(6);
    expect(b.teacherIds).toEqual([tch(next, 'KP')]);
  });

  it('round-trips templates through a file with fresh ids', () => {
    const p = school();
    const tpl = templateFromClass(p, cls(p, '8A'), { name: 'G8', version: 'v1' });
    const [back] = parseTemplateFile(exportTemplates([tpl]));
    expect(back!.id).not.toBe(tpl.id);
    expect({ ...back, id: tpl.id }).toEqual(tpl);
    expect(() => parseTemplateFile('{"hello":1}')).toThrow(/not a valid/);
  });
});

describe('merged classes', () => {
  it('collapses allocations into one combined lesson, counted once for the teacher', () => {
    let p = produce(school(), (d) => {
      const P = d as Project;
      setCellAllocation(d, cls(P, '8B'), sub(P, 'MAT'), { periods: 6, teacherId: tch(P, 'KP') });
      setCellAllocation(d, cls(P, '8C'), sub(P, 'MAT'), { periods: 6, teacherId: tch(P, 'KP') });
      setCellAllocation(d, cls(P, '8B'), sub(P, 'SCI'), { periods: 5 });
      setCellAllocation(d, cls(P, '8C'), sub(P, 'SCI'), { periods: 5 });
    });
    expect(runChecks(p).teachers.get(tch(p, 'KP'))!.periods).toBe(12);

    p = produce(p, (d) => {
      const P = d as Project;
      mergeClasses(d, { name: '8B+8C', classIds: [cls(P, '8B'), cls(P, '8C')], exceptSubjectIds: [sub(P, 'SCI')] });
    });
    const mat = findCellAllocation(p, cls(p, '8C'), sub(p, 'MAT'))!;
    expect(mat.groupIds).toHaveLength(2);
    expect(findCellAllocation(p, cls(p, '8B'), sub(p, 'MAT'))).toBe(mat);
    expect(findCellAllocation(p, cls(p, '8B'), sub(p, 'SCI'))!.groupIds).toHaveLength(1); // excepted
    const checks = runChecks(p);
    expect(checks.teachers.get(tch(p, 'KP'))!.periods).toBe(6);
    expect(checks.classes.get(cls(p, '8C'))!.periods).toBe(11);
    expect(checks.demand).toBe(6 + 5 + 5);

    // Editing a merged cell edits the shared allocation.
    p = produce(p, (d) => setCellAllocation(d, cls(d as Project, '8C'), sub(d as Project, 'MAT'), { periods: 7 }));
    expect(patternPeriods(findCellAllocation(p, cls(p, '8B'), sub(p, 'MAT'))!.pattern)).toBe(7);

    // Changing exceptions re-merges; unmerging splits back with the same teacher.
    p = produce(p, (d) => setMergeExceptions(d, d.mergedClasses[0]!.id, []));
    expect(findCellAllocation(p, cls(p, '8B'), sub(p, 'SCI'))!.groupIds).toHaveLength(2);
    p = produce(p, (d) => unmergeClasses(d, d.mergedClasses[0]!.id));
    const split = findCellAllocation(p, cls(p, '8B'), sub(p, 'MAT'))!;
    expect(split.groupIds).toEqual([cls(p, '8B')]);
    expect(split.teacherIds).toEqual([tch(p, 'KP')]);
    expect(runChecks(p).teachers.get(tch(p, 'KP'))!.periods).toBe(14);
    expect(findBrokenReferences(p)).toEqual([]);
  });

  it('rejects a class that is already merged', () => {
    const p = produce(school(), (d) => {
      mergeClasses(d, { name: 'm1', classIds: [d.classes[0]!.id, d.classes[1]!.id], exceptSubjectIds: [] });
    });
    expect(() =>
      produce(p, (d) => {
        mergeClasses(d, { name: 'm2', classIds: [d.classes[1]!.id, d.classes[2]!.id], exceptSubjectIds: [] });
      }),
    ).toThrow(
      /already in merge/,
    );
  });
});

describe('multi-grade groups', () => {
  it('counts a teacher holding grouped classes at once only once', () => {
    const p = produce(school(), (d) => {
      const P = d as Project;
      for (const c of ['8A', '8B']) setCellAllocation(d, cls(P, c), sub(P, 'MAT'), { periods: 5, teacherId: tch(P, 'KP') });
      addMultiGradeGroup(d, { name: '8A+8B', classIds: [cls(P, '8A'), cls(P, '8B')] });
    });
    const checks = runChecks(p);
    expect(checks.teachers.get(tch(p, 'KP'))).toMatchObject({ periods: 5, multiGradeSaving: 5 });
    expect(checks.demand).toBe(5);
  });
});

describe('option blocks', () => {
  function religion() {
    let ids = { block: '', line: '', bud: '', hin: '' };
    const p = produce(school(), (d) => {
      const P = d as Project;
      ids.block = addBlock(d, { name: 'Grade 8 Religion', classIds: P.classes.map((c) => c.id) });
      ids.line = addLine(d, ids.block, { label: 'Religion', periods: 3 });
      ids.bud = addSet(d, ids.block, ids.line, { subjectId: sub(P, 'BUD'), teacherId: tch(P, 'TH'), studentCount: 70 });
      ids.hin = addSet(d, ids.block, ids.line, { subjectId: sub(P, 'HIN'), teacherId: tch(P, 'AR'), studentCount: 12, medium: 'ta' });
      addSet(d, ids.block, ids.line, { subjectId: sub(P, 'CHR'), studentCount: 8 });
    });
    return { p, ids };
  }

  it('creates a student group per set spanning the block classes', () => {
    const { p } = religion();
    expect(p.studentGroups.map((g) => [g.name, g.kind, g.classIds.length])).toEqual([
      ['Buddhism', 'set', 3],
      ['Hinduism', 'set', 3],
      ['Christianity', 'set', 3],
    ]);
    expect(findBrokenReferences(p)).toEqual([]);
  });

  it('adds line periods to each class once and to each set teacher', () => {
    const { p } = religion();
    const c = runChecks(p);
    expect(c.classes.get(cls(p, '8A'))).toMatchObject({ periods: 3, blockPeriods: 3 });
    expect(c.teachers.get(tch(p, 'TH'))!.periods).toBe(3);
    expect(c.teachers.get(tch(p, 'AR'))!.periods).toBe(3);
    expect(c.demand).toBe(9); // three parallel sets
    expect(c.issues.some((i) => i.message.includes('Christianity has no teacher'))).toBe(true);
    expect(c.issues.some((i) => i.message.includes('groups add up to 90 students but the classes have 90'))).toBe(false);
  });

  it('flags a teacher in two parallel groups, room overuse and student-count mismatch', () => {
    const { p, ids } = religion();
    const next = produce(p, (d) => {
      d.rooms.push(makeRoom({ name: 'Hall', concurrent: 1 }));
      const room = d.rooms[0]!.id;
      updateSet(d, ids.block, ids.line, ids.hin, { teacherId: tch(d as Project, 'TH'), roomId: room, studentCount: 20 });
      updateSet(d, ids.block, ids.line, ids.bud, { roomId: room });
    });
    const messages = runChecks(next).issues.map((i) => i.message);
    expect(messages).toContain('Grade 8 Religion / Religion: Thero teaches 2 groups at the same time.');
    expect(messages).toContain('Grade 8 Religion / Religion: Hall is used by 2 groups at once (holds 1).');
    expect(messages).toContain('Grade 8 Religion / Religion: groups add up to 98 students but the classes have 90.');
  });

  it('keeps groups in step with block classes and cleans up on delete', () => {
    const { p, ids } = religion();
    const narrowed = produce(p, (d) => setBlockClasses(d, ids.block, [cls(d as Project, '8A')]));
    expect(narrowed.studentGroups.every((g) => g.classIds.length === 1)).toBe(true);

    const noTeacher = produce(p, (d) => deleteEntity(d, 'teacher', tch(d as Project, 'TH')));
    expect(noTeacher.optionBlocks[0]!.lines[0]!.sets[0]!.teacherIds).toEqual([]);

    const noSubject = produce(p, (d) => deleteEntity(d, 'subject', sub(d as Project, 'HIN')));
    expect(noSubject.optionBlocks[0]!.lines[0]!.sets).toHaveLength(2);
    expect(noSubject.studentGroups).toHaveLength(2);
    expect(findBrokenReferences(noSubject)).toEqual([]);

    const noBlock = produce(p, (d) => removeBlock(d, ids.block));
    expect(noBlock.studentGroups).toEqual([]);

    const noClass = produce(p, (d) => deleteEntity(d, 'class', cls(d as Project, '8A')));
    expect(noClass.optionBlocks[0]!.classIds).toHaveLength(2);
    expect(findBrokenReferences(noClass)).toEqual([]);
  });
});

describe('paste allocations from Excel', () => {
  it('reads the list layout with teacher codes, names and doubles', () => {
    const p = school();
    const rows = parseAllocationPaste('Class\tSubject\tPeriods\tTeacher\tDoubles\n8A\tMAT\t6\tKP\n8B\tScience\t5\t\t1\n8C\tMAT\t6\tNobody', p);
    expect(rows.map((r) => [r.label.cls, r.periods, r.doubles, r.teacherId, r.errors])).toEqual([
      ['8A', 6, 0, tch(p, 'KP'), []],
      ['8B', 5, 1, null, []],
      ['8C', 6, 0, null, ['unknown teacher "Nobody"']],
    ]);
  });

  it('reads the grid layout and ignores non-subject columns', () => {
    const p = school();
    const rows = parseAllocationPaste('Class\tMAT\tSCI\tTotal\n8A\t6 KP\t5 1D\t11\n8B\t6/Perera\t\t6\n9Z\t6\t\t', p);
    expect(rows.map((r) => [r.label.cls, r.label.subject, r.periods, r.doubles, r.teacherId !== null, r.errors.length])).toEqual([
      ['8A', 'MAT', 6, 0, true, 0],
      ['8A', 'SCI', 5, 1, false, 0],
      ['8B', 'MAT', 6, 0, true, 0],
      ['9Z', 'MAT', 6, 0, false, 1],
    ]);
  });
});
