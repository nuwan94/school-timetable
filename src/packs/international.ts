import { produce, type Draft } from 'immer';
import { applyBlockPlan, planBlock } from '@/domain/blockBuilder';
import { newId } from '@/domain/common';
import { House, Student } from '@/domain/entities';
import { makeAllocation, makeRoom, makeSubject, makeTeacher, patternFrom } from '@/domain/factories';
import { quickAddClasses, setCellAllocation } from '@/domain/mutations';
import type { Project } from '@/domain/project';
import type { Weekday } from '@/domain/time';
import { mulberry32 } from '@/solver/rng';
import { createProject } from './index';

/**
 * Example international school (PLAN.md §13 P7): Years 7–13 on a 35-period
 * week. Years 7–9 are taught in forms; IGCSE options in Years 10–11 and
 * A Level in a sixth form taught across Years 12–13 are option blocks built
 * from the students' own choices. Names and figures are illustrative.
 */

type SubjectSpec = [code: string, name: string, extra?: Partial<Parameters<typeof makeSubject>[0]>];

const KS3: [code: string, periods: number, doubles: number][] = [
  ['ENG', 5, 0],
  ['MAT', 5, 0],
  ['SCI', 5, 1],
  ['HIS', 2, 0],
  ['GEO', 2, 0],
  ['ICT', 2, 0],
  ['FRE', 3, 0],
  ['ART', 2, 0],
  ['MUS', 2, 0],
  ['PE', 3, 1],
  ['PSH', 1, 0],
  ['SIN', 3, 0],
];

/** IGCSE core (class lessons) beside four option lines of five periods: 15 + 20 = 35. */
const IG_CORE: [code: string, periods: number, doubles: number][] = [
  ['ENG', 5, 0],
  ['MAT', 5, 0],
  ['PE', 2, 1],
  ['PSH', 1, 0],
  ['SIN', 2, 0],
];
/** Options as students meet them on the form: pick one from each column. */
const IG_COLUMNS = [
  ['IPHY', 'IBUS', 'IHIS'],
  ['ICHE', 'IECO', 'IART'],
  ['IBIO', 'IACC', 'IGEO'],
  ['ICS', 'IICT', 'IFRE'],
];
const IG_PERIODS = 5;

/** Sixth form: four A Level lines of eight periods, plus PE and tutorial taken by Years 12 and 13 together. */
const AL_CORE: [code: string, periods: number, doubles: number][] = [
  ['PE', 1, 0],
  ['PSH', 2, 0],
];
const AL_COLUMNS = [
  ['AMAT', 'APSY', 'AART'],
  ['APHY', 'AECO', 'AENG'],
  ['ACHE', 'ABUS'],
  ['ABIO', 'ACS', 'AFMA'],
];
const AL_PERIODS = 8;

const SUBJECTS: SubjectSpec[] = [
  ['ENG', 'English', { priority: 'core' }],
  ['MAT', 'Mathematics', { priority: 'core' }],
  ['SCI', 'Science', { priority: 'core' }],
  ['HIS', 'History'],
  ['GEO', 'Geography'],
  ['ICT', 'Computing'],
  ['FRE', 'French'],
  ['ART', 'Art and Design'],
  ['MUS', 'Music', { kind: 'activity' }],
  ['PE', 'Physical Education', { kind: 'activity', priority: 'low' }],
  ['PSH', 'Tutorial and PSHE', { priority: 'low' }],
  ['SIN', 'Sinhala'],
  ...(
    [
      ['IPHY', 'Physics', '0625'],
      ['ICHE', 'Chemistry', '0620'],
      ['IBIO', 'Biology', '0610'],
      ['IBUS', 'Business Studies', '0450'],
      ['IECO', 'Economics', '0455'],
      ['IACC', 'Accounting', '0452'],
      ['IHIS', 'History', '0470'],
      ['IGEO', 'Geography', '0460'],
      ['IART', 'Art and Design', '0400'],
      ['ICS', 'Computer Science', '0478'],
      ['IICT', 'ICT', '0417'],
      ['IFRE', 'French', '0520'],
    ] as const
  ).map(([code, name, syl]): SubjectSpec => [
    code,
    `IGCSE ${name}`,
    { board: 'cambridge', level: 'IGCSE', syllabusCode: syl, glh: 130, courseYears: 2, targetMinutes: 250 },
  ]),
  ...(
    [
      ['AMAT', 'Mathematics', '9709'],
      ['AFMA', 'Further Mathematics', '9231'],
      ['APHY', 'Physics', '9702'],
      ['ACHE', 'Chemistry', '9701'],
      ['ABIO', 'Biology', '9700'],
      ['AECO', 'Economics', '9708'],
      ['ABUS', 'Business', '9609'],
      ['APSY', 'Psychology', '9990'],
      ['ACS', 'Computer Science', '9618'],
      ['AART', 'Art and Design', '9479'],
      ['AENG', 'English Literature', '9695'],
    ] as const
  ).map(([code, name, syl]): SubjectSpec => [
    code,
    `A Level ${name}`,
    { board: 'cambridge', level: 'A Level', syllabusCode: syl, glh: 360, courseYears: 2, targetMinutes: 400 },
  ]),
];

