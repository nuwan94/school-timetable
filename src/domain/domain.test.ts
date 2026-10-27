import { describe, expect, it } from 'vitest';
import { createProject } from '@/packs';
import { loadProject, ProjectFileError } from './migrations';
import { findBrokenReferences, SCHEMA_VERSION } from './project';
import {
  buildSlots,
  formatClock,
  overlaps,
  parseClock,
  slotInterval,
  teachingSlots,
  weeklyTeachingMinutes,
} from './time';

describe('time model', () => {
  it('parses and formats clock times', () => {
    expect(parseClock('07:30')).toBe(450);
    expect(formatClock(810)).toBe('13:30');
    expect(() => parseClock('25:00')).toThrow();
  });

  it('treats touching intervals as not clashing', () => {
    expect(overlaps({ start: 0, end: 40 }, { start: 40, end: 80 })).toBe(false);
    expect(overlaps({ start: 0, end: 41 }, { start: 40, end: 80 })).toBe(true);
  });

  it('detects a clash across bell schedules by clock time, not period number', () => {
    // Primary P3 09:40–10:20 vs Secondary P4 09:20–10:00: different period numbers, real clash.
    const primary = buildSlots('08:20', [['period', 'P1', 40], ['period', 'P2', 40], ['period', 'P3', 40]], 'p');
    const secondary = buildSlots(
      '07:20',
      [['period', 'P1', 40], ['period', 'P2', 40], ['period', 'P3', 40], ['period', 'P4', 40]],
      's',
    );
    const p3 = primary[2]!;
    const s4 = secondary[3]!;
    expect(formatClock(p3.start)).toBe('09:40');
    expect(formatClock(s4.start)).toBe('09:20');
    expect(overlaps(slotInterval(p3), slotInterval(s4))).toBe(true);
    expect(overlaps(slotInterval(primary[0]!), slotInterval(secondary[0]!))).toBe(false);
  });
});

describe('packs', () => {
  it('SL government day is 8 × 40 min ending 13:30 = 40 slots/week', () => {
    const p = createProject('sl-gov');
    const bell = p.bellSchedules[0]!;
    const periods = teachingSlots(bell, 'mon');
    expect(periods).toHaveLength(8);
    const last = periods[7]!;
    expect(formatClock(last.start + last.duration)).toBe('13:30');
    expect(weeklyTeachingMinutes(bell, p.institute.workingDays)).toBe(40 * 40);
  });

  it('per-day max × days is never below 40 slots in SL preset (v2 contradiction regression)', () => {
    const p = createProject('sl-gov');
    const r12 = p.rules.find((r) => r.code === 'R12')!;
    expect(r12.strength).not.toBe('hard');
    expect(Number(r12.params.maxPerDay) * p.institute.workingDays.length).toBeGreaterThanOrEqual(35);
  });

  it('every pack builds a valid, reference-clean project', () => {
    for (const pack of ['simple', 'sl-gov', 'international'] as const) {
      const p = createProject(pack, 'Test School');
      expect(findBrokenReferences(p)).toEqual([]);
    }
  });
});

describe('project file loading', () => {
  it('round-trips through JSON', () => {
    const p = createProject('sl-gov', 'Royal Test College');
    const back = loadProject(JSON.parse(JSON.stringify(p)));
    expect(back).toEqual(p);
  });

  it('fills defaults for omitted optional collections', () => {
    const p = createProject('simple');
    const raw = JSON.parse(JSON.stringify(p));
    delete raw.students;
    delete raw.overlays;
    const back = loadProject(raw);
    expect(back.students).toEqual([]);
    expect(back.overlays).toEqual([]);
  });

  it('rejects non-project files and newer versions with clear messages', () => {
    expect(() => loadProject({ hello: 1 })).toThrow(ProjectFileError);
    const p = JSON.parse(JSON.stringify(createProject('simple')));
    p.schemaVersion = SCHEMA_VERSION + 1;
    expect(() => loadProject(p)).toThrow(/newer version/);
  });

  it('reports damaged fields with paths', () => {
    const p = JSON.parse(JSON.stringify(createProject('simple')));
    p.institute.workingDays = [];
    try {
      loadProject(p);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectFileError);
      expect((e as ProjectFileError).details.join()).toContain('institute.workingDays');
    }
  });

  it('finds broken cross-references', () => {
    const p = createProject('sl-gov');
    p.sections.push({
      id: 'sec1',
      name: 'Senior',
      shortCode: '',
      local: {},
      active: true,
      bellScheduleId: 'missing',
      order: 0,
    });
    expect(findBrokenReferences(p)).toContain('Section "Senior" uses a missing bell schedule');
  });
});
