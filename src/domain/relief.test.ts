import { produce } from 'immer';
import { beforeAll, describe, expect, it } from 'vitest';
import { sampleSchool } from '@/packs/sample';
import { generateTimetable } from '@/solver';
import { newId } from './common';
import type { Project } from './project';
import {
  absenceOn,
  alternatives,
  autoAssign,
  candidates,
  coverNeeds,
  dayContext,
  ledgerRows,
  makeAssignment,
  timetableFor,
  weekdayOf,
  weekStart,
} from './relief';
import type { Absence } from './schedule';
import { approveActiveVersion, lessonEntries, saveDraftVersion } from './timetable';

const MON = '2027-01-04';
let p: Project;

beforeAll(async () => {
  const base = sampleSchool();
  const r = await generateTimetable(base, { seed: 1 });
  p = produce(base, (d) => {
    saveDraftVersion(d, r.placements, 'seed 1');
    approveActiveVersion(d, '2027-01-01');
  });
});

const absence = (teacherId: string, from: string, more: Partial<Absence> = {}): Absence => ({
  id: newId('abs'),
  teacherId,
  from,
  to: from,
  slotIds: [],
  recurrence: null,
  reason: '',
  coverTeacherId: null,
  ...more,
});
const withAbsences = (...list: Absence[]) => produce(p, (d) => void d.absences.push(...list));
const teacher = (code: string) => p.teachers.find((t) => t.shortCode === code)!;
const mondayPeriods = (q: Project, teacherId: string) =>
  lessonEntries(q, q.versions[0]!.placements)
    .filter((e) => e.day === 'mon' && e.teacherIds.includes(teacherId))
    .reduce((n, e) => n + e.slotIds.length, 0);

describe('dates', () => {
  it('knows weekdays and week starts', () => {
    expect(weekdayOf(MON)).toBe('mon');
    expect(weekdayOf('2027-01-09')).toBe('sat');
    expect(weekStart('2027-01-07')).toBe(MON);
    expect(weekStart('2027-01-10')).toBe(MON);
  });

  it('expands recurring absences (every 2nd Tuesday)', () => {
    const a = absence('t', '2027-01-05', { to: '2027-01-05', recurrence: { day: 'tue', everyWeeks: 2, from: '2027-01-05', to: null } });
    expect(['2027-01-05', '2027-01-12', '2027-01-19', '2027-01-26'].map((d) => absenceOn(a, d))).toEqual([true, false, true, false]);
    expect(absenceOn(a, '2027-01-04')).toBe(false);
  });

  it('uses the approved timetable in force on the date', () => {
    expect(timetableFor(p, MON)?.status).toBe('approved');
  });
});

describe('cover needs', () => {
  it('a whole-day absence needs cover for every period that teacher teaches that day', () => {
    const t = teacher('PER');
    const q = withAbsences(absence(t.id, MON));
    const needs = coverNeeds(q, dayContext(q, MON));
    expect(needs.length).toBe(mondayPeriods(q, t.id));
    expect(needs.every((n) => n.absentTeacherId === t.id)).toBe(true);
  });

  it('a part-day absence only covers the chosen periods', () => {
    const t = teacher('PER');
    const ctx0 = dayContext(p, MON);
    const first = ctx0.entries.find((e) => e.teacherIds.includes(t.id))!;
    const q = withAbsences(absence(t.id, MON, { slotIds: [first.slotIds[0]!] }));
    const needs = coverNeeds(q, dayContext(q, MON));
    expect(needs.map((n) => n.slotId)).toEqual([first.slotIds[0]]);
  });

  it('holidays need no cover; classes away free their lessons; marking camp marks teachers absent', () => {
    const t = teacher('PER');
    const holiday = produce(withAbsences(absence(t.id, MON)), (d) => {
      d.overlays.push({ id: 'h', name: 'Poya', shortCode: '', local: {}, active: true, kind: 'holiday', from: MON, to: MON, blockedRoomIds: [], removedGroupIds: [], absentTeacherIds: [], note: '' });
    });
    const hctx = dayContext(holiday, MON);
    expect(hctx.closed).toBe('Poya');
    expect(coverNeeds(holiday, hctx)).toEqual([]);

    const away = p.classes.filter((c) => c.name.startsWith('6')).map((c) => c.id);
    const exams = produce(p, (d) => {
      d.overlays.push({ id: 'x', name: 'Term test', shortCode: '', local: {}, active: true, kind: 'termTest', from: MON, to: MON, blockedRoomIds: [], removedGroupIds: away, absentTeacherIds: [t.id], note: '' });
    });
    const ectx = dayContext(exams, MON);
    expect(ectx.absent.get(t.id)?.sources[0]?.kind).toBe('overlay');
    const needs = coverNeeds(exams, ectx);
    expect(needs.length).toBeGreaterThan(0);
    expect(needs.some((n) => n.classIds.some((c) => away.includes(c)))).toBe(false);
  });
});

