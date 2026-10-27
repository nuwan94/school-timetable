import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { patternFrom } from '@/domain/factories';
import { setCellAllocation } from '@/domain/mutations';
import type { Project } from '@/domain/project';
import { sampleSchool as slSchool } from '@/packs/sample';
import { checkTimetable } from './checker';
import { generateTimetable } from './index';
import { preflight } from './preflight';
import { classGrid, countGaps, lessonEntries, saveDraftVersion, teacherGrid } from '@/domain/timetable';

const sub = (p: Project, code: string) => p.subjects.find((s) => s.shortCode === code)!.id;
const cls = (p: Project, name: string) => p.classes.find((c) => c.name === name)!.id;

describe('synthetic school fixture', () => {
  it('fills every class to exactly 40 periods', () => {
    const p = slSchool();
    const pf = preflight(p);
    expect(pf.errors).toEqual([]);
    expect(pf.shortage).toBe(false);
    expect(p.classes).toHaveLength(18);
    expect(pf.summary.lessons).toBeGreaterThan(400);
  });
});

describe('generateTimetable', () => {
  it('places the whole synthetic school with zero checker violations', async () => {
    const p = slSchool();
    const r = await generateTimetable(p, { seed: 7 });
    expect(r.unplaced.map((u) => `${u.label}: ${u.reason}`)).toEqual([]);
    expect(r.check.violations).toEqual([]);
    expect(r.check.placed).toBe(r.check.expected);
    expect(r.gaps).toEqual([]);
  }, 60_000);

  it('is deterministic for a seed and varies across seeds', async () => {
    const p = slSchool(['A', 'B']);
    const a = await generateTimetable(p, { seed: 3 });
    const b = await generateTimetable(p, { seed: 3 });
    const c = await generateTimetable(p, { seed: 4 });
    expect(a.placements).toEqual(b.placements);
    expect(c.placements).not.toEqual(a.placements);
  }, 60_000);

  it('keeps hard once-per-day: no class has a subject twice in a day', async () => {
    const p = slSchool(['A', 'B']);
    const r = await generateTimetable(p, { seed: 11 });
    const seen = new Set<string>();
    for (const pl of r.placements) {
      const a = p.allocations.find((x) => x.id === pl.itemId);
      if (!a) continue;
      const key = `${a.groupIds.join('+')}|${pl.day}|${a.subjectId}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  }, 60_000);

  it('respects contracted days of a part-time teacher', async () => {
    const p = produce(slSchool(['A', 'B']), (d) => {
      const t = d.teachers.find((x) => x.subjectIds.includes(sub(d as Project, 'ICT')))!;
      t.contractedDays = ['mon', 'tue', 'wed'];
    });
    const t = p.teachers.find((x) => x.subjectIds.includes(sub(p, 'ICT')))!;
    const r = await generateTimetable(p, { seed: 5 });
    const mine = r.placements.filter((pl) => p.allocations.find((a) => a.id === pl.itemId)?.teacherIds.includes(t.id));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((pl) => ['mon', 'tue', 'wed'].includes(pl.day))).toBe(true);
    expect(r.check.violations).toEqual([]);
  }, 60_000);

  it('in shortage, leaves low-priority lessons unplaced and keeps core ones', async () => {
    // 6A gets 4 extra ICT periods: 44 periods into a 40-period week.
    const p = produce(slSchool(['A']), (d) => {
      setCellAllocation(d, cls(d as Project, '6A'), sub(d as Project, 'ICT'), { periods: 7 });
      d.rules.find((r) => r.code === 'R4')!.strength = 'high';
    });
    expect(preflight(p).shortage).toBe(true);
    const r = await generateTimetable(p, { seed: 2 });
    expect(r.unplaced.length).toBeGreaterThanOrEqual(4);
    const core = new Set(p.subjects.filter((s) => s.priority === 'core').map((s) => s.id));
    const unplacedCore = r.unplaced.filter((u) => core.has(p.allocations.find((a) => a.id === u.itemId)?.subjectId ?? ''));
    expect(unplacedCore).toEqual([]);
    expect(r.check.violations).toEqual([]);
  }, 60_000);

  it('relax rules lets a 6-lesson subject sit twice in a day', async () => {
    const p = produce(slSchool(['A']), (d) => {
      setCellAllocation(d, cls(d as Project, '6A'), sub(d as Project, 'MAT'), { pattern: patternFrom(6, 0) });
      setCellAllocation(d, cls(d as Project, '6A'), sub(d as Project, 'ICT'), { periods: 2 });
    });
    expect(preflight(p).errors.some((e) => e.message.includes('once per day'))).toBe(true);
    const strict = await generateTimetable(p, { seed: 1 });
    expect(strict.unplaced.length).toBeGreaterThan(0);
    const relaxed = await generateTimetable(p, { seed: 1, relaxRules: true });
    expect(relaxed.unplaced).toEqual([]);
    expect(relaxed.check.violations).toEqual([]);
  }, 60_000);

  it('stops when asked and still returns the best partial result', async () => {
    const p = slSchool();
    let calls = 0;
    const r = await generateTimetable(p, { seed: 1 }, { yieldEvery: 20, shouldStop: () => ++calls > 3 });
    expect(r.stats.stopped).toBe(true);
    expect(r.check.violations).toEqual([]);
  }, 60_000);
});

describe('checker', () => {
  it('detects an injected clash and a bad slot', async () => {
    const p = slSchool(['A']);
    const r = await generateTimetable(p, { seed: 9 });
    expect(r.check.violations).toEqual([]);
    // Move one 6A single onto another 6A lesson's time.
    const sixA = cls(p, '6A');
    const ofSixA = r.placements.filter((pl) => p.allocations.find((a) => a.id === pl.itemId)?.groupIds.includes(sixA));
    const [x, y] = ofSixA.filter((pl, _, all) => all.some((o) => o !== pl && o.day !== pl.day));
    const clashed = r.placements.map((pl) => (pl === x ? { ...pl, day: y!.day, slotId: y!.slotId } : pl));
    const report = checkTimetable(p, clashed);
    expect(report.violations.some((v) => v.kind === 'clash' && v.message.includes('6A'))).toBe(true);

    const badSlot = r.placements.map((pl, i) => (i === 0 ? { ...pl, slotId: 'nope' } : pl));
    expect(checkTimetable(p, badSlot).violations.some((v) => v.kind === 'slot')).toBe(true);
    expect(checkTimetable(p, r.placements.slice(1)).placed).toBe(r.check.expected - 1);
  }, 60_000);
});

describe('preflight', () => {
  it('flags a part-time teacher who cannot fit a lesson, and a missing room', () => {
    const p = produce(slSchool(['A']), (d) => {
      const t = d.teachers.find((x) => x.subjectIds.includes(sub(d as Project, 'MAT')))!;
      t.contractedDays = [];
      t.windows = [];
      t.unavailable = (['mon', 'tue', 'wed', 'thu', 'fri'] as const).map((day) => ({ day, start: 0, end: 23 * 60 + 59 }));
    });
    const pf = preflight(p);
    expect(pf.errors.some((e) => e.message.includes('MAT') || e.message.includes('Mathematics'))).toBe(true);
    expect(pf.errors.every((e) => !!e.fix)).toBe(true);
  });

  it('warns when classes have no class teacher', () => {
    const pf = preflight(
      produce(slSchool(['A']), (d) => {
        d.classes.forEach((c) => (c.classTeacherId = null));
      }),
    );
    expect(pf.warnings.some((w) => w.message.includes('class teacher'))).toBe(true);
  });
});

describe('performance', () => {
  it('a large school (Grades 6–11 × 10 classes, ~2000 lessons) generates fully in under 60 s', async () => {
    const p = slSchool('ABCDEFGHIJ'.split(''));
    const t0 = Date.now();
    const r = await generateTimetable(p, { seed: 1 });
    expect(Date.now() - t0).toBeLessThan(60_000);
    expect(r.stats.units).toBeGreaterThan(2000);
    expect(r.unplaced).toEqual([]);
    expect(r.check.violations).toEqual([]);
  }, 90_000);
});

describe('timetable versions and grids', () => {
  it('saves a run as the active draft, replacing the previous draft', async () => {
    const p = slSchool(['A']);
    const r = await generateTimetable(p, { seed: 1 });
    const once = produce(p, (d) => void saveDraftVersion(d, r.placements, 'seed 1'));
    const twice = produce(once, (d) => void saveDraftVersion(d, r.placements, 'seed 2'));
    expect(twice.versions).toHaveLength(1);
    expect(twice.activeVersionId).toBe(twice.versions[0]!.id);
    expect(twice.versions[0]!.note).toBe('seed 2');

    const entries = lessonEntries(twice, r.placements);
    expect(entries.reduce((s, e) => s + e.slotIds.length, 0)).toBe(6 * 40);
    expect(countGaps(twice, entries, cls(twice, '6A'))).toBe(0);
    const grid = classGrid(twice, entries, cls(twice, '6A'))!;
    expect(grid.rows.filter((row) => row.kind === 'period')).toHaveLength(8);
    const someTeacher = entries[0]!.teacherIds[0]!;
    const tg = teacherGrid(twice, entries, someTeacher)!;
    expect([...tg.cells.values()].flat().every((e) => e.teacherIds.includes(someTeacher))).toBe(true);
  });
});
