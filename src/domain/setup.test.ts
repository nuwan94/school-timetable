import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { parseTeacherPaste } from '@/io/paste';
import { createProject } from '@/packs';
import { runChecks } from './checks';
import { makeRole, makeSubject, makeTeacher, patternFrom, patternPeriods } from './factories';
import {
  copyClassPeriods,
  deleteEntity,
  deleteImpact,
  findCellAllocation,
  quickAddClasses,
  setCellAllocation,
} from './mutations';
import { findBrokenReferences, type Project } from './project';
import { relayoutSlots } from './time';

/** SL school: Grade 6 A–B, Maths + Science, two teachers. */
function school(): Project {
  return produce(createProject('sl-gov', 'Test'), (d) => {
    quickAddClasses(d, { sectionId: d.sections[0]!.id, fromLevel: 6, toLevel: 6, letters: ['A', 'B'], medium: 'si' });
    d.subjects.push(makeSubject({ name: 'Mathematics', shortCode: 'MAT' }), makeSubject({ name: 'Science', shortCode: 'SCI' }));
    const [mat, sci] = d.subjects;
    d.teachers.push(
      makeTeacher({ name: 'Perera', subjectIds: [mat!.id], media: ['si'] }),
      makeTeacher({ name: 'Silva', subjectIds: [mat!.id, sci!.id], media: ['si'] }),
    );
  });
}

const ids = (p: Project) => ({
  a: p.classes[0]!.id,
  b: p.classes[1]!.id,
  mat: p.subjects[0]!.id,
  sci: p.subjects[1]!.id,
  perera: p.teachers[0]!.id,
  silva: p.teachers[1]!.id,
});

describe('quick add classes', () => {
  it('creates grades once and skips existing classes', () => {
    const p = school();
    expect(p.grades.map((g) => g.name)).toEqual(['Grade 6']);
    expect(p.classes.map((c) => c.name)).toEqual(['6A', '6B']);
    const again = produce(p, (d) => {
      expect(quickAddClasses(d, { sectionId: d.sections[0]!.id, fromLevel: 6, toLevel: 7, letters: ['A', 'C'], medium: 'si' })).toBe(3);
    });
    expect(again.grades).toHaveLength(2);
    expect(again.classes.map((c) => c.name)).toEqual(['6A', '6B', '6C', '7A', '7C']);
  });
});

describe('matrix cells', () => {
  it('derives status from the teacher qualification', () => {
    const p = school();
    const { a, mat, sci, perera } = ids(p);
    const next = produce(p, (d) => {
      setCellAllocation(d, a, mat, { periods: 6, teacherId: perera });
      setCellAllocation(d, a, sci, { periods: 5 });
    });
    expect(findCellAllocation(next, a, mat)!.status).toBe('appointed');
    expect(findCellAllocation(next, a, sci)!.status).toBe('uncovered');
    const covering = produce(next, (d) => setCellAllocation(d, a, sci, { teacherId: perera }));
    expect(findCellAllocation(covering, a, sci)!.status).toBe('covering');
    const removed = produce(covering, (d) => setCellAllocation(d, a, sci, { periods: 0 }));
    expect(findCellAllocation(removed, a, sci)).toBeUndefined();
  });

  it('keeps double periods when only the teacher changes', () => {
    const p = school();
    const { a, sci, silva } = ids(p);
    const next = produce(p, (d) => {
      setCellAllocation(d, a, sci, { pattern: patternFrom(5, 1) });
      setCellAllocation(d, a, sci, { teacherId: silva });
    });
    const alloc = findCellAllocation(next, a, sci)!;
    expect(patternPeriods(alloc.pattern)).toBe(5);
    expect(alloc.pattern).toContainEqual({ length: 2, count: 1 });
  });

  it('copies periods (not teachers) across a grade', () => {
    const p = school();
    const { a, b, mat, perera } = ids(p);
    const next = produce(p, (d) => {
      setCellAllocation(d, a, mat, { periods: 6, teacherId: perera });
      copyClassPeriods(d, a, [a, b]);
    });
    const copied = findCellAllocation(next, b, mat)!;
    expect(patternPeriods(copied.pattern)).toBe(6);
    expect(copied.teacherIds).toEqual([]);
    expect(copied.status).toBe('uncovered');
  });
});

