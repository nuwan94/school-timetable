import { strFromU8, unzipSync } from 'fflate';
import { produce } from 'immer';
import { beforeAll, describe, expect, it } from 'vitest';
import { colName, tablesToXlsx, tableToCsv } from '@/io/tableExport';
import { EXAMPLES } from '@/packs/examples';
import { sampleSchool } from '@/packs/sample';
import { dutyRosterSheet } from '@/print/dutySheets';
import { reportSheets } from '@/print/reportSheets';
import { generateTimetable } from '@/solver';
import { autoAssignDuties, dutyClashes, makeDutyRoster } from './duties';
import type { Project } from './project';
import { cadreReturn, deploymentReturn, dutyCounts, inCadre, surplusReport, surplusRows, workloadReport } from './returns';
import { approveActiveVersion, lessonEntries, saveDraftVersion } from './timetable';

let p: Project;
beforeAll(async () => {
  const base = sampleSchool();
  const r = await generateTimetable(base, { seed: 1 });
  p = produce(base, (d) => {
    saveDraftVersion(d, r.placements, 'seed 1');
    approveActiveVersion(d, '2027-01-01');
  });
});

const blob = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

describe('returns', () => {
  it('cadre: approved vs actual per subject × medium, excluding categories not in cadre', () => {
    // The sample is short of a Maths teacher and has one History teacher too many.
    const base = cadreReturn(p);
    expect(base.rows.find((r) => r.subject === 'Mathematics')!.deficit).toBe(1);
    expect(base.rows.find((r) => r.subject === 'History')!.excess).toBe(1);
    // A visiting Maths teacher does not count: the deficit grows by one.
    const q = produce(p, (d) => {
      d.teachers.find((t) => d.subjects.find((s) => s.id === t.appointmentSubjectId)?.shortCode === 'MAT')!.category = 'visiting';
    });
    const t = cadreReturn(q);
    const total = (k: string) => t.rows.reduce((s, r) => s + Number(r[k]), 0);
    expect(total('actual')).toBe(q.teachers.filter(inCadre).length);
    expect(t.totals!.actual).toBe(total('actual'));
    expect(t.rows.find((r) => r.subject === 'Mathematics')!.deficit).toBe(2);
    expect(t.note).toContain('visiting');
  });

  it('cadre layout: renamed, reordered and hidden columns carry through', () => {
    const q = produce(p, (d) => {
      d.reports.cadreColumns = [
        { key: 'subject', label: 'විෂය', visible: true },
        { key: 'approved', label: 'Approved cadre', visible: true },
        { key: 'actual', label: 'Present', visible: true },
        { key: 'no', label: 'No', visible: false },
      ];
    });
    const cols = cadreReturn(q).columns;
    expect(cols.map((c) => c.label)).toEqual(['විෂය', 'Approved cadre', 'Present']);
  });

  it('deployment: periods, outside-appointment periods and norm status per teacher', () => {
    const q = produce(p, (d) => {
      d.roles[0]!.norm = { unit: 'periods', min: 24, max: 35 };
      for (const t of d.teachers) t.roleId = d.roles[0]!.id;
      // Make one teacher's appointment a different subject: all their periods are outside it.
      const t = d.teachers[0]!;
      t.appointmentSubjectId = d.subjects.find((s) => !t.subjectIds.includes(s.id))!.id;
    });
    const t = deploymentReturn(q);
    const first = t.rows.find((r) => r.name === q.teachers[0]!.name)!;
    expect(first.outside).toBe(first.periods);
    expect(t.rows.filter((r) => r.name !== first.name).every((r) => r.outside === 0)).toBe(true);
    expect(t.rows.some((r) => r.status === 'Under norm' || r.status === 'Within norm')).toBe(true);
    expect(String(first.taught)).toMatch(/\(Grade \d/);
  });

  it('surplus/deficit: periods always; teachers only once periods-per-teacher is set', () => {
    const rows = surplusRows(p);
    const needed = rows.reduce((s, r) => s + r.needed, 0);
    const perClass = 40;
    expect(needed).toBeGreaterThanOrEqual(p.classes.length * perClass - p.optionBlocks.length * 4);
    expect(rows.every((r) => r.balance === null)).toBe(true);
    const q = produce(p, (d) => void (d.reports.periodsPerTeacher = 30));
    const maths = surplusRows(q).find((r) => q.subjects.find((s) => s.id === r.subjectId)!.shortCode === 'MAT')!;
    expect(maths.teachersNeeded).toBe(Math.ceil(maths.needed / 30));
    expect(maths.balance).toBe(maths.appointed - maths.teachersNeeded!);
    const req = surplusReport(q, true);
    expect(req.rows.every((r) => Number(r.deficit) > 0)).toBe(true);
  });

  it('workload: relief this term and duties per teacher', () => {
    const t = workloadReport(p, '2027-01-04');
    expect(t.rows).toHaveLength(p.teachers.filter((x) => x.active).length);
    expect(t.rows.every((r) => Number(r.periods) >= 0 && Number(r.free) >= 0)).toBe(true);
  });
});

describe('duty rosters', () => {
  it('interval duty: sessions from the bell schedule, filled fairly, no clashes', () => {
    const r = makeDutyRoster(p, 'interval');
    expect(r.sessions).toHaveLength(1);
    expect(r.sessions[0]!.end - r.sessions[0]!.start).toBe(20);
    r.assignments = autoAssignDuties(p, r);
    expect(r.assignments).toHaveLength(r.posts.length * r.days.length);
    expect(dutyClashes(p, r)).toEqual([]);
    const counts = [...new Map(r.assignments.map((a) => [a.teacherId, 0])).keys()].map(
      (id) => r.assignments.filter((a) => a.teacherId === id).length,
    );
    expect(Math.max(...counts)).toBe(1);
  });

  it('gate duty: never during a lesson; fairness across rosters; quotas respected', () => {
    const interval = makeDutyRoster(p, 'interval');
    interval.assignments = autoAssignDuties(p, interval);
    const q = produce(p, (d) => {
      d.dutyRosters.push(interval);
      d.teachers[0]!.duties = [{ label: 'Gate duty', perWeek: 0 }];
    });
    const gate = makeDutyRoster(q, 'gate');
    gate.assignments = autoAssignDuties(q, gate);
    const both = produce(q, (d) => void d.dutyRosters.push(gate));
    expect(dutyClashes(both, gate)).toEqual([]);
    expect(gate.assignments.some((a) => a.teacherId === p.teachers[0]!.id)).toBe(false);
    const load = [...dutyCounts(both).values()];
    expect(Math.max(...load) - Math.min(...load)).toBeLessThanOrEqual(1);
  });

  it('reports a lesson clash and an empty post', () => {
    const r = makeDutyRoster(p, 'other');
    const v = p.versions.find((x) => x.id === p.activeVersionId)!;
    const lesson = lessonEntries(p, v.placements).find((e) => e.teacherIds.length > 0)!;
    r.sessions = [{ id: 's1', label: 'Lunch', start: lesson.start, end: lesson.end }];
    r.days = [lesson.day];
    r.assignments = [{ day: lesson.day, sessionId: 's1', post: r.posts[0]!, teacherId: lesson.teacherIds[0]! }];
    r.posts.push('Library');
    const kinds = new Set(dutyClashes(p, r).map((c) => c.kind));
    expect(kinds.has('teaching')).toBe(true);
    expect(kinds.has('empty')).toBe(true);
  });

  it('prints the roster in Sinhala with a row per place', () => {
    const r = makeDutyRoster(p, 'interval');
    r.assignments = autoAssignDuties(p, r);
    const s = dutyRosterSheet(p, r, 'si');
    expect(s.title).toBe('රාජකාරි ලේඛනය');
    const b = s.blocks[0]!;
    expect(b.type === 'table' && b.rows.length).toBe(3);
  });
});

describe('export', () => {
  const table = () => cadreReturn(p);

  it('CSV: BOM, quoted commas, totals row', async () => {
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(
      await blob(tableToCsv({ ...table(), rows: [{ subject: 'Art, Music', no: 1 }] })),
    );
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('"Art, Music"');
    expect(text.trim().split('\r\n')).toHaveLength(3);
  });

  it('Excel: a valid workbook with one sheet per table, Unicode kept', async () => {
    const files = unzipSync(await blob(tablesToXlsx([table(), deploymentReturn(p)])));
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']),
    );
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!);
    expect(sheet).toContain('Mathematics');
    expect(sheet).toContain('<v>');
    expect(strFromU8(files['xl/workbook.xml']!)).toContain('name="2 Teacher deployment return"');
    expect(colName(0)).toBe('A');
    expect(colName(27)).toBe('AB');
  });

  it('PDF sheets: landscape for wide tables, split into pages, totals and signature on the last', () => {
    const sheets = reportSheets(p, deploymentReturn(p), { sign: true });
    expect(sheets[0]!.paper).toBe('A4L');
    expect(sheets).toHaveLength(Math.ceil((p.teachers.length + 1) / 20));
    const rows = sheets.reduce((n, s) => n + (s.blocks[0]!.type === 'table' ? s.blocks[0]!.rows.length : 0), 0);
    expect(rows).toBe(p.teachers.length + 1);
    expect(sheets.at(-1)!.blocks[1]!.type).toBe('sign');
    expect(sheets[0]!.blocks).toHaveLength(1);
    expect(sheets[1]!.meta).toContain('Page 2 / ' + sheets.length);
  });
});

describe('example schools', () => {
  for (const ex of EXAMPLES.filter((e) => e.id !== 'sample'))
    it(`${ex.name} generates with no clashes and fills the returns`, async () => {
      const school = ex.build();
      const r = await generateTimetable(school, { seed: 1, optimise: false });
      expect(r.check.violations).toEqual([]);
      expect(r.unplaced).toEqual([]);
      expect(cadreReturn(school).rows.length).toBeGreaterThan(0);
      expect(cadreReturn(school).note).not.toContain('no appointment subject');
      expect(Number(cadreReturn(school).totals!.deficit)).toBeGreaterThan(0);
    }, 120_000);
});