/** Department that teaches each code: IGCSE and A Level Physics go to the Physics teachers, and so on. */
const DEPT: Record<string, string> = {
  SCI: 'SCI',
  IPHY: 'PHY',
  APHY: 'PHY',
  ICHE: 'CHE',
  ACHE: 'CHE',
  IBIO: 'BIO',
  ABIO: 'BIO',
  IBUS: 'BUS',
  ABUS: 'BUS',
  IECO: 'BUS',
  AECO: 'BUS',
  IACC: 'BUS',
  IHIS: 'HIS',
  IGEO: 'GEO',
  IART: 'ART',
  AART: 'ART',
  ICS: 'ICT',
  IICT: 'ICT',
  ACS: 'ICT',
  IFRE: 'FRE',
  AMAT: 'MAT',
  AFMA: 'MAT',
  APSY: 'PSY',
  AENG: 'ENG',
};
const dept = (code: string) => DEPT[code] ?? code;

const FIRST = [
  'Amaya',
  'Kavin',
  'Nethmi',
  'Dinuk',
  'Sanduni',
  'Ravin',
  'Tharushi',
  'Yohan',
  'Ishara',
  'Methum',
  'Hiruni',
  'Senuk',
  'Anya',
  'Leo',
  'Maya',
  'Arjun',
  'Zara',
  'Omar',
  'Priya',
  'Lucas',
  'Nadia',
  'Kai',
  'Sofia',
  'Rehan',
  'Elena',
  'Tariq',
  'Mihiri',
  'Chen',
  'Isla',
  'Dev',
];
const LAST = [
  'Perera',
  'Fernando',
  'Silva',
  'Jayasinghe',
  'Wickramasinghe',
  'Rajapaksa',
  'Gunawardena',
  'Bandara',
  'Mendis',
  'de Alwis',
  'Hussain',
  'Kumar',
  'Smith',
  'Wong',
  'Nair',
  'Abeysekera',
  'Cooray',
  'Ratnayake',
  'Herath',
  'Dias',
];
const STAFF = [
  ['Ms', 'Hannah', 'Clarke', 'GB'],
  ['Mr', 'Daniel', 'Hughes', 'GB'],
  ['Ms', 'Shirani', 'Perera', ''],
  ['Mr', 'Ruwan', 'Jayawardena', ''],
  ['Ms', 'Aisha', 'Rahman', ''],
  ['Mr', 'Thomas', 'Reid', 'AU'],
  ['Ms', 'Nilmini', 'Fonseka', ''],
  ['Mr', 'Pradeep', 'Kumar', 'IN'],
  ['Ms', 'Claire', 'Dubois', 'FR'],
  ['Mr', 'Chaminda', 'Silva', ''],
  ['Ms', 'Dilini', 'Gamage', ''],
  ['Mr', 'James', 'Walker', 'GB'],
  ['Ms', 'Ishani', 'Wijeratne', ''],
  ['Mr', 'Kasun', 'Herath', ''],
  ['Ms', 'Rachel', 'Moore', 'NZ'],
  ['Mr', 'Suresh', 'Nadarajah', ''],
  ['Ms', 'Fathima', 'Niyas', ''],
  ['Mr', 'Mark', 'Thompson', 'GB'],
  ['Ms', 'Tharindi', 'Abeywardena', ''],
  ['Mr', 'Nuwan', 'Rodrigo', ''],
  ['Ms', 'Sarah', 'Bennett', 'GB'],
  ['Mr', 'Imran', 'Sheriff', ''],
  ['Ms', 'Lakmini', 'Senanayake', ''],
  ['Mr', 'Peter', 'Collins', 'IE'],
  ['Ms', 'Anoma', 'Karunaratne', ''],
  ['Mr', 'Vikram', 'Iyer', 'IN'],
  ['Ms', 'Chathuri', 'Liyanage', ''],
  ['Mr', 'Samuel', 'Ochieng', 'KE'],
  ['Ms', 'Ruvini', 'Samarasinghe', ''],
  ['Mr', 'Dinesh', 'Weerasinghe', ''],
] as const;

