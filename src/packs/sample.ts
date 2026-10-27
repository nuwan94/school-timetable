import { produce } from 'immer';
import { addBlock, addLine, addSet } from '@/domain/blocks';
import { makeSubject, makeTeacher, patternFrom, patternPeriods } from '@/domain/factories';
import { quickAddClasses, setCellAllocation } from '@/domain/mutations';
import type { Project } from '@/domain/project';
import { SL_SUBJECTS } from '@/domain/catalog';
import { createProject } from './index';

const SURNAMES = [
  'Perera', 'Fernando', 'Silva', 'Jayasinghe', 'Bandara', 'Dissanayake', 'Wijesinghe', 'Rajapaksha', 'Gunawardena', 'Herath',
  'Kumara', 'Rathnayake', 'Senanayake', 'Wickramasinghe', 'Ekanayake', 'Abeysekara', 'Karunaratne', 'Amarasinghe', 'Liyanage', 'Samarasinghe',
  'Mendis', 'Weerasinghe', 'Ranasinghe', 'Pathirana', 'Gamage', 'Hettiarachchi', 'Munasinghe', 'Rajan', 'Nadarajah', 'Fauzi',
];
const INITIALS = ['A', 'K', 'S', 'W', 'R', 'D', 'N', 'M', 'P', 'H', 'J'];

/** Subject, weekly periods, doubles, priority. 37 periods + religion 2 + aesthetics 1 = 40. */
const CORE: [string, string, number, number, 'core' | 'normal' | 'low'][] = [
  ['Mathematics', 'MAT', 6, 1, 'core'],
  ['Sinhala', 'SIN', 6, 1, 'core'],
  ['English', 'ENG', 4, 0, 'core'],
  ['Science', 'SCI', 5, 1, 'core'],
  ['History', 'HIS', 3, 0, 'normal'],
  ['Geography', 'GEO', 2, 0, 'normal'],
  ['Civics', 'CIV', 2, 0, 'normal'],
  ['Health', 'HPE', 2, 0, 'normal'],
  ['Tamil', 'TAM', 2, 0, 'normal'],
  ['PTS', 'PTS', 2, 0, 'low'],
  ['ICT', 'ICT', 3, 0, 'low'],
];
const RELIGIONS = [
  ['Buddhism', 'BUD'],
  ['Hinduism', 'HIN'],
  ['Islam', 'ISL'],
  ['Christianity', 'CHR'],
] as const;
const AESTHETICS = [
  ['Art', 'ART'],
  ['Music', 'MUS'],
  ['Dance', 'DAN'],
] as const;
const RELIGION_PERIODS = 2;
const AESTHETIC_PERIODS = 1;

/**
 * A sample Sri Lankan government school (also the test fixture for the solver): Grades 6–11 × `letters` classes,
 * SL pack bell schedule (8 periods × 5 days = 40), R4 hard, religion and
 * aesthetics option blocks, doubles in core subjects. Teachers are created
 * per subject until each carries at most `maxLoad` periods.
 */
export function sampleSchool(letters = ['A', 'B', 'C'], maxLoad = 26): Project {
  return produce(createProject('sl-gov', 'Sample Maha Vidyalaya'), (d) => {
    quickAddClasses(d, { sectionId: d.sections[0]!.id, fromLevel: 6, toLevel: 11, letters, medium: 'si' });
    d.classes.forEach((c) => (c.studentCount = 35));
    for (const [name, code, , , priority] of CORE) d.subjects.push(makeSubject({ name, shortCode: code, priority }));
    for (const [name, code] of [...RELIGIONS, ...AESTHETICS]) d.subjects.push(makeSubject({ name, shortCode: code }));
    for (const s of d.subjects) {
      const cat = SL_SUBJECTS.find((x) => x.code === s.shortCode);
      if (cat) s.local = { si: cat.si, ta: cat.ta };
    }
    d.institute.local = { si: 'නියැදි මහා විද්‍යාලය', ta: 'மாதிரி மகா வித்தியாலயம்' };
    d.institute.academicYear = '2027';
    d.institute.term = 'Term 1';
    const sub = (code: string) => d.subjects.find((s) => s.shortCode === code)!.id;

    const pool = new Map<string, { id: string; load: number }>();
    let n = 0;
    const teacherFor = (code: string, periods: number) => {
      let t = pool.get(code);
      if (!t || t.load + periods > maxLoad) {
        const surname = SURNAMES[n % SURNAMES.length]!;
        const round = Math.floor(n / SURNAMES.length);
        n++;
        const teacher = makeTeacher({
          name: `${INITIALS[n % INITIALS.length]}. ${surname}${round ? ` ${round + 1}` : ''}`,
          shortCode: `${surname.slice(0, 3).toUpperCase()}${round ? round + 1 : ''}`,
          subjectIds: [sub(code)],
          media: ['si'],
        });
        d.teachers.push(teacher);
        t = { id: teacher.id, load: 0 };
        pool.set(code, t);
      }
      t.load += periods;
      return t.id;
    };

    for (const c of d.classes)
      for (const [, code, periods, doubles] of CORE)
        setCellAllocation(d, c.id, sub(code), { pattern: patternFrom(periods, doubles), teacherId: teacherFor(code, periods) });

    for (const g of d.grades) {
      const classIds = d.classes.filter((c) => c.gradeId === g.id).map((c) => c.id);
      const rel = addBlock(d, { name: `${g.name} Religion`, classIds });
      const relLine = addLine(d, rel, { label: 'Religion', periods: RELIGION_PERIODS });
      for (const [, code] of RELIGIONS) addSet(d, rel, relLine, { subjectId: sub(code), teacherId: teacherFor(code, RELIGION_PERIODS) });
      const aes = addBlock(d, { name: `${g.name} Aesthetics`, classIds });
      const aesLine = addLine(d, aes, { label: 'Aesthetics', periods: AESTHETIC_PERIODS });
      for (const [, code] of AESTHETICS) addSet(d, aes, aesLine, { subjectId: sub(code), teacherId: teacherFor(code, AESTHETIC_PERIODS) });
    }

    // Class teacher: whoever teaches the class most, one class each.
    const taken = new Set<string>();
    for (const c of d.classes) {
      const load = new Map<string, number>();
      for (const a of d.allocations)
        if (a.groupIds.includes(c.id)) for (const t of a.teacherIds) load.set(t, (load.get(t) ?? 0) + patternPeriods(a.pattern));
      const best = [...load].filter(([t]) => !taken.has(t)).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (best) {
        c.classTeacherId = best;
        taken.add(best);
      }
    }
  });
}