describe('delete with cleanup', () => {
  it('teacher deletion uncovers allocations and clears class teacher', () => {
    const p = produce(school(), (d) => {
      const { a, mat, perera } = ids(d as Project);
      setCellAllocation(d, a, mat, { periods: 6, teacherId: perera });
      d.classes[0]!.classTeacherId = perera;
    });
    const { a, mat, perera } = ids(p);
    expect(deleteImpact(p, 'teacher', perera)).toEqual([
      '1 allocation(s) become uncovered',
      '1 class(es) lose their class teacher',
    ]);
    const next = produce(p, (d) => deleteEntity(d, 'teacher', perera));
    expect(findCellAllocation(next, a, mat)!.status).toBe('uncovered');
    expect(next.classes[0]!.classTeacherId).toBeNull();
    expect(findBrokenReferences(next)).toEqual([]);
  });

  it('section deletion cascades to grades, classes and allocations', () => {
    const p = produce(school(), (d) => {
      const { a, mat } = ids(d as Project);
      setCellAllocation(d, a, mat, { periods: 6 });
    });
    const next = produce(p, (d) => deleteEntity(d, 'section', d.sections[0]!.id));
    expect(next.grades).toEqual([]);
    expect(next.classes).toEqual([]);
    expect(next.allocations).toEqual([]);
    expect(findBrokenReferences(next)).toEqual([]);
  });

  it('refuses to delete a bell schedule still in use', () => {
    const p = school();
    expect(() => produce(p, (d) => deleteEntity(d, 'bellSchedule', d.bellSchedules[0]!.id))).toThrow(/still used/);
  });
});

describe('live checks', () => {
  it('computes class and teacher totals against capacity and norms', () => {
    const p = produce(school(), (d) => {
      const { a, mat, sci, perera, silva } = ids(d as Project);
      d.roles.push(makeRole({ name: 'Norm', norm: { unit: 'periods', min: 10, max: 30 } }));
      d.teachers[0]!.roleId = d.roles[d.roles.length - 1]!.id;
      setCellAllocation(d, a, mat, { periods: 6, teacherId: perera });
      setCellAllocation(d, a, sci, { periods: 5, teacherId: silva });
    });
    const c = runChecks(p);
    const { a, perera, silva } = ids(p);
    expect(c.classes.get(a)).toMatchObject({ periods: 11, capacity: 40, level: 'under' });
    expect(c.teachers.get(perera)).toMatchObject({ periods: 6, min: 10, max: 30, level: 'under' });
    expect(c.teachers.get(silva)).toMatchObject({ periods: 5, capacity: 40, level: 'ok' });
    expect(c.issues.some((i) => i.message.includes('below the minimum of 10'))).toBe(true);
  });

  it('suggests moving periods from an overloaded teacher to a qualified one', () => {
    const p = produce(school(), (d) => {
      const { a, b, mat, perera } = ids(d as Project);
      d.teachers[0]!.contractedDays = ['mon', 'tue']; // 16 periods capacity
      setCellAllocation(d, a, mat, { periods: 10, teacherId: perera });
      setCellAllocation(d, b, mat, { periods: 10, teacherId: perera });
    });
    const issue = runChecks(p).issues.find((i) => i.message.startsWith('Perera has 20'));
    expect(issue?.severity).toBe('error');
    expect(issue?.fix).toMatch(/Move 4 period\(s\) to Silva/);
  });

  it('reports a teacher shortage with the exact shortfall', () => {
    const p = produce(school(), (d) => {
      const { a, b, mat, sci } = ids(d as Project);
      d.teachers.forEach((t) => (t.contractedDays = ['mon'])); // 8 each → 16 supply
      for (const c of [a, b]) {
        setCellAllocation(d, c, mat, { periods: 6 });
        setCellAllocation(d, c, sci, { periods: 5 });
      }
    });
    const c = runChecks(p);
    expect(c.demand).toBe(22);
    expect(c.supply).toBe(16);
    expect(c.issues.some((i) => i.message.includes('Short by 6'))).toBe(true);
  });

  it('flags a medium mismatch', () => {
    const p = produce(school(), (d) => {
      const { a, mat, perera } = ids(d as Project);
      d.classes[0]!.medium = 'ta';
      setCellAllocation(d, a, mat, { periods: 6, teacherId: perera });
    });
    expect(runChecks(p).issues.some((i) => i.message.includes('not listed for that medium'))).toBe(true);
  });
});

describe('bell schedule relayout', () => {
  it('lays slots end to end after an edit', () => {
    const slots = relayoutSlots([{ start: 0, duration: 20 }, { start: 0, duration: 40 }, { start: 0, duration: 40 }], 450);
    expect(slots.map((s) => s.start)).toEqual([450, 470, 510]);
  });
});

describe('paste teachers from Excel', () => {
  it('parses names, codes, subjects by code or name, and media', () => {
    const subjects = [
      { id: 's1', name: 'Mathematics', shortCode: 'MAT' },
      { id: 's2', name: 'Science', shortCode: 'SCI' },
      { id: 's3', name: 'Civic Education', shortCode: 'CIV' },
    ];
    const text = 'Name\tCode\tSubjects\tMedia\nK. Perera\tKP\tMAT, sci\tSinhala/English\nA. Raj\tAR\tCivic Education, Music\ttamil\n\n';
    const rows = parseTeacherPaste(text, subjects);
    expect(rows).toEqual([
      { name: 'K. Perera', shortCode: 'KP', subjectIds: ['s1', 's2'], media: ['si', 'en'], unknown: [] },
      { name: 'A. Raj', shortCode: 'AR', subjectIds: ['s3'], media: ['ta'], unknown: ['Music'] },
    ]);
  });
});