const HOUSES: [string, string][] = [
  ['Kandy', '#dc2626'],
  ['Galle', '#2563eb'],
  ['Jaffna', '#16a34a'],
  ['Trinco', '#ca8a04'],
];

const MAX_LOAD = 27;
/** Expatriate contracts cap contact time plus duties and activities (preparation time is on top). */
const CONTRACT_MINUTES = 25 * 60;

class IntlBuilder {
  private pool = new Map<string, { id: string; load: number }[]>();
  private n = 0;
  private spares = 0;
  readonly rnd = mulberry32(2027);
  constructor(readonly d: Draft<Project>) {}

  subject(code: string): string {
    const s = this.d.subjects.find((x) => x.shortCode === code);
    if (!s) throw new Error(`No subject ${code}`);
    return s.id;
  }

  private hire(department: string): string {
    const [title, first, last, from] = STAFF[this.n % STAFF.length]!;
    const round = Math.floor(this.n / STAFF.length);
    this.n++;
    const expat = from !== '';
    const t = makeTeacher({
      title,
      name: `${first} ${last}${round ? ` ${round + 1}` : ''}`,
      shortCode: `${first[0]}${last.slice(0, 2)}${round ? round + 1 : ''}`.toUpperCase(),
      department,
      subjectIds: this.d.subjects.filter((s) => dept(s.shortCode) === department).map((s) => s.id),
      media: ['en'],
      category: expat ? 'contract' : 'permanent',
      contractMinutes: expat ? CONTRACT_MINUTES : null,
    });
    this.d.teachers.push(t);
    return t.id;
  }

  /** A teacher in the department with room for `periods` more, avoiding `busy` (teachers already in the same line). */
  teacherFor(code: string, periods: number, busy: Set<string> = new Set()): string {
    const department = dept(code);
    const list = this.pool.get(department) ?? [];
    this.pool.set(department, list);
    let t = list.find((x) => x.load + periods <= MAX_LOAD && !busy.has(x.id));
    if (!t) {
      t = { id: this.hire(department), load: 0 };
      list.push(t);
    }
    t.load += periods;
    return t.id;
  }

  forms(level: number, letters: string[]): string[] {
    const before = new Set(this.d.classes.map((c) => c.id));
    quickAddClasses(this.d, { sectionId: this.d.sections[0]!.id, fromLevel: level, toLevel: level, letters, medium: 'en' });
    return this.d.classes.filter((c) => !before.has(c.id)).map((c) => c.id);
  }

  lessons(classIds: string[], rows: [string, number, number][]) {
    for (const id of classIds)
      for (const [code, periods, doubles] of rows)
        setCellAllocation(this.d, id, this.subject(code), { pattern: patternFrom(periods, doubles), teacherId: this.teacherFor(code, periods) });
  }

  /** Lessons the listed forms take together, with one teacher. */
  together(classIds: string[], rows: [string, number, number][]) {
    for (const [code, periods, doubles] of rows) {
      const a = makeAllocation({ subjectId: this.subject(code), groupIds: classIds, periods, teacherIds: [this.teacherFor(code, periods)] });
      a.pattern = patternFrom(periods, doubles);
      this.d.allocations.push(a);
    }
  }

