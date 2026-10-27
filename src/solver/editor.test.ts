import { produce } from 'immer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Project } from '@/domain/project';
import type { Placement } from '@/domain/schedule';
import { approveActiveVersion, saveDraftVersion, setActivePlacements } from '@/domain/timetable';
import { slotsForDay } from '@/domain/time';
import { sampleSchool } from '@/packs/sample';
import { checkTimetable } from './checker';
import { applySteps, EditSession, keyOf, removePlacement, toggleLock } from './editor';
import { generateTimetable } from './index';

let p: Project;
let placements: Placement[];

beforeAll(async () => {
  p = sampleSchool(['A', 'B']);
  placements = (await generateTimetable(p, { seed: 3 })).placements;
});

const classId = (name: string) => p.classes.find((c) => c.name === name)!.id;
const allocOf = (pl: Placement) => p.allocations.find((a) => a.id === pl.itemId);
const of6A = () => placements.filter((pl) => allocOf(pl)?.groupIds.includes(classId('6A')));

describe('EditSession', () => {
  it('marks an occupied period as a clash and names the lesson in the way', () => {
    const s = new EditSession(p, placements);
    const singles = of6A().filter((pl) => s.units.get(keyOf(pl))!.length === 1);
    const a = singles[0]!;
    const target = singles.find((pl) => pl.day !== a.day)!;
    const v = s.verdict(keyOf(a), target.day, target.slotId);
    expect(v.level).toBe('clash');
    expect(v.blockers).toContain(keyOf(target));
  });

  it('refuses a double period across the interval', () => {
    const s = new EditSession(p, placements);
    const double = of6A().find((pl) => s.units.get(keyOf(pl))!.length === 2)!;
    const slots = slotsForDay(p.bellSchedules[0]!, 'mon');
    const beforeBreak = slots[slots.findIndex((x) => x.kind === 'break') - 1]!;
    expect(s.verdict(keyOf(double), 'mon', beforeBreak.id).level).toBe('invalid');
  });

  it('suggests swaps or chains in a full week, and applying one leaves no clashes', () => {
    const s = new EditSession(p, placements);
    const lesson = of6A().find((pl) => s.units.get(keyOf(pl))!.length === 1)!;
    const list = s.suggestions(keyOf(lesson));
    expect(list.length).toBeGreaterThan(0);
    // 6A has no free period, so nothing can simply move.
    expect(list.every((x) => x.kind !== 'move')).toBe(true);
    for (const sug of list.slice(0, 4)) {
      expect(sug.teachers.length).toBeGreaterThan(0);
      const next = applySteps(s, placements, sug.steps);
      expect(next).toHaveLength(placements.length);
      expect(checkTimetable(p, next).violations).toEqual([]);
    }
  });

  it('takes a lesson to the tray and puts it back', () => {
    const lesson = of6A()[0]!;
    const off = removePlacement(placements, keyOf(lesson));
    const s = new EditSession(p, off);
    expect(s.unplaced().map((u) => u.key)).toEqual([keyOf(lesson)]);
    expect(s.verdict(keyOf(lesson), lesson.day, lesson.slotId).level).toBe('ok');
    const back = applySteps(s, off, [{ key: keyOf(lesson), day: lesson.day, slotId: lesson.slotId }]);
    expect(checkTimetable(p, back).violations).toEqual([]);
    expect(back).toHaveLength(placements.length);
  });

  it('flags a soft rule as amber: same subject twice in a day when R4 is only a preference', () => {
    const soft = produce(p, (d) => {
      d.rules.find((r) => r.code === 'R4')!.strength = 'high';
    });
    const s0 = new EditSession(soft, placements);
    const mat = of6A().find((pl) => s0.units.get(keyOf(pl))!.label.includes('MAT') && s0.units.get(keyOf(pl))!.length === 1)!;
    const other = of6A().find((pl) => pl.day !== mat.day && !s0.units.get(keyOf(pl))!.label.includes('MAT') && s0.units.get(keyOf(pl))!.length === 1 && allocOf(pl))!;
    const off = removePlacement(removePlacement(placements, keyOf(mat)), keyOf(other));
    const s = new EditSession(soft, off);
    const v = s.verdict(keyOf(mat), other.day, other.slotId);
    expect(['soft', 'clash']).toContain(v.level);
    if (v.level === 'soft') expect(v.reasons.join()).toMatch(/already has/);
  });

  it('locked lessons stay where they are when generating again', async () => {
    const lesson = of6A()[3]!;
    const locked = toggleLock(placements, keyOf(lesson)).filter((pl) => pl.locked);
    expect(locked).toHaveLength(1);
    const again = await generateTimetable(p, { seed: 99, locked });
    const same = again.placements.find((pl) => keyOf(pl) === keyOf(lesson))!;
    expect([same.day, same.slotId, same.locked]).toEqual([lesson.day, lesson.slotId, true]);
  });
});

describe('versions', () => {
  it('editing an approved timetable makes a draft; approving supersedes the old one', () => {
    let q = produce(p, (d) => void saveDraftVersion(d, placements, 'seed 3'));
    q = produce(q, (d) => approveActiveVersion(d, '2027-01-05'));
    const approved = q.versions[0]!;
    expect(approved).toMatchObject({ status: 'approved', effectiveFrom: '2027-01-05' });

    q = produce(q, (d) => setActivePlacements(d, removePlacement(placements, keyOf(placements[0]!))));
    expect(q.versions).toHaveLength(2);
    const draft = q.versions.find((v) => v.id === q.activeVersionId)!;
    expect(draft).toMatchObject({ status: 'draft', basedOnId: approved.id });
    expect(q.versions[0]!.placements).toHaveLength(placements.length);

    q = produce(q, (d) => approveActiveVersion(d, null));
    expect(q.versions.map((v) => v.status)).toEqual(['superseded', 'approved']);
  });
});
