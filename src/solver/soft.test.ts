import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { sampleSchool } from '@/packs/sample';
import { generateTimetable, scoreTimetable } from './index';

const p = sampleSchool();

describe('soft rules and optimisation', () => {
  it('the optimiser lowers the soft-rule penalty without breaking hard rules', async () => {
    const plain = await generateTimetable(p, { seed: 2, optimise: false });
    const better = await generateTimetable(p, { seed: 2 });
    expect(better.check.violations).toEqual([]);
    expect(better.unplaced).toEqual([]);
    expect(better.stats.softAfter).toBeLessThan(better.stats.softBefore);
    expect(better.soft.total).toBeLessThan(plain.soft.total);
    // The report adds up and matches an independent re-score.
    expect(better.soft.byRule.reduce((s, r) => s + r.penalty, 0)).toBe(better.soft.total);
    expect(scoreTimetable(p, better.placements).total).toBe(better.soft.total);
  }, 60_000);

  it('class teachers mostly get period 1 (R1)', async () => {
    const r = await generateTimetable(p, { seed: 3 });
    const r1 = r.soft.byRule.find((x) => x.code === 'R1');
    // 18 classes × 5 days wanted; most should be met.
    expect(r1?.penalty ?? 0).toBeLessThan(18 * 5 * 25 * 0.25);
  }, 60_000);

  it('turning a rule off removes it from the score', async () => {
    const off = produce(p, (d) => {
      for (const r of d.rules) if (r.code !== 'R4') r.enabled = false;
    });
    const r = await generateTimetable(off, { seed: 1, optimiseMs: 200 });
    expect(r.soft.total).toBe(0);
  }, 60_000);

  it('Improve keeps a valid timetable and never scores worse', async () => {
    const base = await generateTimetable(p, { seed: 4, optimise: false });
    const improved = await generateTimetable(p, { seed: 4, start: { placements: base.placements, mode: 'improve' } });
    expect(improved.check.violations).toEqual([]);
    expect(improved.unplaced).toEqual([]);
    expect(improved.soft.total).toBeLessThanOrEqual(scoreTimetable(p, base.placements).total);
  }, 60_000);

  it('minimal-change moves few lessons when one teacher becomes unavailable', async () => {
    const base = await generateTimetable(p, { seed: 5 });
    const t = p.teachers.find((x) => x.shortCode === 'PER')!;
    const changed = produce(p, (d) => {
      d.teachers.find((x) => x.id === t.id)!.unavailable.push({ day: 'mon', start: 7 * 60 + 50, end: 9 * 60 + 10 }); // P1–P2
    });
    const minimal = await generateTimetable(changed, { seed: 5, start: { placements: base.placements, mode: 'minimal' } });
    const fresh = await generateTimetable(changed, { seed: 6 });
    expect(minimal.check.violations).toEqual([]);
    expect(minimal.unplaced).toEqual([]);
    expect(minimal.stats.moved).toBeGreaterThan(0);
    expect(minimal.stats.moved!).toBeLessThan(base.placements.length * 0.15);
    // A fresh generate rearranges far more.
    const keys = new Map(base.placements.map((pl) => [`${pl.itemId}#${pl.occurrence}`, pl]));
    const freshMoved = fresh.placements.filter((pl) => {
      const was = keys.get(`${pl.itemId}#${pl.occurrence}`);
      return !was || was.day !== pl.day || was.slotId !== pl.slotId;
    }).length;
    expect(freshMoved).toBeGreaterThan(minimal.stats.moved! * 3);
    // Nothing of that teacher's is left in Monday P1–P2.
    const theirs = new Set(changed.allocations.filter((a) => a.teacherIds.includes(t.id)).map((a) => a.id));
    const early = new Set(p.bellSchedules[0]!.slots.filter((x) => x.kind === 'period').slice(0, 2).map((x) => x.id));
    expect(minimal.placements.some((pl) => theirs.has(pl.itemId) && pl.day === 'mon' && early.has(pl.slotId))).toBe(false);
  }, 90_000);
});
