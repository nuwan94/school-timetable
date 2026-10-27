import { produce, type Draft } from 'immer';
import { addBlock, addLine, addSet } from '@/domain/blocks';
import { SL_SUBJECTS } from '@/domain/catalog';
import type { Medium, Pack } from '@/domain/common';
import { makeSection, makeSubject, makeTeacher, patternFrom } from '@/domain/factories';
import { quickAddClasses, setCellAllocation } from '@/domain/mutations';
import type { Project } from '@/domain/project';
import type { Weekday } from '@/domain/time';
import { createProject } from './index';
import { finishExample } from './finish';
import { AESTHETIC_PERIODS, AESTHETICS, CORE, INITIALS, RELIGION_PERIODS, RELIGIONS, sampleSchool, SURNAMES } from './sample';

/**
 * Example schools for the start wizard (PLAN.md §13 P6): a small primary
 * school (Simple pack) and Sri Lankan Type 2, 1C and 1AB schools. Each one
 * generates without clashes and fills in the returns with realistic data.
 * Figures are illustrative, not official allocations.
 */

export interface Example {
  id: string;
  name: string;
  summary: string;
  build: () => Project;
}

/** Subjects that are not in the starter catalog: code → name, Sinhala, Tamil. */
const EXTRA: Record<string, [string, string, string]> = {
  ENV: ['Environment Related Activities', 'පරිසරය ඇසුරු ක්‍රියාකාරකම්', 'சுற்றாடல் சார்ந்த செயற்பாடுகள்'],
  GEN: ['General English', 'සාමාන්‍ය ඉංග්‍රීසි', 'பொது ஆங்கிலம்'],
  GIT: ['General Information Technology', 'සාමාන්‍ය තොරතුරු තාක්ෂණය', 'பொதுத் தகவல் தொழில்நுட்பம்'],
  ACC: ['Accounting', 'ගිණුම්කරණය', 'கணக்கீடு'],
  BST: ['Business Studies', 'ව්‍යාපාර අධ්‍යයනය', 'வணிகக் கல்வி'],
  ECO: ['Economics', 'ආර්ථික විද්‍යාව', 'பொருளியல்'],
  BIO: ['Biology', 'ජීව විද්‍යාව', 'உயிரியல்'],
  CHE: ['Chemistry', 'රසායන විද්‍යාව', 'இரசாயனவியல்'],
  PHY: ['Physics', 'භෞතික විද්‍යාව', 'பௌதிகவியல்'],
  CMT: ['Combined Mathematics', 'සංයුක්ත ගණිතය', 'இணைந்த கணிதம்'],
  POL: ['Political Science', 'දේශපාලන විද්‍යාව', 'அரசியல் விஞ்ஞானம்'],
  BCV: ['Buddhist Civilisation', 'බෞද්ධ ශිෂ්ටාචාරය', 'பௌத்த நாகரிகம்'],
  SLT: ['Sinhala Literature', 'සිංහල සාහිත්‍යය', 'சிங்கள இலக்கியம்'],
};

type Row = readonly [code: string, periods: number, doubles: number];

/** Grade 1–5: the class teacher takes the first four, subject teachers the rest (40 periods). */
const PRIMARY: Row[] = [
  ['SIN', 9, 4],
  ['MAT', 9, 4],
  ['ENV', 7, 2],
  ['BUD', 3, 0],
  ['ENG', 5, 0],
  ['ART', 3, 0],
  ['HPE', 2, 0],
  ['TAM', 2, 0],
];
const CLASS_TEACHER_CODES = new Set(['SIN', 'MAT', 'ENV', 'BUD']);

/** A/L: three subjects × 11 periods, General English 4, GIT 3 = 40. */
const AL_COMMON: Row[] = [
  ['GEN', 4, 0],
  ['GIT', 3, 0],
];
const AL_STREAMS: Record<string, { core: string[]; options?: string[][] }> = {
  Bio: { core: ['BIO', 'CHE', 'PHY'] },
  Maths: { core: ['CMT', 'CHE', 'PHY'] },
  Com: { core: ['ACC', 'BST', 'ECO'] },
  Arts: {
    core: [],
    options: [
      ['SLT', 'GEO'],
      ['POL', 'HIS'],
      ['BCV', 'ECO'],
    ],
  },
};
const AL_PERIODS = 11;
const AL_DOUBLES = 3;

class Builder {
  private pool = new Map<string, { id: string; load: number }>();
  private n = 0;
  constructor(
    readonly d: Draft<Project>,
    private maxLoad: number,
    private medium: Medium,
  ) {}

