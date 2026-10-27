import { scheduleForClass, teacherDays } from '@/domain/checks';
import type { Project } from '@/domain/project';
import { numParam, ruleAppliesToClass } from '@/domain/rules';
import { STRENGTH_WEIGHT, type RuleConfig } from '@/domain/schedule';
import { slotsForDay, type BellSchedule, type Weekday } from '@/domain/time';
import type { Model, Unit } from './model';
import type { Placed } from './state';

/**
 * Soft-rule scoring (PLAN.md §4.2). Penalty = strength weight × number of
 * breaches. The score splits into per-class, per-teacher and per-day parts
 * so the optimiser can re-score only what a move touches.
 */

export interface Hit {
  code: string;
  weight: number;
  message: string;
  classId?: string;
  teacherId?: string;
}

interface Layout {
  periods: number;
  /** Period indexes that start right after a break (consecutive counts reset). */
  afterBreak: Set<number>;
}

const DAY = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' } as const;

function layoutOf(schedule: BellSchedule, day: Weekday): Layout {
  const afterBreak = new Set<number>();
  let i = -1;
  let gap = false;
  for (const s of slotsForDay(schedule, day)) {
    if (s.kind !== 'period') {
      gap = i >= 0;
      continue;
    }
    i++;
    if (gap) afterBreak.add(i);
    gap = false;
  }
  return { periods: i + 1, afterBreak };
}

type Sink = Hit[] | null;

export class SoftScorer {
  private rules = new Map<string, { rule: RuleConfig; w: number }>();
  private unitsByClass = new Map<string, Unit[]>();
  private unitsByTeacher = new Map<string, Unit[]>();
  private classLayout = new Map<string, Map<Weekday, Layout>>();
  private teacherLayout = new Map<string, Map<Weekday, Layout>>();
  private classTeacher = new Map<string, string>();
  private ruleClasses = new Map<string, Set<string>>();
  private teacherDaysOf = new Map<string, Weekday[]>();
  private visiting = new Set<string>();
  private activity = new Set<string>();
  private names: Map<string, string>;
  readonly days: Weekday[];
  /** Codes that are scored (enabled and soft). */
  readonly codes: string[];

