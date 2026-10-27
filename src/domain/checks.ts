import type { LoadNorm, SchoolClass, Teacher } from './entities';
import { patternPeriods } from './factories';
import type { Project } from './project';
import { teachingSlots, type BellSchedule, type Weekday } from './time';

/**
 * Live allocation checks (PLAN.md §4.3). Pure functions over a Project so the
 * allocation matrix, the Check screen and tests share one implementation.
 * P1 counts load in periods; minute-based norms arrive with the International pack.
 */

export type Level = 'ok' | 'under' | 'over' | 'none';

export interface Issue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** Concrete suggested fix, when one can be computed. */
  fix?: string;
}

// ------------------------------------------------------------ capacities

export function scheduleForClass(p: Project, c: SchoolClass): BellSchedule | undefined {
  const grade = p.grades.find((g) => g.id === c.gradeId);
  const section = grade && p.sections.find((s) => s.id === grade.sectionId);
  return p.bellSchedules.find((b) => b.id === section?.bellScheduleId) ?? p.bellSchedules[0];
}

export function weeklyPeriods(schedule: BellSchedule | undefined, days: readonly Weekday[]): number {
  if (!schedule) return 0;
  return days.reduce((n, d) => n + teachingSlots(schedule, d).length, 0);
}

/** Teaching periods a class must fill each week. */
export function classCapacity(p: Project, c: SchoolClass): number {
  return weeklyPeriods(scheduleForClass(p, c), p.institute.workingDays);
}

/** Days a teacher can work: contracted days ∩ working days (empty contract = all). */
export function teacherDays(p: Project, t: Teacher): Weekday[] {
  const days = p.institute.workingDays;
  return t.contractedDays.length ? days.filter((d) => t.contractedDays.includes(d)) : [...days];
}

/**
 * Periods a teacher could physically teach per week, measured against the
 * longest bell schedule in use (teachers may cross sections).
 */
export function teacherCapacity(p: Project, t: Teacher): number {
  const days = teacherDays(p, t);
  return Math.max(0, ...p.bellSchedules.map((b) => weeklyPeriods(b, days)));
}

export function normFor(p: Project, t: Teacher): LoadNorm | null {
  if (t.normOverride) return t.normOverride;
  return p.roles.find((r) => r.id === t.roleId)?.norm ?? null;
}

// ------------------------------------------------------------------ totals

export interface ClassTotal {
  classId: string;
  periods: number;
  capacity: number;
  level: Level;
  uncovered: number;
}

export interface TeacherTotal {
  teacherId: string;
  periods: number;
  capacity: number;
  min: number | null;
  max: number | null;
  level: Level;
  covering: number;
}

export function classTotals(p: Project): Map<string, ClassTotal> {
  const out = new Map<string, ClassTotal>();
  for (const c of p.classes) {
    out.set(c.id, { classId: c.id, periods: 0, capacity: classCapacity(p, c), level: 'none', uncovered: 0 });
  }
  for (const a of p.allocations) {
    const n = patternPeriods(a.pattern);
    for (const g of a.groupIds) {
      const t = out.get(g);
      if (!t) continue;
      t.periods += n;
      if (a.status === 'uncovered') t.uncovered += n;
    }
  }
  for (const t of out.values()) {
    t.level = t.periods === 0 ? 'none' : t.periods < t.capacity ? 'under' : t.periods > t.capacity ? 'over' : 'ok';
  }
  return out;
}

export function teacherTotals(p: Project): Map<string, TeacherTotal> {
  const out = new Map<string, TeacherTotal>();
  for (const t of p.teachers) {
    const norm = normFor(p, t);
    const periodsNorm = norm?.unit === 'periods' ? norm : null;
    out.set(t.id, {
      teacherId: t.id,
      periods: 0,
      capacity: teacherCapacity(p, t),
      min: periodsNorm?.min ?? null,
      max: periodsNorm?.max ?? null,
      level: 'none',
      covering: 0,
    });
  }
  for (const a of p.allocations) {
    const n = patternPeriods(a.pattern);
    for (const id of a.teacherIds) {
      const t = out.get(id);
      if (!t) continue;
      t.periods += n;
      if (a.status === 'covering') t.covering += n;
    }
  }
  for (const t of out.values()) {
    const max = Math.min(t.max ?? Infinity, t.capacity);
    t.level = t.periods > max ? 'over' : t.min !== null && t.periods < t.min ? 'under' : t.periods > 0 ? 'ok' : 'none';
  }
  return out;
}