describe('candidates and assignment', () => {
  it('ranks only free, present teachers under the daily maximum, fewest reliefs first', () => {
    const t = teacher('PER');
    const q = withAbsences(absence(t.id, MON));
    const ctx = dayContext(q, MON);
    const need = coverNeeds(q, ctx)[0]!;
    const list = candidates(q, ctx, need);
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) {
      expect(c.teacherId).not.toBe(t.id);
      expect(ctx.entries.some((e) => e.teacherIds.includes(c.teacherId) && e.start < need.end && need.start < e.end)).toBe(false);
      expect(c.load).toBeLessThan(7);
    }
    // Give the top candidate two reliefs earlier this week: they drop behind someone with none.
    const top = list[0]!;
    const busier = produce(q, (d) => {
      for (const day of ['2027-01-05', '2027-01-06'])
        d.relief.push({ id: newId('rel'), date: day, slotId: need.slotId, itemId: 'x', absentTeacherId: 'y', kind: 'teacher', reliefTeacherId: top.teacherId, combineWithGroupId: null, note: '' });
    });
    const again = candidates(busier, dayContext(busier, MON), need);
    expect(again[0]!.teacherId).not.toBe(top.teacherId);
    expect(again.find((c) => c.teacherId === top.teacherId)!.week).toBe(2);
  });

  it('auto-assign covers every period with no relief teacher booked twice', () => {
    const q = withAbsences(absence(teacher('PER').id, MON), absence(teacher('FER').id, MON), absence(teacher('SIL').id, MON));
    const ctx = dayContext(q, MON);
    const needs = coverNeeds(q, ctx);
    const relief = autoAssign(q, ctx, needs);
    expect(relief).toHaveLength(needs.length);
    const seen = new Set<string>();
    for (const r of relief) {
      const n = needs.find((x) => x.itemId === r.itemId && x.slotId === r.slotId)!;
      const k = `${r.reliefTeacherId}|${n.start}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
      expect(ctx.entries.some((e) => e.teacherIds.includes(r.reliefTeacherId!) && e.start < n.end && n.start < e.end)).toBe(false);
    }
    // Both halves of a double go to the same relief teacher.
    for (const r of relief) {
      const twin = relief.find((x) => x !== r && x.itemId === r.itemId && x.absentTeacherId === r.absentTeacherId);
      if (twin) expect(twin.reliefTeacherId).toBe(r.reliefTeacherId);
    }
    // Spread fairly: nobody gets more than 2 of these on one day.
    const per = new Map<string, number>();
    for (const r of relief) per.set(r.reliefTeacherId!, (per.get(r.reliefTeacherId!) ?? 0) + 1);
    expect(Math.max(...per.values())).toBeLessThanOrEqual(2);
  });

  it('offers class teacher, combine-with-neighbour and supervised alternatives', () => {
    const t = teacher('PER');
    const q = withAbsences(absence(t.id, MON));
    const ctx = dayContext(q, MON);
    const all = coverNeeds(q, ctx).flatMap((n) => alternatives(q, ctx, n));
    expect(all.some((a) => a.kind === 'combine' && a.combineWithGroupId)).toBe(true);
    expect(all.some((a) => a.kind === 'supervised' && a.note === 'Library')).toBe(true);
  });

  it('ledger counts reliefs per teacher', () => {
    const q = withAbsences(absence(teacher('PER').id, MON));
    const ctx = dayContext(q, MON);
    const [need] = coverNeeds(q, ctx);
    const someone = candidates(q, ctx, need!)[0]!.teacherId;
    const r = produce(q, (d) => void d.relief.push(makeAssignment(ctx, need!, { kind: 'teacher', reliefTeacherId: someone })));
    const row = ledgerRows(r, MON).find((x) => x.teacherId === someone)!;
    expect(row).toMatchObject({ week: 1, term: 1, total: 1 });
    expect(ledgerRows(r, MON).find((x) => x.teacherId === teacher('PER').id)!.absentDays).toBe(1);
  });
});

describe('relief register and slips', () => {
  it('lists every period to cover, with assignments, in the print language', async () => {
    const { reliefRegister, reliefSlips } = await import('@/print/reliefSheets');
    const q0 = withAbsences(absence(teacher('PER').id, MON));
    const ctx = dayContext(q0, MON);
    const needs = coverNeeds(q0, ctx);
    const q = produce(q0, (d) => void (d.relief = autoAssign(q0, ctx, needs.slice(1))));
    const reg = reliefRegister(q, MON, 'en');
    const table = reg.blocks.find((b) => b.type === 'table');
    expect(table?.type === 'table' && table.rows).toHaveLength(needs.length);
    expect(table?.type === 'table' && table.head).toEqual(['Class', 'Subject', 'Absent', 'Relief by', 'Signature']);
    expect(JSON.stringify(reg)).toContain('not covered');
    expect(reg.subtitle).toBe(`${MON} · Monday`);
    const slips = reliefSlips(q, MON, 'si');
    expect(slips.flatMap((s) => s.blocks).reduce((n, b) => n + (b.type === 'slips' ? b.items.length : 0), 0)).toBe(needs.length - 1);
    expect(slips[0]!.title).toBe('ආදේශ පත්‍රිකාව');
  });
});