  students(classId: string, n: number, columns?: string[][], skip = 0) {
    const c = this.d.classes.find((x) => x.id === classId)!;
    for (let i = 0; i < n; i++) {
      const k = this.d.students.length;
      const choices = (columns ?? [])
        .filter((_, col) => !(skip && (k + col) % 4 === 0 && col === columns!.length - 1))
        .map((col) => col[Math.floor(this.rnd() * col.length)]!);
      this.d.students.push(
        Student.parse({
          id: newId('stu'),
          name: `${FIRST[(k * 7) % FIRST.length]} ${LAST[(k * 3 + Math.floor(k / 20)) % LAST.length]}`,
          admissionNo: String(2400 + k),
          classId,
          houseId: this.d.houses[k % this.d.houses.length]!.id,
          choices: choices.map((code) => ({ subjectId: this.subject(code), from: null, to: null })),
        }),
      );
    }
    c.studentCount = this.d.students.filter((s) => s.classId === classId).length;
  }

  /** Builds an option block from the students' choices and staffs each set. */
  block(name: string, classIds: string[], columns: string[][], periods: number, doubles: number, maxSetSize: number) {
    const subjectIds = columns.flat().map((c) => this.subject(c));
    const plan = planBlock(this.d as Project, { classIds, subjectIds, maxSetSize, lines: columns.length });
    const blockId = applyBlockPlan(this.d, plan, { name, classIds, periods, doubles });
    const b = this.d.optionBlocks.find((x) => x.id === blockId)!;
    const general = this.d.rooms.filter((r) => !r.roomTypeId && r.concurrent === 1);
    const spare = general[general.length - 1 - this.spares++]?.id ?? null; // from the top: form rooms fill from the bottom
    for (const line of b.lines) {
      const busy = new Set<string>();
      // Each set in a line needs its own room: each science its own lab, then the block's own form rooms (their students are
      // out in sets) and one spare room.
      const labs = this.d.rooms.filter((r) => r.roomTypeId);
      const home: Record<string, number> = { PHY: 0, CHE: 1, BIO: 2 };
      const rooms = [...classIds.map((id) => this.d.classes.find((c) => c.id === id)!.homeRoomId), spare].flatMap((id) =>
        this.d.rooms.filter((r) => r.id === id),
      );
      for (const s of line.sets) {
        const subject = this.d.subjects.find((x) => x.id === s.subjectId)!;
        const t = this.teacherFor(subject.shortCode, periods, busy);
        busy.add(t);
        s.teacherIds = [t];
        const own = labs.find((r) => r === this.d.rooms.filter((x) => x.roomTypeId)[home[dept(subject.shortCode)] ?? -1]);
        const lab = subject.roomTypeId ? (own ?? labs[0]) : undefined;
        if (lab) labs.splice(labs.indexOf(lab), 1);
        s.roomId = lab?.id ?? rooms.shift()?.id ?? null;
      }
    }
    return plan;
  }
}

