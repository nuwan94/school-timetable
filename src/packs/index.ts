import { newId, type Pack } from '@/domain/common';
import { Project, FILE_FORMAT, SCHEMA_VERSION, type ProjectInput } from '@/domain/project';
import type { RuleConfig, Strength } from '@/domain/schedule';
import { buildSlots, type BellSchedule, type SlotKind } from '@/domain/time';

/**
 * School packs set starting defaults only; every value stays editable.
 * Workload norm figures are deliberately NOT set here: the MoE circular figure
 * must be confirmed first (PLAN.md §16 Q2), so roles start with no limits.
 */

type Part = readonly [SlotKind, string, number];

const SL_DAY: Part[] = [
  ['assembly', 'Assembly', 20],
  ['period', 'P1', 40],
  ['period', 'P2', 40],
  ['period', 'P3', 40],
  ['period', 'P4', 40],
  ['break', 'Interval', 20],
  ['period', 'P5', 40],
  ['period', 'P6', 40],
  ['period', 'P7', 40],
  ['period', 'P8', 40],
];

const INTL_DAY: Part[] = [
  ['formTime', 'Form time', 15],
  ['period', 'P1', 50],
  ['period', 'P2', 50],
  ['period', 'P3', 50],
  ['break', 'Break', 20],
  ['period', 'P4', 50],
  ['period', 'P5', 50],
  ['break', 'Lunch', 30],
  ['period', 'P6', 50],
  ['period', 'P7', 50],
];

function schedule(name: string, start: string, parts: Part[]): BellSchedule {
  const id = newId('bell');
  return {
    id,
    name,
    shortCode: '',
    local: {},
    active: true,
    slots: buildSlots(start, parts, id),
    dayOverrides: {},
  };
}

type RuleSeed = [code: string, enabled: boolean, strength: Strength, params?: RuleConfig['params']];

/** Defaults from PLAN.md §4.2. */
const RULES: Record<Pack, RuleSeed[]> = {
  simple: [
    ['R1', true, 'high', { daysPerWeek: 5 }],
    ['R4', true, 'hard', { maxPerDay: 1 }],
    ['R5', true, 'high'],
    ['R12', true, 'high', { maxPerDay: 7 }],
    ['R25', true, 'high'],
  ],
  'sl-gov': [
    ['R1', true, 'high', { daysPerWeek: 5, maxGradeLevel: 11 }],
    ['R4', true, 'hard', { maxPerDay: 1, minGradeLevel: 6, maxGradeLevel: 11 }],
    ['R5', true, 'high'],
    ['R6', true, 'low'],
    ['R7', true, 'medium'],
    ['R8', true, 'medium'],
    ['R11', true, 'high', { maxConsecutive: 4 }],
    ['R12', true, 'high', { maxPerDay: 7 }],
    ['R13', true, 'low'],
    ['R14', true, 'medium', { tolerance: 2 }],
    ['R15', true, 'medium'],
    ['R23', true, 'medium', { maxPerWeek: 2 }],
    ['R24', true, 'medium'],
    ['R25', true, 'high'],
    ['R26', true, 'high', { minFree: 3 }],
    ['R28', true, 'hard'],
    ['R21', true, 'hard'],
  ],
  international: [
    ['R1', false, 'high'],
    ['R4', true, 'low', { maxPerDay: 1 }],
    ['R5', true, 'high'],
    ['R6', true, 'low'],
    ['R7', true, 'medium'],
    ['R8', true, 'medium'],
    ['R11', true, 'high', { maxConsecutive: 3 }],
    ['R12', true, 'high', { maxPerDay: 7 }],
    ['R13', true, 'low'],
    ['R15', true, 'high'],
    ['R20', true, 'medium'],
    ['R25', true, 'high'],
    ['R26', true, 'medium', { minFree: 2 }],
    ['R27', true, 'medium'],
    ['R28', true, 'hard'],
    ['R21', true, 'hard'],
  ],
};

export function defaultRules(pack: Pack): RuleConfig[] {
  return RULES[pack].map(([code, enabled, strength, params]) => ({
    id: newId('rule'),
    code,
    enabled,
    strength,
    scope: { sectionIds: [], gradeLevels: [], classIds: [], subjectIds: [], teacherIds: [] },
    params: params ?? {},
  }));
}

export function createProject(pack: Pack, schoolName = ''): Project {
  const now = new Date().toISOString();
  const bell =
    pack === 'international'
      ? schedule('Secondary day', '07:30', INTL_DAY)
      : schedule('School day', '07:30', SL_DAY);
  const input: ProjectInput = {
    format: FILE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    id: newId('proj'),
    pack,
    simpleMode: pack === 'simple',
    createdAt: now,
    updatedAt: now,
    institute: {
      name: schoolName,
      workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      gradeLabel: pack === 'international' ? 'Year' : 'Grade',
    },
    bellSchedules: [bell],
    rules: defaultRules(pack),
  };
  return Project.parse(input);
}

export const PACK_LABELS: Record<Pack, string> = {
  simple: 'Simple (small school)',
  'sl-gov': 'Sri Lanka Government',
  international: 'International (Cambridge / Edexcel)',
};
