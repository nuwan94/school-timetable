import { mainSchedule, lessonEntries, type LessonEntry } from './timetable';
import { addDays, dayContext } from './relief';
import type { Project } from './project';
import type { ReportTable } from './returns';
import { teachingSlots } from './time';
import { dayLong, tx } from '@/i18n';

/**
 * International reports (PLAN.md §13 P7): room use, contact hours against
 * the boards' guided learning hours, contract hours for expatriate staff,
 * visiting specialists' claims, houses and co-curricular activities.
 * Every report reads the active timetable and returns a plain table.
 */

const activeEntries = (p: Project): LessonEntry[] => {
  const v = p.versions.find((x) => x.id === p.activeVersionId);
  return v ? lessonEntries(p, v.placements) : [];
};
const minutes = (e: LessonEntry) => e.end - e.start;
const hours = (m: number) => Math.round((m / 60) * 10) / 10;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** The lessons one student attends: their class lessons, and in each block line only their own set. */
export function studentEntries(p: Project, entries: LessonEntry[], studentId: string): LessonEntry[] {
  const s = p.students.find((x) => x.id === studentId);
  if (!s) return [];
  const inGroup = (id: string) => {
    if (id === s.classId) return true;
    const g = p.studentGroups.find((x) => x.id === id);
    if (!g) return false;
    return g.studentIds.length ? g.studentIds.includes(studentId) : g.classIds.includes(s.classId);
  };
  const out: LessonEntry[] = [];
  for (const e of entries) {
    const alloc = p.allocations.find((a) => a.id === e.itemId);
    if (alloc) {
      if (alloc.groupIds.some(inGroup)) out.push(e);
      continue;
    }
    const line = p.optionBlocks.flatMap((b) => b.lines).find((l) => l.id === e.itemId);
    if (!line) continue;
    const k = line.sets.findIndex((x) => inGroup(x.groupId) && p.studentGroups.find((g) => g.id === x.groupId)?.studentIds.length);
    const part = k >= 0 ? e.parts[k] : undefined;
    if (part) out.push({ ...e, title: part.subject, parts: [part], teacherIds: part.teacherIds });
  }
  return out;
}

// ------------------------------------------------------------- room use

export function roomUtilisation(p: Project): ReportTable {
  const entries = activeEntries(p);
  const schedule = mainSchedule(p, entries);
  const periods = schedule ? p.institute.workingDays.reduce((s, d) => s + teachingSlots(schedule, d).length, 0) : 0;
  const slotMinutes = schedule ? p.institute.workingDays.reduce((s, d) => s + teachingSlots(schedule, d).reduce((t, x) => t + x.duration, 0), 0) : 0;
  const used = new Map<string, { minutes: number; subjects: Map<string, number> }>();
  const homeOf = (classIds: string[]) => (classIds.length === 1 ? (p.classes.find((c) => c.id === classIds[0])?.homeRoomId ?? null) : null);
  const lines = new Map(p.optionBlocks.flatMap((b) => b.lines.map((l) => [l.id, l] as const)));
  const code = (id: string) => {
    const s = p.subjects.find((x) => x.id === id);
    return s?.shortCode || s?.name || '?';
  };
  for (const e of entries) {
    // A block line uses one room per set, each for its own subject.
    const line = lines.get(e.itemId);
    const uses: [string, string][] = line
      ? line.sets.flatMap((s) => (s.roomId ? [[s.roomId, code(s.subjectId)] as [string, string]] : []))
      : (e.roomIds.length ? e.roomIds : [homeOf(e.classIds)].filter((r): r is string => !!r)).map((r) => [r, e.title]);
    for (const [r, subject] of uses) {
      const u = used.get(r) ?? { minutes: 0, subjects: new Map() };
      u.minutes += minutes(e);
      u.subjects.set(subject, (u.subjects.get(subject) ?? 0) + 1);
      used.set(r, u);
    }
  }
  const rows = p.rooms
    .filter((r) => r.active)
    .map((r) => {
      const u = used.get(r.id);
      const capacity = slotMinutes * r.concurrent;
      const top = u
        ? [...u.subjects]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([s]) => s)
            .join(', ')
        : '';
      const usedPeriods = u && periods ? Math.round((u.minutes / slotMinutes) * periods * 10) / 10 : 0;
      return {
        room: r.name,
        seats: r.seats || '',
        used: usedPeriods,
        available: periods * r.concurrent,
        percent: pct(u?.minutes ?? 0, capacity),
        mostly: top,
      };
    })
    .sort((a, b) => b.percent - a.percent || a.room.localeCompare(b.room));
  return {
    id: 'room-use',
    title: tx('Room utilisation'),
    note: tx('Periods a week each room is in use (lessons with no room count in the form room). Low figures show space to spare; above 85% leaves little room to move lessons.'),
    columns: [
      { key: 'room', label: tx('Room') },
      { key: 'seats', label: tx('Seats'), numeric: true },
      { key: 'used', label: tx('Periods used'), numeric: true },
      { key: 'available', label: tx('Periods available'), numeric: true },
      { key: 'percent', label: tx('% used'), numeric: true },
      { key: 'mostly', label: tx('Mostly') },
    ],
    rows,
  };
}