export function internationalSchool(): Project {
  return produce(createProject('international', 'Lakeside International School'), (d) => {
    d.institute.academicYear = '2027–28';
    d.institute.term = 'Term 1';
    d.institute.teachingWeeks = 36;
    for (const [code, name, extra] of SUBJECTS) d.subjects.push(makeSubject({ name, shortCode: code, ...extra }));
    for (const [name, colour] of HOUSES) d.houses.push(House.parse({ id: newId('house'), name, colour }));
    const lab = { id: newId('rtp'), name: 'Science lab', shortCode: '', local: {}, active: true };
    d.roomTypes.push(lab);
    for (const n of ['Lab 1', 'Lab 2', 'Lab 3']) d.rooms.push(makeRoom({ name: n, roomTypeId: lab.id, seats: 24 }));
    for (let i = 1; i <= 16; i++) d.rooms.push(makeRoom({ name: `Room ${100 + i}`, seats: 26 }));
    d.rooms.push(makeRoom({ name: 'Sports hall', seats: 60, concurrent: 2 }));

    // Science lessons need a lab; forms have a room of their own.
    for (const s of d.subjects) if (['SCI', 'IPHY', 'ICHE', 'IBIO', 'APHY', 'ACHE', 'ABIO'].includes(s.shortCode)) s.roomTypeId = lab.id;
    const b = new IntlBuilder(d);
    const general = d.rooms.filter((r) => !r.roomTypeId && r.concurrent === 1);
    const homeRooms = () => d.classes.forEach((c, i) => (c.homeRoomId = general[i]?.id ?? null));
    for (const level of [7, 8, 9]) {
      const forms = b.forms(level, ['A', 'B']);
      b.lessons(forms, KS3);
      for (const f of forms) b.students(f, 22);
    }
    for (const level of [10, 11]) {
      const forms = b.forms(level, ['A', 'B']);
      b.lessons(forms, IG_CORE);
      for (const f of forms) b.students(f, 20, IG_COLUMNS);
      homeRooms();
      b.block(`Year ${level} IGCSE options`, forms, IG_COLUMNS, IG_PERIODS, 1, 22);
    }
    const sixth = [...b.forms(12, ['A']), ...b.forms(13, ['A'])];
    homeRooms();
    b.together(sixth, AL_CORE);
    for (const f of sixth) b.students(f, 16, AL_COLUMNS, 1);
    b.block('Sixth form A Levels (Years 12–13)', sixth, AL_COLUMNS, AL_PERIODS, 2, 20);

    // A visiting music specialist, paid by the hour, on Tuesdays and Thursdays.
    const music = d.subjects.find((s) => s.shortCode === 'MUS')!.id;
    const visiting = makeTeacher({
      title: 'Mr',
      name: 'Anton Fernando',
      shortCode: 'AFE',
      department: 'MUS',
      subjectIds: [music],
      media: ['en'],
      category: 'visiting',
      contractedDays: ['tue', 'thu'] as Weekday[],
      hostSchool: 'Colombo Conservatoire',
      hourlyRate: 4500,
    });
    d.teachers.push(visiting);
    for (const a of d.allocations) if (a.subjectId === music) a.teacherIds = [visiting.id];
    d.teachers = d.teachers.filter((t) => t.id === visiting.id || t.department !== 'MUS' || d.allocations.some((a) => a.teacherIds.includes(t.id)));

    // Form tutors: the teacher with most lessons in the form.
    const taken = new Set<string>();
    for (const c of d.classes) {
      const load = new Map<string, number>();
      for (const a of d.allocations)
        if (a.groupIds.includes(c.id))
          for (const t of a.teacherIds) load.set(t, (load.get(t) ?? 0) + a.pattern.reduce((s, x) => s + x.length * x.count, 0));
      const best = [...load].filter(([t]) => !taken.has(t) && t !== visiting.id).sort((x, y) => y[1] - x[1])[0]?.[0];
      if (best) ((c.classTeacherId = best), taken.add(best));
    }

    // Co-curricular activities after school, by house and by interest.
    const tid = (i: number) => d.teachers[i % d.teachers.length]!.id;
    const pick = (every: number, offset: number) => d.students.filter((_, i) => i % every === offset).map((s) => s.id);
    const cca = (name: string, day: Weekday, place: string, teacher: number, students: string[], houseId: string | null = null) =>
      d.ccas.push({
        id: newId('cca'),
        name,
        day,
        start: 14 * 60 + 30,
        end: 15 * 60 + 30,
        place,
        houseId,
        teacherIds: [tid(teacher)],
        studentIds: students,
      });
    cca('Debating', 'mon', 'Room 104', 0, pick(9, 1));
    cca('Robotics', 'tue', 'Lab 3', 5, pick(11, 2));
    cca('Choir', 'wed', 'Room 112', 9, pick(8, 3));
    cca('Cricket', 'thu', 'Sports hall', 3, pick(7, 4));
    cca('Model United Nations', 'fri', 'Room 101', 11, pick(12, 5));
    d.houses.forEach((h, i) =>
      cca(
        `${h.name} House meeting`,
        'fri',
        'Sports hall',
        13 + i,
        d.students.filter((s) => s.houseId === h.id).map((s) => s.id),
        h.id,
      ),
    );
  });
}
