import { produce } from 'immer';
import { beforeAll, describe, expect, it } from 'vitest';
import { internationalSchool } from '@/packs/international';
import { generateTimetable } from '@/solver';
import { checkTimetable } from '@/solver/checker';
import { compatiblePairs, pairKey, planBlock, reassignStudent } from './blockBuilder';
import type { Project } from './project';
import { buildSheets } from '@/print/sheets';
import {
  ccaRoster,
  ccaSummary,
  contactHours,
  contractHours,
  houseList,
  houseSummary,
  roomUtilisation,
  setSummary,
  studentEntries,
  visitingClaims,
} from './intlReports';
import { approveActiveVersion, lessonEntries, saveDraftVersion } from './timetable';
import { applyStudentImport, parseStudents } from './students';

let base: Project;
let p: Project;
beforeAll(async () => {
  base = internationalSchool();
  const r = await generateTimetable(base, { seed: 1 });
  p = produce(base, (d) => {
    saveDraftVersion(d, r.placements, 'seed 1');
    approveActiveVersion(d, '2027-09-01');
  });
}, 120_000);

const code = (q: Project, id: string) => q.subjects.find((s) => s.id === id)!.shortCode;

describe('international example', () => {
  it('generates with no clashes and nothing unplaced', async () => {
    const r = await generateTimetable(base, { seed: 1 });
    expect(r.unplaced).toEqual([]);
    expect(r.check.violations).toEqual([]);
  }, 120_000);

  it('blocks come from student choices: every student is in one set per chosen subject', () => {
    for (const b of base.optionBlocks) {
      const sets = b.lines.flatMap((l) => l.sets);
      const students = base.students.filter((s) => b.classIds.includes(s.classId));
      for (const s of students) {
        const offered = new Set(sets.map((x) => x.subjectId));
        for (const c of s.choices.filter((c) => offered.has(c.subjectId))) {
          const mine = sets.filter(
            (x) => x.subjectId === c.subjectId && base.studentGroups.find((g) => g.id === x.groupId)!.studentIds.includes(s.id),
          );
          expect(mine.length, `${s.name} ${code(base, c.subjectId)}`).toBe(1);
        }
      }
    }
    // The sixth form is taught across Years 12 and 13.
    const sixth = base.optionBlocks.find((b) => b.name.startsWith('Sixth'))!;
    const grades = new Set(sixth.classIds.map((id) => base.classes.find((c) => c.id === id)!.gradeId));
    expect(grades.size).toBe(2);
  });
});

describe('student import', () => {
  it('reads a header row in any order, codes in one cell, and creates new houses', () => {
    const text = 'Name\tAdm No\tForm\tHouse\tSubjects\nAsha Perera\t9001\t10A\tColombo\tIPHY ICHE;IBUS\nNo Class\t9002\t99Z\t\t\n';
    const prev = parseStudents(base, text);
    expect(prev.rows).toHaveLength(2);
    expect(prev.rows[0]!.subjectIds.map((id) => code(base, id))).toEqual(['IPHY', 'ICHE', 'IBUS']);
    expect(prev.newHouses).toEqual(['Colombo']);
    expect(prev.problems[0]).toContain('99Z');
    const q = produce(base, (d) => {
      expect(applyStudentImport(d, prev)).toEqual({ added: 1, updated: 0 });
    });
    expect(q.houses.some((h) => h.name === 'Colombo')).toBe(true);
    // Re-importing the same admission number updates in place.
    const again = parseStudents(q, '9001,Asha Perera,10B,Colombo,IBIO');
    produce(q, (d) => {
      expect(applyStudentImport(d, again)).toEqual({ added: 0, updated: 1 });
      expect(d.students.find((s) => s.admissionNo === '9001')!.choices).toHaveLength(1);
    });
  });
});

describe('block builder', () => {
  it('reports the clash matrix and unsatisfied students with alternatives', () => {
    const y10 = base.optionBlocks.find((b) => b.name.startsWith('Year 10'))!;
    const subjectIds = [...new Set(y10.lines.flatMap((l) => l.sets.map((s) => s.subjectId)))];
    const plan = planBlock(base, { classIds: y10.classIds, subjectIds, maxSetSize: 22, lines: 4 });
    expect(plan.unsatisfied).toEqual([]);
    expect(Object.values(plan.enrolment).reduce((s, n) => s + n, 0)).toBe(40 * 4);
    // Squeezed into two lines, most students lose a subject, each told what else is free.
    const tight = planBlock(base, { classIds: y10.classIds, subjectIds, maxSetSize: 22, lines: 2 });
    expect(tight.unsatisfied.length).toBeGreaterThan(0);
    expect(tight.unsatisfied[0]!.missing.length).toBeGreaterThan(0);
    const [a, b] = subjectIds;
    expect(plan.clashes[pairKey(a!, b!)] ?? 0).toBeGreaterThanOrEqual(0);
    expect(compatiblePairs(base, y10.id).size).toBeGreaterThan(0);
  });

  it('minimal change: a new choice moves one student, keeps the lines and their other sets', () => {
    const y10 = base.optionBlocks.find((b) => b.name.startsWith('Year 10'))!;
    const s = base.students.find((x) => x.classId === y10.classIds[0])!;
    const sets = y10.lines.flatMap((l) => l.sets);
    const groupsOf = (q: Project) => q.studentGroups.filter((g) => g.studentIds.includes(s.id)).map((g) => g.id);
    const before = groupsOf(base);
    // Swap their first choice for another subject on the same line.
    const first = s.choices[0]!.subjectId;
    const line = y10.lines.find((l) => l.sets.some((x) => x.subjectId === first))!;
    const other = line.sets.find((x) => x.subjectId !== first)!.subjectId;
    const q = produce(base, (d) => {
      d.students.find((x) => x.id === s.id)!.choices[0]!.subjectId = other;
      expect(reassignStudent(d, y10.id, s.id)).toEqual([]);
    });
    const after = groupsOf(q);
    expect(after.filter((g) => before.includes(g))).toHaveLength(before.length - 1);
    expect(q.optionBlocks.find((b) => b.id === y10.id)!.lines.map((l) => l.sets.length)).toEqual(y10.lines.map((l) => l.sets.length));
    expect(sets.length).toBeGreaterThan(0);
  });
});