// ------------------------------------------------------------------ issues

export interface Checks {
  classes: Map<string, ClassTotal>;
  teachers: Map<string, TeacherTotal>;
  /** Total periods allocated vs total teacher capacity (excluding vacancies). */
  demand: number;
  supply: number;
  uncoveredPeriods: number;
  issues: Issue[];
}

export function runChecks(p: Project): Checks {
  const classes = classTotals(p);
  const teachers = teacherTotals(p);
  const issues: Issue[] = [];
  const name = (id: string) => p.teachers.find((t) => t.id === id)?.name ?? '?';
  const className = (id: string) => p.classes.find((c) => c.id === id)?.name ?? '?';

  // Teachers with spare capacity, most spare first — used for fix suggestions.
  const spare = [...teachers.values()]
    .filter((t) => p.teachers.find((x) => x.id === t.teacherId)?.category !== 'vacancy')
    .map((t) => ({ id: t.teacherId, spare: Math.min(t.max ?? Infinity, t.capacity) - t.periods }))
    .filter((t) => t.spare > 0)
    .sort((a, b) => b.spare - a.spare);

  for (const t of teachers.values()) {
    const teacher = p.teachers.find((x) => x.id === t.teacherId)!;
    if (t.level === 'over') {
      const limit = Math.min(t.max ?? Infinity, t.capacity);
      const excess = t.periods - limit;
      const subjects = new Set(teacher.subjectIds);
      const helper = spare.find(
        (s) => s.id !== teacher.id && s.spare >= excess && p.teachers.find((x) => x.id === s.id)!.subjectIds.some((x) => subjects.has(x)),
      );
      issues.push({
        severity: 'error',
        message: `${teacher.name} has ${t.periods} periods (limit ${limit}).`,
        fix: helper ? `Move ${excess} period(s) to ${name(helper.id)}, who has ${helper.spare} spare and teaches the same subject.` : undefined,
      });
    } else if (t.level === 'under') {
      issues.push({
        severity: 'warning',
        message: `${teacher.name} has ${t.periods} periods, below the minimum of ${t.min}.`,
      });
    }
  }

  for (const c of classes.values()) {
    if (c.level === 'over')
      issues.push({ severity: 'error', message: `${className(c.classId)} has ${c.periods} periods but only ${c.capacity} slots.` });
    else if (c.level === 'under')
      issues.push({ severity: 'warning', message: `${className(c.classId)} has ${c.capacity - c.periods} empty period(s) (${c.periods}/${c.capacity}).` });
  }

  for (const a of p.allocations) {
    const subject = p.subjects.find((s) => s.id === a.subjectId);
    for (const tid of a.teacherIds) {
      const t = p.teachers.find((x) => x.id === tid);
      if (!t) continue;
      for (const g of a.groupIds) {
        const c = p.classes.find((x) => x.id === g);
        if (c && c.medium !== 'bilingual' && t.media.length > 0 && !t.media.includes(c.medium)) {
          issues.push({
            severity: 'warning',
            message: `${t.name} teaches ${subject?.name ?? 'a subject'} to ${c.name} (${c.medium} medium) but is not listed for that medium.`,
          });
        }
      }
    }
  }

  const demand = [...classes.values()].reduce((s, c) => s + c.periods, 0);
  const supply = p.teachers
    .filter((t) => t.active && t.category !== 'vacancy')
    .reduce((s, t) => {
      const tt = teachers.get(t.id)!;
      return s + Math.min(tt.max ?? Infinity, tt.capacity);
    }, 0);
  const uncoveredPeriods = [...classes.values()].reduce((s, c) => s + c.uncovered, 0);
  if (uncoveredPeriods > 0)
    issues.push({ severity: 'info', message: `${uncoveredPeriods} period(s) have no teacher yet (uncovered / self-study).` });
  if (demand > supply)
    issues.push({
      severity: 'error',
      message: `Teacher shortage: classes need ${demand} teacher-periods but staff can give at most ${supply}. Short by ${demand - supply}.`,
    });

  return { classes, teachers, demand, supply, uncoveredPeriods, issues };
}