  constructor(p: Project, model: Model, opts: { relaxRules?: boolean } = {}) {
    this.days = model.days;
    this.names = model.names;
    for (const r of p.rules) {
      if (!r.enabled) continue;
      // Hard R4/R12 are enforced by the solver; scored only when relaxed.
      const hardHandled = r.strength === 'hard' && !(opts.relaxRules && (r.code === 'R4' || r.code === 'R12'));
      if (hardHandled) continue;
      const w = r.strength === 'hard' ? STRENGTH_WEIGHT.veryHigh : STRENGTH_WEIGHT[r.strength];
      this.rules.set(r.code, { rule: r, w });
      this.ruleClasses.set(r.code, new Set(p.classes.filter((c) => ruleAppliesToClass(r, c, p)).map((c) => c.id)));
    }
    this.codes = [...this.rules.keys()];
    for (const u of model.units) {
      for (const c of u.classIds) this.unitsByClass.set(c, [...(this.unitsByClass.get(c) ?? []), u]);
      for (const t of u.teacherIds) this.unitsByTeacher.set(t, [...(this.unitsByTeacher.get(t) ?? []), u]);
    }
    const scheduleOfClass = new Map<string, BellSchedule>();
    for (const c of p.classes) {
      const s = scheduleForClass(p, c);
      if (!s) continue;
      scheduleOfClass.set(c.id, s);
      this.classLayout.set(c.id, new Map(this.days.map((d) => [d, layoutOf(s, d)])));
      if (c.classTeacherId) this.classTeacher.set(c.id, c.classTeacherId);
    }
    for (const t of p.teachers) {
      const counts = new Map<BellSchedule, number>();
      for (const u of this.unitsByTeacher.get(t.id) ?? []) {
        const s = scheduleOfClass.get(u.classIds[0]!);
        if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      const s = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? p.bellSchedules[0];
      if (s) this.teacherLayout.set(t.id, new Map(this.days.map((d) => [d, layoutOf(s, d)])));
      this.teacherDaysOf.set(t.id, teacherDays(p, t));
      if (t.category === 'visiting' || t.category === 'coach' || t.windows.length) this.visiting.add(t.id);
    }
    for (const s of p.subjects) if (s.kind === 'activity') this.activity.add(s.id);
  }

  private on(code: string, classId?: string) {
    const r = this.rules.get(code);
    if (!r) return null;
    if (classId && !this.ruleClasses.get(code)!.has(classId)) return null;
    return r;
  }

  private teacherOn(code: string, teacherId: string) {
    const r = this.rules.get(code);
    if (!r) return null;
    const scope = r.rule.scope.teacherIds;
    return scope.length && !scope.includes(teacherId) ? null : r;
  }

  private hit(sink: Sink, code: string, w: number, n: number, message: () => string, ids: { classId?: string; teacherId?: string }) {
    if (n <= 0) return 0;
    if (sink) sink.push({ code, weight: w * n, message: message(), ...ids });
    return w * n;
  }

  /** Period indexes occupied per day by these units. */
  private occupancy(units: Unit[] | undefined, placed: Map<string, Placed>) {
    const byDay = new Map<Weekday, { u: Unit; idx: number }[]>();
    for (const u of units ?? []) {
      const at = placed.get(u.key);
      if (!at) continue;
      const list = byDay.get(at.pos.day) ?? [];
      for (let k = 0; k < u.length; k++) list.push({ u, idx: at.pos.periodIndex + k });
      byDay.set(at.pos.day, list);
    }
    return byDay;
  }

  // ---------------------------------------------------------------- class

  classScore(classId: string, placed: Map<string, Placed>, sink: Sink = null): number {
    let total = 0;
    const units = this.unitsByClass.get(classId) ?? [];
    const layout = this.classLayout.get(classId);
    const cname = () => this.names.get(classId) ?? '?';
    if (!layout) return 0;

    // Lessons per subject: days used and start periods.
    const bySubject = new Map<string, { days: Map<Weekday, number>; starts: Map<number, number>; lessons: number; heavy: boolean; subjectId: string }>();
    for (const u of units) {
      const at = placed.get(u.key);
      if (!at) continue;
      const s = bySubject.get(u.subjectKey) ?? { days: new Map(), starts: new Map(), lessons: 0, heavy: u.heavy, subjectId: u.subjectKey };
      s.days.set(at.pos.day, (s.days.get(at.pos.day) ?? 0) + 1);
      // The class teacher's P1 lesson is meant to repeat (R1), so R8 ignores it.
      if (!(at.pos.periodIndex === 0 && u.classTeacherLesson)) s.starts.set(at.pos.periodIndex, (s.starts.get(at.pos.periodIndex) ?? 0) + 1);
      s.lessons++;
      bySubject.set(u.subjectKey, s);

      const r6 = u.heavy ? this.on('R6', classId) : null;
      const per = layout.get(at.pos.day)?.periods ?? 8;
      if (r6) total += this.hit(sink, 'R6', r6.w, at.pos.periodIndex >= Math.ceil(per / 2) ? 1 : 0, () => `${u.label} after mid-day (${DAY[at.pos.day]})`, { classId });
      const r7 = this.activity.has(u.subjectKey) ? this.on('R7', classId) : null;
      if (r7) {
        const bad = at.pos.periodIndex === 0 || !!layout.get(at.pos.day)?.afterBreak.has(at.pos.periodIndex);
        total += this.hit(sink, 'R7', r7.w, bad ? 1 : 0, () => `${u.label} in P1 or right after a break (${DAY[at.pos.day]})`, { classId });
      }
    }
    const subjectName = (k: string) => this.names.get(k) ?? 'block';
    for (const [key, s] of bySubject) {
      const r4 = this.on('R4', classId);
      if (r4) {
        const max = numParam(r4.rule, 'maxPerDay', 1);
        let extra = 0;
        for (const n of s.days.values()) extra += Math.max(0, n - max);
        total += this.hit(sink, 'R4', r4.w, extra, () => `${cname()} has ${subjectName(key)} more than ${max}× a day`, { classId });
      }
      const r5 = this.on('R5', classId);
      if (r5) {
        const ideal = Math.min(s.lessons, this.days.length);
        total += this.hit(sink, 'R5', r5.w, ideal - s.days.size, () => `${cname()} ${subjectName(key)} on only ${s.days.size} day(s)`, { classId });
      }
      const r8 = this.on('R8', classId);
      if (r8) {
        let same = 0;
        for (const n of s.starts.values()) same += Math.max(0, n - 2);
        total += this.hit(sink, 'R8', r8.w, same, () => `${cname()} ${subjectName(key)} in the same period on 3+ days`, { classId });
      }
    }

    const r1 = this.on('R1', classId);
    const ct = this.classTeacher.get(classId);
    if (r1 && ct) {
      const want = Math.min(numParam(r1.rule, 'daysPerWeek', 5), this.days.length);
      let have = 0;
      for (const u of units) {
        const at = placed.get(u.key);
        if (at && at.pos.periodIndex === 0 && u.teacherIds.includes(ct)) have++;
      }
      total += this.hit(sink, 'R1', r1.w, want - have, () => `${cname()}: class teacher takes P1 on ${have} of ${want} days`, { classId, teacherId: ct });
    }
    return total;
  }

  // ---------------------------------------------------------------- teacher

  teacherScore(teacherId: string, placed: Map<string, Placed>, sink: Sink = null): number {
    let total = 0;
    const layout = this.teacherLayout.get(teacherId);
    if (!layout) return 0;
    const byDay = this.occupancy(this.unitsByTeacher.get(teacherId), placed);
    const tname = () => this.names.get(teacherId) ?? '?';
    const days = this.teacherDaysOf.get(teacherId) ?? this.days;
    const loads: number[] = [];
    const frees: number[] = [];
    const lastPeriodByClass = new Map<string, number>();

    for (const d of days) {
      const L = layout.get(d);
      if (!L) continue;
      const list = byDay.get(d) ?? [];
      const occ = new Set(list.map((x) => x.idx));
      loads.push(occ.size);
      frees.push(Math.max(0, L.periods - occ.size));
      if (!occ.size) continue;
      const first = Math.min(...occ);
      const last = Math.max(...occ);

      const r12 = this.teacherOn('R12', teacherId);
      if (r12) {
        const max = numParam(r12.rule, 'maxPerDay', 7);
        total += this.hit(sink, 'R12', r12.w, occ.size - max, () => `${tname()} teaches ${occ.size} periods on ${DAY[d]} (max ${max})`, { teacherId });
      }
      const r11 = this.teacherOn('R11', teacherId);
      if (r11) {
        const max = numParam(r11.rule, 'maxConsecutive', 4);
        let run = 0;
        let excess = 0;
        for (let i = 0; i < L.periods; i++) {
          if (L.afterBreak.has(i)) run = 0;
          run = occ.has(i) ? run + 1 : 0;
          if (run > max) excess++;
        }
        total += this.hit(sink, 'R11', r11.w, excess, () => `${tname()} has more than ${max} periods in a row on ${DAY[d]}`, { teacherId });
      }
      const r13 = this.visiting.has(teacherId) ? null : this.teacherOn('R13', teacherId);
      if (r13) {
        let single = 0;
        for (let i = first + 1; i < last; i++) if (!occ.has(i) && occ.has(i - 1) && occ.has(i + 1)) single++;
        total += this.hit(sink, 'R13', r13.w, single, () => `${tname()} has a single free period between lessons on ${DAY[d]}`, { teacherId });
      }
      const r15 = this.teacherOn('R15', teacherId);
      if (r15) total += this.hit(sink, 'R15', r15.w, occ.size >= L.periods ? 1 : 0, () => `${tname()} has no free period on ${DAY[d]}`, { teacherId });
      const r25 = this.visiting.has(teacherId) ? this.teacherOn('R25', teacherId) : null;
      if (r25) {
        let holes = 0;
        for (let i = first; i <= last; i++) if (!occ.has(i)) holes++;
        total += this.hit(sink, 'R25', r25.w, holes, () => `${tname()} (visiting) waits ${holes} free period(s) on ${DAY[d]}`, { teacherId });
      }
      for (const x of list) if (x.idx === L.periods - 1) for (const c of x.u.classIds) lastPeriodByClass.set(c, (lastPeriodByClass.get(c) ?? 0) + 1);
    }

    const r14 = this.teacherOn('R14', teacherId);
    if (r14 && loads.some((n) => n > 0)) {
      const tol = numParam(r14.rule, 'tolerance', 2);
      const spread = Math.max(...loads) - Math.min(...loads);
      total += this.hit(sink, 'R14', r14.w, spread - tol, () => `${tname()}'s daily load ranges ${Math.min(...loads)}–${Math.max(...loads)}`, { teacherId });
    }
    const r24 = this.teacherOn('R24', teacherId);
    if (r24 && frees.length) {
      const tol = numParam(r24.rule, 'tolerance', 3);
      const spread = Math.max(...frees) - Math.min(...frees);
      total += this.hit(sink, 'R24', r24.w, spread - tol, () => `${tname()}'s free periods are bunched (${Math.min(...frees)}–${Math.max(...frees)} a day)`, { teacherId });
    }
    const r23 = this.teacherOn('R23', teacherId);
    if (r23) {
      const max = numParam(r23.rule, 'maxPerWeek', 2);
      for (const [c, n] of lastPeriodByClass)
        total += this.hit(sink, 'R23', r23.w, n - max, () => `${tname()} has ${this.names.get(c)} in the last period ${n}× a week`, { teacherId, classId: c });
    }
    return total;
  }

  // ---------------------------------------------------------------- school

  /** R26: enough teachers free in every period (the relief pool). */
  dayScore(day: Weekday, placed: Map<string, Placed>, sink: Sink = null): number {
    const r26 = this.rules.get('R26');
    if (!r26) return 0;
    const min = numParam(r26.rule, 'minFree', 3);
    const busy = new Map<number, Set<string>>();
    let periods = 0;
    let present = 0;
    for (const [t, units] of this.unitsByTeacher) {
      if (!(this.teacherDaysOf.get(t) ?? []).includes(day)) continue;
      present++;
      periods = Math.max(periods, this.teacherLayout.get(t)?.get(day)?.periods ?? 0);
      for (const u of units) {
        const at = placed.get(u.key);
        if (!at || at.pos.day !== day) continue;
        for (let k = 0; k < u.length; k++) {
          const i = at.pos.periodIndex + k;
          const s = busy.get(i) ?? new Set<string>();
          s.add(t);
          busy.set(i, s);
        }
      }
    }
    let total = 0;
    for (let i = 0; i < periods; i++) {
      const free = present - (busy.get(i)?.size ?? 0);
      total += this.hit(sink, 'R26', r26.w, min - free, () => `Only ${free} teacher(s) free in P${i + 1} on ${DAY[day]} (want ${min})`, {});
    }
    return total;
  }

  total(placed: Map<string, Placed>): number {
    let t = 0;
    for (const c of this.unitsByClass.keys()) t += this.classScore(c, placed);
    for (const id of this.unitsByTeacher.keys()) t += this.teacherScore(id, placed);
    for (const d of this.days) t += this.dayScore(d, placed);
    return t;
  }

  hits(placed: Map<string, Placed>): Hit[] {
    const sink: Hit[] = [];
    for (const c of this.unitsByClass.keys()) this.classScore(c, placed, sink);
    for (const id of this.unitsByTeacher.keys()) this.teacherScore(id, placed, sink);
    for (const d of this.days) this.dayScore(d, placed, sink);
    return sink;
  }

  /** Score of the classes, teachers and days a set of units touches. */
  local(units: Unit[], days: Iterable<Weekday>, placed: Map<string, Placed>): number {
    const classes = new Set(units.flatMap((u) => u.classIds));
    const teachers = new Set(units.flatMap((u) => u.teacherIds));
    let t = 0;
    for (const c of classes) t += this.classScore(c, placed);
    for (const id of teachers) t += this.teacherScore(id, placed);
    for (const d of new Set(days)) t += this.dayScore(d, placed);
    return t;
  }
}

export interface SoftReport {
  total: number;
  byRule: { code: string; penalty: number; count: number; examples: string[] }[];
  byTeacher: { teacherId: string; name: string; penalty: number; count: number }[];
}

export function softReport(scorer: SoftScorer, placed: Map<string, Placed>, names: Map<string, string>): SoftReport {
  const hits = scorer.hits(placed);
  const byRule = new Map<string, SoftReport['byRule'][number]>();
  const byTeacher = new Map<string, SoftReport['byTeacher'][number]>();
  for (const h of hits) {
    const r = byRule.get(h.code) ?? { code: h.code, penalty: 0, count: 0, examples: [] };
    r.penalty += h.weight;
    r.count++;
    if (r.examples.length < 8) r.examples.push(h.message);
    byRule.set(h.code, r);
    if (h.teacherId) {
      const t = byTeacher.get(h.teacherId) ?? { teacherId: h.teacherId, name: names.get(h.teacherId) ?? '?', penalty: 0, count: 0 };
      t.penalty += h.weight;
      t.count++;
      byTeacher.set(h.teacherId, t);
    }
  }
  return {
    total: hits.reduce((s, h) => s + h.weight, 0),
    byRule: [...byRule.values()].sort((a, b) => b.penalty - a.penalty),
    byTeacher: [...byTeacher.values()].sort((a, b) => b.penalty - a.penalty),
  };
}