  subject(code: string): string {
    const found = this.d.subjects.find((s) => s.shortCode === code);
    if (found) return found.id;
    const cat = SL_SUBJECTS.find((x) => x.code === code);
    const extra = EXTRA[code];
    const s = makeSubject({
      name: cat?.name ?? extra?.[0] ?? code,
      shortCode: code,
      priority: cat?.priority ?? 'normal',
      ...(cat?.kind ? { kind: cat.kind } : {}),
    });
    s.local = cat ? { si: cat.si, ta: cat.ta } : extra ? { si: extra[1], ta: extra[2] } : {};
    this.d.subjects.push(s);
    return s.id;
  }

  newTeacher(code: string, extra: Partial<Parameters<typeof makeTeacher>[0]> = {}): string {
    const surname = SURNAMES[this.n % SURNAMES.length]!;
    const round = Math.floor(this.n / SURNAMES.length);
    this.n++;
    const t = makeTeacher({
      name: `${INITIALS[this.n % INITIALS.length]}. ${surname}${round ? ` ${round + 1}` : ''}`,
      shortCode: `${surname.slice(0, 3).toUpperCase()}${round ? round + 1 : ''}`,
      subjectIds: [this.subject(code)],
      media: [this.medium],
      ...extra,
    });
    this.d.teachers.push(t);
    return t.id;
  }

  /** The current teacher for this subject, or a new one once they would pass `maxLoad`. */
  teacherFor(code: string, periods: number, extra: Partial<Parameters<typeof makeTeacher>[0]> = {}): string {
    let t = this.pool.get(code);
    if (!t || t.load + periods > this.maxLoad) {
      t = { id: this.newTeacher(code, extra), load: 0 };
      this.pool.set(code, t);
    }
    t.load += periods;
    return t.id;
  }

  section(name: string): string {
    const bell = this.d.bellSchedules[0]!.id;
    const existing = this.d.sections.find((s) => s.name === name);
    if (existing) return existing.id;
    const s = makeSection({ name, bellScheduleId: bell, order: this.d.sections.length });
    this.d.sections.push(s);
    return s.id;
  }

  classes(sectionId: string, from: number, to: number, letters: string[]): string[] {
    const before = new Set(this.d.classes.map((c) => c.id));
    quickAddClasses(this.d, { sectionId, fromLevel: from, toLevel: to, letters, medium: this.medium });
    const made = this.d.classes.filter((c) => !before.has(c.id));
    made.forEach((c) => (c.studentCount = from <= 5 ? 30 : 35));
    return made.map((c) => c.id);
  }

  primary(classIds: string[], tamil?: Partial<Parameters<typeof makeTeacher>[0]>) {
    for (const id of classIds) {
      const classTeacher = this.newTeacher('SIN', { subjectIds: [...CLASS_TEACHER_CODES].map((c) => this.subject(c)) });
      for (const [code, periods, doubles] of PRIMARY) {
        const teacherId = CLASS_TEACHER_CODES.has(code) ? classTeacher : this.teacherFor(code, periods, code === 'TAM' ? tamil : {});
        setCellAllocation(this.d, id, this.subject(code), { pattern: patternFrom(periods, doubles), teacherId });
      }
      this.d.classes.find((c) => c.id === id)!.classTeacherId = classTeacher;
    }
  }

  /** Grades 6–11 core subjects plus religion and aesthetics option blocks per grade. */
  secondary(classIds: string[]) {
    for (const id of classIds)
      for (const [, code, periods, doubles] of CORE)
        setCellAllocation(this.d, id, this.subject(code), { pattern: patternFrom(periods, doubles), teacherId: this.teacherFor(code, periods) });
    const grades = new Set(classIds.map((id) => this.d.classes.find((c) => c.id === id)!.gradeId));
    for (const gid of grades) {
      const g = this.d.grades.find((x) => x.id === gid)!;
      const ids = classIds.filter((id) => this.d.classes.find((c) => c.id === id)!.gradeId === gid);
      const rel = addBlock(this.d, { name: `${g.name} Religion`, classIds: ids });
      const relLine = addLine(this.d, rel, { label: 'Religion', periods: RELIGION_PERIODS });
      for (const [, code] of RELIGIONS)
        addSet(this.d, rel, relLine, { subjectId: this.subject(code), teacherId: this.teacherFor(code, RELIGION_PERIODS) });
      const aes = addBlock(this.d, { name: `${g.name} Aesthetics`, classIds: ids });
      const aesLine = addLine(this.d, aes, { label: 'Aesthetics', periods: AESTHETIC_PERIODS });
      for (const [, code] of AESTHETICS)
        addSet(this.d, aes, aesLine, { subjectId: this.subject(code), teacherId: this.teacherFor(code, AESTHETIC_PERIODS) });
    }
  }

