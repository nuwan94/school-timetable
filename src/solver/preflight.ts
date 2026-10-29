import { runChecks, scheduleForClass, type Issue } from '@/domain/checks';
import { doublesIn, expandPattern, patternPeriods } from '@/domain/factories';
import type { Project } from '@/domain/project';
import { numParam, ruleAppliesToClass, ruleFor } from '@/domain/rules';
import { buildModel } from './model';
import { tx } from '@/i18n';

/**
 * Pre-flight (PLAN.md §4.3): everything the live checks find, plus problems
 * that only matter for generation — impossible fixed times, rules that
 * contradict loads or norms, room shortages, blocks with no common time.
 * Each problem says what to do about it.
 */

export interface Preflight {
  errors: Issue[];
  warnings: Issue[];
  info: Issue[];
  /** Demand exceeds what can fit: generate will run in shortage mode. */
  shortage: boolean;
  /** Short summary numbers for the Check screen header. */
  summary: { lessons: number; classes: number; teachers: number; demand: number; supply: number };
}

export function preflight(p: Project): Preflight {
  const live = runChecks(p);
  const issues: Issue[] = [...live.issues];
  const model = buildModel(p);
  const days = p.institute.workingDays.length;

  // Lessons with no possible time at all (availability, fixed times, doubles).
  for (const u of model.units)
    if (u.positions.length === 0)
      issues.push({
        severity: 'error',
        message: `${u.label}: ${u.noPositionReason}.`,
        fix: u.noPositionReason?.includes('not available')
          ? tx('Add a working day for the teacher or give the lesson to another teacher.')
          : u.length > 1
            ? tx('Turn the double period into two singles, or remove the break between those periods.')
            : tx('Check the fixed time and the bell schedule.'),
      });

  // Once-per-day (R4 hard) needs no more lessons than days.
  const r4 = ruleFor(p, 'R4');
  if (r4?.strength === 'hard') {
    for (const a of p.allocations) {
      const lessons = expandPattern(a.pattern).length;
      if (lessons <= days) continue;
      const classes = a.groupIds.map((g) => p.classes.find((c) => c.id === g)).filter((c) => !!c);
      if (!classes.length || !classes.every((c) => ruleAppliesToClass(r4, c!, p))) continue;
      const subject = p.subjects.find((s) => s.id === a.subjectId);
      const needDoubles = lessons - days;
      issues.push({
        severity: 'error',
        message: tx('{join} {name}: {lessons} lessons a week but "once per day" allows only {days}.', { join: classes.map((c) => c!.name).join('+'), name: subject?.name, lessons, days }),
        fix: tx('Make {x} of its {patternPeriods} periods double periods, or make rule R4 soft.', { x: needDoubles + doublesIn(a.pattern), patternPeriods: patternPeriods(a.pattern) }),
      });
    }
  }

  // Hard daily maximum (R12) vs each teacher's load.
  const r12 = ruleFor(p, 'R12');
  const maxPerDay = numParam(r12, 'maxPerDay', 7);
  for (const t of p.teachers) {
    const total = live.teachers.get(t.id);
    if (!total) continue;
    const tDays = t.contractedDays.length ? p.institute.workingDays.filter((d) => t.contractedDays.includes(d)).length : days;
    if (r12?.strength === 'hard' && total.periods > maxPerDay * tDays)
      issues.push({
        severity: 'error',
        message: tx('{name} has {periods} periods but at most {maxPerDay}/day × {tDays} days = {x} are allowed (rule R12).', { name: t.name, periods: total.periods, maxPerDay, tDays, x: maxPerDay * tDays }),
        fix: tx('Move some periods to another teacher, add working days, or raise the daily maximum.'),
      });
    // Rule vs norm (the v2 contradiction): a daily cap that makes the minimum unreachable.
    if (r12 && total.min !== null && maxPerDay * tDays < total.min)
      issues.push({
        severity: 'warning',
        message: tx('Rule R12 (max {maxPerDay}/day) makes {name}\'s minimum of {min} periods impossible over {tDays} day(s).', { maxPerDay, name: t.name, min: total.min, tDays }),
        fix: tx('Raise the daily maximum or lower the minimum for this role.'),
      });
  }

  // Combined lessons and blocks must share one bell schedule.
  const scheduleOf = (classId: string) => {
    const c = p.classes.find((x) => x.id === classId);
    return c ? scheduleForClass(p, c)?.id : undefined;
  };
  const multiSchedule = (classIds: string[]) => new Set(classIds.map(scheduleOf)).size > 1;
  for (const b of p.optionBlocks)
    if (multiSchedule(b.classIds))
      issues.push({
        severity: 'error',
        message: tx('Option block "{name}" mixes classes with different bell schedules.', { name: b.name }),
        fix: tx('Split the block by section, or put those sections on the same bell schedule.'),
      });
  for (const a of p.allocations)
    if (a.groupIds.length > 1 && multiSchedule(a.groupIds))
      issues.push({ severity: 'error', message: tx('A combined lesson mixes classes with different bell schedules.'), fix: tx('Separate the classes.') });

  // Room types: demand vs rooms × periods.
  for (const rt of p.roomTypes) {
    const rooms = p.rooms.filter((r) => r.roomTypeId === rt.id);
    const subjects = new Set(p.subjects.filter((s) => s.roomTypeId === rt.id).map((s) => s.id));
    const demand = p.allocations.filter((a) => subjects.has(a.subjectId) && !a.roomId).reduce((s, a) => s + patternPeriods(a.pattern), 0);
    if (demand === 0) continue;
    if (rooms.length === 0) {
      issues.push({
        severity: 'info',
        message: tx('{demand} periods need a {name} but no {name} is listed — they will be timetabled without a room.', { demand, name: rt.name }),
        fix: tx('Add the {name} in Special rooms to have it scheduled.', { name: rt.name }),
      });
      continue;
    }
    const weekly = rooms.reduce((s, r) => s + r.concurrent, 0) * (live.classes.values().next().value?.capacity ?? 40);
    if (demand > weekly)
      issues.push({
        severity: 'error',
        message: tx('{demand} periods need a {name} but {rooms} room(s) give about {weekly} per week.', { demand, name: rt.name, rooms: rooms.length, weekly }),
        fix: tx('Add another {name}, or let some of these lessons use ordinary classrooms (clear "Needs room" on the subject).', { name: rt.name }),
      });
  }

  // Block lines whose teachers share no common available time.
  for (const u of model.units)
    if (u.kind === 'line' && u.teacherIds.length > 1 && u.positions.length > 0 && u.positions.length < 3)
      issues.push({
        severity: 'warning',
        message: tx('{label}: its teachers are all free at only {positions} time(s) a week.', { label: u.label, positions: u.positions.length }),
        fix: tx('Check the part-time teachers\' days in this line.'),
      });

  const r1 = ruleFor(p, 'R1');
  if (r1) {
    const missing = p.classes.filter((c) => !c.classTeacherId && ruleAppliesToClass(r1, c, p));
    if (missing.length)
      issues.push({
        severity: 'warning',
        message: tx('{missing} class(es) have no class teacher, so "class teacher takes period 1" cannot apply: {join}{x}.', { missing: missing.length, join: missing
          .slice(0, 6)
          .map((c) => c.name)
          .join(', '), x: missing.length > 6 ? '…' : '' }),
        fix: tx('Pick class teachers in Classes.'),
      });
  }

  if (p.allocations.length === 0 && p.optionBlocks.length === 0)
    issues.push({ severity: 'error', message: tx('Nothing to timetable yet.'), fix: tx('Fill in Who teaches what.') });

  const classOver = [...live.classes.values()].some((c) => c.level === 'over');
  return {
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning'),
    info: issues.filter((i) => i.severity === 'info'),
    shortage: live.demand > live.supply || classOver,
    summary: {
      lessons: model.units.length,
      classes: p.classes.length,
      teachers: p.teachers.length,
      demand: live.demand,
      supply: live.supply,
    },
  };
}