describe('per-student checks', () => {
  it('flags a student listed in two sets of one line', () => {
    const v = p.versions.find((x) => x.id === p.activeVersionId)!;
    expect(checkTimetable(p, v.placements).violations).toEqual([]);
    const y11 = p.optionBlocks.find((b) => b.name.startsWith('Year 11'))!;
    const line = y11.lines.find((l) => l.sets.length > 1)!;
    const [g1, g2] = line.sets.map((s) => s.groupId);
    const q = produce(p, (d) => {
      const s = d.studentGroups.find((g) => g.id === g1)!.studentIds[0]!;
      d.studentGroups.find((g) => g.id === g2)!.studentIds.push(s);
    });
    const msgs = checkTimetable(q, v.placements).violations.map((x) => x.message);
    expect(msgs.some((m) => m.includes('is in 2 sets of'))).toBe(true);
  });

  it('flags a student whose set meets at the same time as their own class lesson', () => {
    const v = p.versions.find((x) => x.id === p.activeVersionId)!;
    // Put a Year 7 student into a Year 11 set: the set and their Year 7 lessons collide somewhere.
    const y7 = p.students.find((s) => p.classes.find((c) => c.id === s.classId)!.name.startsWith('7'))!;
    const y11 = p.optionBlocks.find((b) => b.name.startsWith('Year 11'))!;
    const q = produce(p, (d) => {
      for (const l of y11.lines) d.studentGroups.find((g) => g.id === l.sets[0]!.groupId)!.studentIds.push(y7.id);
    });
    const msgs = checkTimetable(q, v.placements).violations.map((x) => x.message);
    expect(msgs.some((m) => m.startsWith(`${y7.name} is double-booked`))).toBe(true);
  });
});

describe('international reports and sheets', () => {
  it('student timetable: class lessons plus only their own set in each line, no clashes', () => {
    const v = p.versions.find((x) => x.id === p.activeVersionId)!;
    const s = p.students.find((x) => x.choices.length === 4)!;
    const mine = studentEntries(p, lessonEntries(p, v.placements), s.id);
    // 35 periods a week, every one filled: IGCSE students have a full week.
    const periods = mine.reduce((n, e) => n + e.slotIds.length, 0);
    expect(periods).toBe(35);
    expect(mine.every((e) => e.parts.length === 1)).toBe(true);
    const sheets = buildSheets(p, v, 'student', { lang: 'en', ids: [s.id] });
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.title).toContain(s.name);
    expect(sheets[0]!.subtitle).toContain(s.admissionNo);
  });

  it('set lists, block charts and reports', () => {
    const v = p.versions.find((x) => x.id === p.activeVersionId)!;
    const sets = p.optionBlocks.flatMap((b) => b.lines.flatMap((l) => l.sets));
    expect(buildSheets(p, v, 'setList', { lang: 'en' }).length).toBeGreaterThanOrEqual(sets.length);
    expect(buildSheets(p, v, 'blockChart', { lang: 'si' })).toHaveLength(p.optionBlocks.length);

    const rooms = roomUtilisation(p);
    expect(rooms.rows.find((r) => r.room === 'Lab 1')!.used).toBeGreaterThan(0);

    const contact = contactHours(p);
    const igPhy = contact.rows.find((r) => r.code === '0625')!;
    expect(igPhy.perWeek).toBe(250);
    expect(igPhy.perYear).toBe(150); // 250 min × 36 weeks
    expect(igPhy.course).toBe(300);
    expect(igPhy.status).toBe('Meets');

    const contract = contractHours(p);
    expect(contract.rows.length).toBe(p.teachers.filter((t) => t.contractMinutes).length);
    expect(contract.rows.every((r) => typeof r.total === 'number')).toBe(true);

    // Two weeks of claims, one Tuesday absent.
    const visiting = p.teachers.find((t) => t.category === 'visiting')!;
    const q = produce(p, (d) => {
      d.absences.push({
        id: 'abs1',
        teacherId: visiting.id,
        from: '2027-09-07',
        to: '2027-09-07',
        slotIds: [],
        recurrence: null,
        reason: '',
        coverTeacherId: null,
      });
    });
    const claim = visitingClaims(q, '2027-09-06', '2027-09-19').rows.find((r) => r.name === visiting.name)!;
    const weekly = lessonEntries(p, v.placements).filter((e) => e.teacherIds.includes(visiting.id));
    const tuesday = weekly.filter((e) => e.day === 'tue').length;
    expect(claim.lessons).toBe(weekly.length * 2 - tuesday);
    expect(claim.missed).toBe(tuesday);
    expect(claim.amount).toBe(Math.round(Number(claim.hours) * 4500 * 100) / 100);

    const houses = houseSummary(p);
    expect(houses.totals!.total).toBe(p.students.length);
    expect(houseList(p, p.houses[0]!.id).rows.length).toBe(p.students.filter((s) => s.houseId === p.houses[0]!.id).length);
    expect(ccaSummary(p).rows.length).toBe(p.ccas.length);
    expect(ccaRoster(p, p.ccas[0]!.id).rows.length).toBe(p.ccas[0]!.studentIds.length);
    expect(setSummary(p).rows.length).toBe(sets.length);
  });
});