  /** A/L stream classes ("12 Bio", "13 Com"…) for the given levels. */
  advanced(sectionId: string, levels: number[], streams: string[]) {
    for (const level of levels)
      for (const stream of streams) {
        const [id] = this.classes(sectionId, level, level, [` ${stream}`]);
        const c = this.d.classes.find((x) => x.id === id)!;
        c.stream = stream;
        c.studentCount = 30;
        const spec = AL_STREAMS[stream]!;
        for (const code of spec.core)
          setCellAllocation(this.d, c.id, this.subject(code), {
            pattern: patternFrom(AL_PERIODS, AL_DOUBLES),
            teacherId: this.teacherFor(code, AL_PERIODS),
          });
        if (spec.options) {
          const b = addBlock(this.d, { name: `${c.name} subjects`, classIds: [c.id] });
          spec.options.forEach((codes, i) => {
            const line = addLine(this.d, b, { label: `Subject ${i + 1}`, periods: AL_PERIODS, doubles: AL_DOUBLES });
            for (const code of codes) addSet(this.d, b, line, { subjectId: this.subject(code), teacherId: this.teacherFor(code, AL_PERIODS) });
          });
        }
        for (const [code, periods, doubles] of AL_COMMON)
          setCellAllocation(this.d, c.id, this.subject(code), { pattern: patternFrom(periods, doubles), teacherId: this.teacherFor(code, periods) });
      }
  }
}

function example(
  pack: Pack,
  name: string,
  local: { si: string; ta: string },
  maxLoad: number,
  fill: (b: Builder) => void,
  gaps: Parameters<typeof finishExample>[1],
) {
  return produce(createProject(pack, name), (d) => {
    d.institute.local = local;
    d.sections.splice(0); // the builder adds named sections
    const b = new Builder(d, maxLoad, 'si');
    fill(b);
    finishExample(d, gaps);
  });
}

const VISITING_TAMIL: Partial<Parameters<typeof makeTeacher>[0]> = {
  category: 'visiting',
  contractedDays: ['tue', 'thu'] as Weekday[],
  hostSchool: 'Tamil Vidyalayam',
};

export const EXAMPLES: Example[] = [
  {
    id: 'primary',
    name: 'Small primary school',
    summary: 'Simple pack · Grades 1–5, one class each, class teachers plus a visiting Tamil teacher',
    build: () =>
      example(
        'simple',
        'Sample Primary School',
        { si: 'නියැදි ප්‍රාථමික විද්‍යාලය', ta: 'மாதிரி ஆரம்பப் பாடசாலை' },
        30,
        (b) => {
          b.primary(b.classes(b.section('Primary'), 1, 5, ['A']), VISITING_TAMIL);
        },
        { shortBy: ['ENG'] },
      ),
  },
  {
    id: 'type2',
    name: 'Type 2 school',
    summary: 'Grades 1–11, one class each (11 classes)',
    build: () =>
      example(
        'sl-gov',
        'Sample Vidyalaya',
        { si: 'නියැදි විද්‍යාලය', ta: 'மாதிரி வித்தியாலயம்' },
        30,
        (b) => {
          b.primary(b.classes(b.section('Primary'), 1, 5, ['A']));
          b.secondary(b.classes(b.section('Junior secondary'), 6, 11, ['A']));
        },
        { shortBy: ['MAT', 'ICT'], overBy: ['HIS'] },
      ),
  },
  {
    id: '1c',
    name: '1C school',
    summary: 'Grades 6–13: two classes per grade, A/L Arts and Commerce (16 classes)',
    build: () =>
      example(
        'sl-gov',
        'Sample Madya Maha Vidyalaya',
        { si: 'නියැදි මධ්‍ය මහා විද්‍යාලය', ta: 'மாதிரி மத்திய மகா வித்தியாலயம்' },
        30,
        (b) => {
          b.secondary(b.classes(b.section('Secondary'), 6, 11, ['A', 'B']));
          b.advanced(b.section('Advanced Level'), [12, 13], ['Arts', 'Com']);
        },
        { shortBy: ['ENG', 'ACC'], overBy: ['GEO'] },
      ),
  },
  {
    id: '1ab',
    name: '1AB school',
    summary: 'Grades 6–13: three classes per grade, A/L Bio, Maths, Commerce and Arts (26 classes)',
    build: () =>
      example(
        'sl-gov',
        'Sample National School',
        { si: 'නියැදි ජාතික පාසල', ta: 'மாதிரி தேசிய பாடசாலை' },
        30,
        (b) => {
          b.secondary(b.classes(b.section('Secondary'), 6, 11, ['A', 'B', 'C']));
          b.advanced(b.section('Advanced Level'), [12, 13], ['Bio', 'Maths', 'Com', 'Arts']);
        },
        { shortBy: ['CMT', 'ICT', 'ENG'], overBy: ['CIV'] },
      ),
  },
  {
    id: 'sample',
    name: 'Sample Maha Vidyalaya',
    summary: 'Grades 6–11 × 3 classes: the quick demo used in the guides',
    build: () => sampleSchool(),
  },
];