// ----------------------------------------------------- contact vs GLH

interface Teaching {
  subjectId: string;
  group: string;
  minutes: number;
}

/** Weekly minutes per subject per teaching group (class or set). */
function teachingGroups(p: Project, entries: LessonEntry[]): Teaching[] {
  const out = new Map<string, Teaching>();
  const add = (key: string, subjectId: string, group: string, m: number) => {
    const t = out.get(key) ?? { subjectId, group, minutes: 0 };
    t.minutes += m;
    out.set(key, t);
  };
  for (const e of entries) {
    const alloc = p.allocations.find((a) => a.id === e.itemId);
    if (alloc) {
      const names = e.classIds.map((id) => p.classes.find((c) => c.id === id)?.name ?? '').join('+');
      add(alloc.id, alloc.subjectId, names, minutes(e));
      continue;
    }
    const line = p.optionBlocks.flatMap((b) => b.lines).find((l) => l.id === e.itemId);
    for (const s of line?.sets ?? []) add(s.id, s.subjectId, p.studentGroups.find((g) => g.id === s.groupId)?.name ?? '', minutes(e));
  }
  return [...out.values()];
}

const BOARD: Record<string, string> = {
  get national() {
    return tx('National');
  },
  cambridge: 'Cambridge',
  edexcel: 'Pearson Edexcel',
  get other() {
    return tx('Other');
  },
};

export function contactHours(p: Project): ReportTable {
  const weeks = p.institute.teachingWeeks;
  const rows = teachingGroups(p, activeEntries(p))
    .map((t) => {
      const s = p.subjects.find((x) => x.id === t.subjectId);
      const year = weeks ? hours(t.minutes * weeks) : null;
      const course = year !== null && s ? Math.round(year * s.courseYears * 10) / 10 : null;
      const glh = s?.glh ?? null;
      const target = s?.targetMinutes ?? null;
      const short = [
        target && t.minutes < target ? tx('{n} min/week under target', { n: target - t.minutes }) : '',
        glh && course !== null && course < glh ? tx('{n} h short of GLH', { n: Math.round((glh - course) * 10) / 10 }) : '',
      ].filter(Boolean);
      return {
        board: BOARD[s?.board ?? 'other'] ?? '',
        level: s?.level ?? '',
        subject: s?.name ?? '',
        code: s?.syllabusCode ?? '',
        group: t.group,
        perWeek: t.minutes,
        target: target ?? '',
        perYear: year ?? '',
        course: course ?? '',
        glh: glh ?? '',
        status: short.join('; ') || (glh || target ? tx('Meets') : ''),
      };
    })
    .sort(
      (a, b) =>
        a.board.localeCompare(b.board) ||
        a.level.localeCompare(b.level) ||
        a.subject.localeCompare(b.subject) ||
        a.group.localeCompare(b.group, undefined, { numeric: true }),
    );
  return {
    id: 'contact-hours',
    title: tx('Contact hours vs guided learning hours'),
    note: weeks
      ? tx('Timetabled minutes a week × {weeks} teaching weeks, over the course\'s years, against the board\'s guided learning hours.', { weeks })
      : tx('Set the teaching weeks in the school details to turn weekly minutes into hours a year.'),
    columns: [
      { key: 'board', label: tx('Board') },
      { key: 'level', label: tx('Level') },
      { key: 'subject', label: tx('Subject') },
      { key: 'code', label: tx('Syllabus') },
      { key: 'group', label: tx('Group') },
      { key: 'perWeek', label: tx('Min / week'), numeric: true },
      { key: 'target', label: tx('Target min'), numeric: true },
      { key: 'perYear', label: tx('Hours / year'), numeric: true },
      { key: 'course', label: tx('Course hours'), numeric: true },
      { key: 'glh', label: tx('GLH'), numeric: true },
      { key: 'status', label: tx('Status') },
    ],
    rows,
  };
}

