import type { Project } from '@/domain/project';
import { teachingSlots } from '@/domain/time';
import { tx } from '@/i18n';

export type StepId = 'school' | 'classes' | 'subjects' | 'rooms' | 'teachers' | 'allocations' | 'students' | 'blocks';

export interface Step {
  id: StepId;
  label: string;
  /** Short status shown under the label. */
  status: (p: Project) => string;
  done: (p: Project) => boolean;
  /** Hidden in Simple mode. */
  advanced?: boolean;
  /** Shown for the International pack, or once the school has a student list. */
  students?: boolean;
}


export const STEPS: Step[] = [
  {
    id: 'school',
    get label() { return tx('School & bells'); },
    status: (p) => (p.institute.name ? p.institute.name : tx('Name not set')),
    done: (p) => !!p.institute.name && p.bellSchedules.some((b) => teachingSlots(b, 'mon').length > 0),
  },
  {
    id: 'classes',
    get label() { return tx('Classes'); },
    status: (p) => (p.classes.length === 1 ? tx('1 class') : tx('{n} classes', { n: p.classes.length })),
    done: (p) => p.classes.length > 0,
  },
  {
    id: 'subjects',
    get label() { return tx('Subjects'); },
    status: (p) => (p.subjects.length === 1 ? tx('1 subject') : tx('{n} subjects', { n: p.subjects.length })),
    done: (p) => p.subjects.length > 0,
  },
  {
    id: 'rooms',
    get label() { return tx('Special rooms'); },
    status: (p) => (p.rooms.length ? (p.rooms.length === 1 ? tx('1 room') : tx('{n} rooms', { n: p.rooms.length })) : tx('Optional')),
    done: (p) => p.rooms.length > 0,
    advanced: true,
  },
  {
    id: 'teachers',
    get label() { return tx('Teachers'); },
    status: (p) => (p.teachers.length === 1 ? tx('1 teacher') : tx('{n} teachers', { n: p.teachers.length })),
    done: (p) => p.teachers.length > 0,
  },
  {
    id: 'allocations',
    get label() { return tx('Who teaches what'); },
    status: (p) => {
      const withAlloc = new Set(p.allocations.flatMap((a) => a.groupIds));
      return tx('{done}/{n} classes', { done: p.classes.filter((c) => withAlloc.has(c.id)).length, n: p.classes.length });
    },
    done: (p) => p.classes.length > 0 && p.classes.every((c) => p.allocations.some((a) => a.groupIds.includes(c.id))),
  },
  {
    id: 'students',
    get label() { return tx('Students'); },
    status: (p) => (p.students.length
        ? `${(p.students.length === 1 ? tx('1 student') : tx('{n} students', { n: p.students.length }))}, ${(p.houses.length === 1 ? tx('1 house') : tx('{n} houses', { n: p.houses.length }))}`
        : tx('Import the list with choices')),
    done: (p) => p.students.length > 0,
    students: true,
  },
  {
    id: 'blocks',
    get label() { return tx('Option blocks'); },
    status: (p) =>
      p.optionBlocks.length
        ? (p.optionBlocks.length === 1 ? tx('1 block') : tx('{n} blocks', { n: p.optionBlocks.length }))
        : p.pack === 'international'
          ? tx('Options from student choices')
          : tx('Religion, aesthetics, baskets…'),
    done: (p) => p.optionBlocks.length > 0,
  },
];

export const visibleSteps = (p: Project) =>
  STEPS.filter((s) => !(p.simpleMode && s.advanced) && (!s.students || p.pack === 'international' || p.students.length > 0));
