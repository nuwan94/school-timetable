import type { Project } from '@/domain/project';
import { teachingSlots } from '@/domain/time';

export type StepId = 'school' | 'classes' | 'subjects' | 'rooms' | 'teachers' | 'allocations' | 'blocks';

export interface Step {
  id: StepId;
  label: string;
  /** Short status shown under the label. */
  status: (p: Project) => string;
  done: (p: Project) => boolean;
  /** Hidden in Simple mode. */
  advanced?: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : word.endsWith('s') ? 'es' : 's'}`;

export const STEPS: Step[] = [
  {
    id: 'school',
    label: 'School & bells',
    status: (p) => (p.institute.name ? p.institute.name : 'Name not set'),
    done: (p) => !!p.institute.name && p.bellSchedules.some((b) => teachingSlots(b, 'mon').length > 0),
  },
  {
    id: 'classes',
    label: 'Classes',
    status: (p) => plural(p.classes.length, 'class'),
    done: (p) => p.classes.length > 0,
  },
  {
    id: 'subjects',
    label: 'Subjects',
    status: (p) => plural(p.subjects.length, 'subject'),
    done: (p) => p.subjects.length > 0,
  },
  {
    id: 'rooms',
    label: 'Special rooms',
    status: (p) => (p.rooms.length ? plural(p.rooms.length, 'room') : 'Optional'),
    done: (p) => p.rooms.length > 0,
    advanced: true,
  },
  {
    id: 'teachers',
    label: 'Teachers',
    status: (p) => plural(p.teachers.length, 'teacher'),
    done: (p) => p.teachers.length > 0,
  },
  {
    id: 'allocations',
    label: 'Who teaches what',
    status: (p) => {
      const withAlloc = new Set(p.allocations.flatMap((a) => a.groupIds));
      return `${p.classes.filter((c) => withAlloc.has(c.id)).length}/${p.classes.length} classes`;
    },
    done: (p) => p.classes.length > 0 && p.classes.every((c) => p.allocations.some((a) => a.groupIds.includes(c.id))),
  },
  {
    id: 'blocks',
    label: 'Option blocks',
    status: (p) => (p.optionBlocks.length ? plural(p.optionBlocks.length, 'block') : 'Religion, aesthetics, baskets…'),
    done: (p) => p.optionBlocks.length > 0,
  },
];

export const visibleSteps = (p: Project) => STEPS.filter((s) => !(p.simpleMode && s.advanced));