// ------------------------------------------------ contract hours

export function contractHours(p: Project): ReportTable {
  const entries = activeEntries(p);
  const rows = p.teachers
    .filter((t) => t.active && t.contractMinutes)
    .map((t) => {
      const teaching = entries.filter((e) => e.teacherIds.includes(t.id)).reduce((s, e) => s + minutes(e), 0);
      let duty = 0;
      for (const r of p.dutyRosters)
        for (const a of r.assignments) {
          if (a.teacherId !== t.id) continue;
          const s = r.sessions.find((x) => x.id === a.sessionId);
          if (s) duty += s.end - s.start;
        }
      const cca = p.ccas
        .filter((c) => c.teacherIds.includes(t.id) && c.start !== null && c.end !== null)
        .reduce((s, c) => s + (c.end! - c.start!), 0);
      const total = teaching + duty + cca;
      const contract = t.contractMinutes!;
      return {
        name: t.name,
        category: t.category,
        teaching: hours(teaching),
        duties: hours(duty),
        cca: hours(cca),
        total: hours(total),
        contract: hours(contract),
        balance: hours(contract - total),
        status: total > contract ? tx('Over contract') : tx('Within contract'),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    id: 'contract-hours',
    title: tx('Contract hours compliance'),
    note: tx('Hours a week for staff with contracted hours (expatriate contracts): teaching, duty rosters and co-curricular activities against the hours in the contract.'),
    columns: [
      { key: 'name', label: tx('Teacher') },
      { key: 'teaching', label: tx('Teaching h'), numeric: true },
      { key: 'duties', label: tx('Duties h'), numeric: true },
      { key: 'cca', label: tx('CCA h'), numeric: true },
      { key: 'total', label: tx('Total h'), numeric: true },
      { key: 'contract', label: tx('Contract h'), numeric: true },
      { key: 'balance', label: tx('Balance h'), numeric: true },
      { key: 'status', label: tx('Status') },
    ],
    rows,
  };
}

// ------------------------------------------- visiting specialists

/**
 * Hours a visiting teacher can claim between two dates: their timetabled
 * lessons on each school day, less days and periods they were absent. Holidays
 * and days when their classes are away (exams, trips) are not claimed.
 */
export function visitingClaims(p: Project, from: string, to: string): ReportTable {
  const visiting = p.teachers.filter((t) => t.active && (t.category === 'visiting' || t.hourlyRate !== null));
  const tally = new Map(visiting.map((t) => [t.id, { days: 0, minutes: 0, lessons: 0, missed: 0 }]));
  if (from <= to && visiting.length)
    for (let date = from, n = 0; date <= to && n < 400; date = addDays(date, 1), n++) {
      const ctx = dayContext(p, date);
      if (ctx.closed) continue;
      for (const t of visiting) {
        const mine = ctx.entries.filter((e) => e.teacherIds.includes(t.id));
        if (!mine.length) continue;
        const away = ctx.absent.get(t.id);
        const x = tally.get(t.id)!;
        let taught = false;
        for (const e of mine) {
          const absent = away && (away.wholeDay || away.intervals.some((i) => i.start < e.end && e.start < i.end));
          if (absent) x.missed++;
          else ((x.minutes += minutes(e)), x.lessons++, (taught = true));
        }
        if (taught) x.days++;
      }
    }
  const rows = visiting.map((t) => {
    const x = tally.get(t.id)!;
    const h = hours(x.minutes);
    return {
      name: t.name,
      host: t.hostSchool,
      days: x.days,
      lessons: x.lessons,
      missed: x.missed,
      hours: h,
      rate: t.hourlyRate ?? '',
      amount: t.hourlyRate !== null ? Math.round(h * t.hourlyRate * 100) / 100 : '',
    };
  });
  const sum = (k: 'hours' | 'amount') => Math.round(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) * 100) / 100;
  return {
    id: 'visiting-claims',
    title: tx('Visiting specialists — hours claimed'),
    note: tx('{from} to {to}: timetabled lessons on school days, less absences. Holidays and days the classes are away are not counted.', { from, to }),
    columns: [
      { key: 'name', label: tx('Teacher') },
      { key: 'host', label: tx('Also works at') },
      { key: 'days', label: tx('Days'), numeric: true },
      { key: 'lessons', label: tx('Lessons'), numeric: true },
      { key: 'missed', label: tx('Missed'), numeric: true },
      { key: 'hours', label: tx('Hours'), numeric: true },
      { key: 'rate', label: tx('Rate / h'), numeric: true },
      { key: 'amount', label: tx('Amount'), numeric: true },
    ],
    rows,
    totals: rows.length ? { name: tx('Total'), hours: sum('hours'), amount: sum('amount') } : undefined,
  };
}

// ------------------------------------------------- houses and CCAs

const yearOf = (p: Project, classId: string) => {
  const c = p.classes.find((x) => x.id === classId);
  return p.grades.find((g) => g.id === c?.gradeId) ?? null;
};

export function houseSummary(p: Project): ReportTable {
  const grades = [...p.grades].sort((a, b) => a.level - b.level).filter((g) => p.students.some((s) => yearOf(p, s.classId)?.id === g.id));
  const noHouse = tx('No house');
  const rows = [...p.houses, { id: '', name: noHouse, colour: '' }]
    .map((h) => {
      const mine = p.students.filter((s) => s.active && (s.houseId ?? '') === h.id);
      const row: Record<string, string | number> = { house: h.name, total: mine.length };
      for (const g of grades) row[g.id] = mine.filter((s) => yearOf(p, s.classId)?.id === g.id).length;
      row.ccas = p.ccas.filter((c) => c.houseId === h.id).length || '';
      return row;
    })
    .filter((r) => r.house !== noHouse || Number(r.total) > 0);
  const totals: Record<string, string | number> = { house: tx('Total'), total: rows.reduce((s, r) => s + Number(r.total), 0) };
  for (const g of grades) totals[g.id] = rows.reduce((s, r) => s + Number(r[g.id] ?? 0), 0);
  return {
    id: 'houses',
    title: tx('Houses'),
    note: tx('Students in each house by year group, to keep the houses balanced.'),
    columns: [
      { key: 'house', label: tx('House') },
      ...grades.map((g) => ({ key: g.id, label: g.name, numeric: true })),
      { key: 'total', label: tx('Total'), numeric: true },
    ],
    rows,
    totals,
  };
}

/** Members of one house, sorted by year and name. */
export function houseList(p: Project, houseId: string): ReportTable {
  const house = p.houses.find((h) => h.id === houseId);
  const rows = p.students
    .filter((s) => s.active && s.houseId === houseId)
    .map((s) => ({
      name: s.name,
      admission: s.admissionNo,
      form: p.classes.find((c) => c.id === s.classId)?.name ?? '',
      level: yearOf(p, s.classId)?.level ?? 0,
    }))
    .sort((a, b) => a.level - b.level || a.form.localeCompare(b.form, undefined, { numeric: true }) || a.name.localeCompare(b.name));
  return {
    id: `house-${house?.name ?? houseId}`.toLowerCase().replace(/[^\w-]+/g, '-'),
    title: tx('{x} House', { x: house?.name ?? tx('House') }),
    columns: [
      { key: 'name', label: tx('Student') },
      { key: 'admission', label: tx('Adm. no') },
      { key: 'form', label: tx('Form') },
    ],
    rows,
  };
}

const clock = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

export function ccaSummary(p: Project): ReportTable {
  return {
    id: 'ccas',
    title: tx('Co-curricular activities'),
    columns: [
      { key: 'name', label: tx('Activity') },
      { key: 'when', label: tx('When') },
      { key: 'place', label: tx('Where') },
      { key: 'staff', label: tx('Staff') },
      { key: 'students', label: tx('Students'), numeric: true },
    ],
    rows: p.ccas.map((c) => ({
      name: c.name,
      when: [c.day ? dayLong(c.day) : '', c.start !== null ? `${clock(c.start)}–${clock(c.end)}` : ''].filter(Boolean).join(' '),
      place: c.place,
      staff: c.teacherIds.map((id) => p.teachers.find((t) => t.id === id)?.name ?? '').join(', '),
      students: c.studentIds.length,
    })),
  };
}

/** The roster of one activity: its students with form and house. */
export function ccaRoster(p: Project, ccaId: string): ReportTable {
  const c = p.ccas.find((x) => x.id === ccaId);
  const rows = (c?.studentIds ?? [])
    .map((id) => p.students.find((s) => s.id === id))
    .filter((s) => !!s)
    .map((s) => ({
      name: s.name,
      form: p.classes.find((x) => x.id === s.classId)?.name ?? '',
      house: p.houses.find((h) => h.id === s.houseId)?.name ?? '',
    }))
    .sort((a, b) => a.form.localeCompare(b.form, undefined, { numeric: true }) || a.name.localeCompare(b.name));
  return {
    id: `cca-${c?.name ?? ccaId}`.toLowerCase().replace(/[^\w-]+/g, '-'),
    title: c?.name ?? tx('Activity'),
    note: c ? [c.day ? dayLong(c.day) : '', c.start !== null ? `${clock(c.start)}–${clock(c.end)}` : '', c.place].filter(Boolean).join(' · ') : '',
    columns: [
      { key: 'name', label: tx('Student') },
      { key: 'form', label: tx('Form') },
      { key: 'house', label: tx('House') },
    ],
    rows,
  };
}

// ------------------------------------------------------------- set lists

/** Every set in the option blocks with its teacher, room and size. */
export function setSummary(p: Project): ReportTable {
  const rows = p.optionBlocks.flatMap((b) =>
    b.lines.flatMap((l) =>
      l.sets.map((s) => {
        const g = p.studentGroups.find((x) => x.id === s.groupId);
        return {
          block: b.name,
          line: l.label,
          set: g?.name ?? '',
          subject: p.subjects.find((x) => x.id === s.subjectId)?.name ?? '',
          teacher: s.teacherIds.map((id) => p.teachers.find((t) => t.id === id)?.name ?? '').join(', '),
          room: p.rooms.find((r) => r.id === s.roomId)?.name ?? '',
          students: g?.studentIds.length || g?.studentCount || 0,
        };
      }),
    ),
  );
  return {
    id: 'sets',
    title: tx('Teaching sets'),
    columns: [
      { key: 'block', label: tx('Block') },
      { key: 'line', label: tx('Line') },
      { key: 'set', label: tx('Set') },
      { key: 'subject', label: tx('Subject') },
      { key: 'teacher', label: tx('Teacher') },
      { key: 'room', label: tx('Room') },
      { key: 'students', label: tx('Students'), numeric: true },
    ],
    rows,
  };
}
