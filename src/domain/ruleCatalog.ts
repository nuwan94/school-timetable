/**
 * The built-in rule catalogue (PLAN.md §4.2): what each rule means, which
 * parameters it takes, and whether it can be Hard. Rules marked `fixed`
 * are handled elsewhere (bell schedule, room types) and are shown for
 * information only.
 */

export interface RuleParam {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
}

export interface RuleInfo {
  code: string;
  title: string;
  help: string;
  /** Who it is checked for. */
  about: 'class' | 'teacher' | 'school';
  params: RuleParam[];
  canBeHard: boolean;
  /** Not scored by the optimiser (set elsewhere, or not built yet). */
  fixed?: string;
}

const gradeRange: RuleParam[] = [
  { key: 'minGradeLevel', label: 'From grade', min: 1, max: 13, default: 1 },
  { key: 'maxGradeLevel', label: 'To grade', min: 1, max: 13, default: 13 },
];

export const RULE_CATALOG: RuleInfo[] = [
  {
    code: 'R1',
    title: 'Class teacher takes period 1',
    help: 'The class teacher teaches their class in the first period, for marking the register and a daily start.',
    about: 'class',
    params: [{ key: 'daysPerWeek', label: 'Days a week', min: 1, max: 6, default: 5 }, ...gradeRange],
    canBeHard: false,
  },
  {
    code: 'R3',
    title: 'Assembly / form time',
    help: 'Set as a slot in the bell schedule.',
    about: 'school',
    params: [],
    canBeHard: false,
    fixed: 'Set in the bell schedule',
  },
  {
    code: 'R4',
    title: 'A subject at most once a day',
    help: 'A class does not have the same subject twice on one day. A double period counts as one.',
    about: 'class',
    params: [{ key: 'maxPerDay', label: 'Times a day', min: 1, max: 3, default: 1 }, ...gradeRange],
    canBeHard: true,
  },
  { code: 'R5', title: 'Spread a subject across the week', help: 'Lessons of a subject fall on as many different days as possible.', about: 'class', params: gradeRange, canBeHard: false },
  { code: 'R6', title: 'Heavy subjects in the morning', help: 'Subjects marked “heavy” (Maths, languages, Science) go before mid-day.', about: 'class', params: gradeRange, canBeHard: false },
  {
    code: 'R7',
    title: 'Activity subjects not first, not right after a break',
    help: 'PE, music and other activity subjects are not in period 1 or straight after the interval.',
    about: 'class',
    params: gradeRange,
    canBeHard: false,
  },
  {
    code: 'R8',
    title: 'A subject not in the same period every day',
    help: 'Avoids e.g. Maths always in P7. The class teacher’s P1 lesson is exempt.',
    about: 'class',
    params: gradeRange,
    canBeHard: false,
  },
  {
    code: 'R11',
    title: 'Maximum periods in a row',
    help: 'A teacher teaches no more than this many periods without a free one. A break resets the count.',
    about: 'teacher',
    params: [{ key: 'maxConsecutive', label: 'Periods in a row', min: 2, max: 8, default: 4 }],
    canBeHard: false,
  },
  {
    code: 'R12',
    title: 'Maximum periods a day',
    help: 'A teacher teaches no more than this many periods on one day.',
    about: 'teacher',
    params: [{ key: 'maxPerDay', label: 'Periods a day', min: 3, max: 10, default: 7 }],
    canBeHard: true,
  },
  { code: 'R13', title: 'Avoid single free periods between lessons', help: 'Fewer isolated free periods for teachers.', about: 'teacher', params: [], canBeHard: false },
  {
    code: 'R14',
    title: 'Balanced daily load',
    help: 'A teacher’s busiest and lightest days differ by at most this many periods.',
    about: 'teacher',
    params: [{ key: 'tolerance', label: 'Allowed difference', min: 0, max: 6, default: 2 }],
    canBeHard: false,
  },
  { code: 'R15', title: 'At least one free period a day', help: 'Every teacher gets a free period on each day they teach.', about: 'teacher', params: [], canBeHard: false },
  { code: 'R18', title: 'Section finishes early', help: 'Set with a separate bell schedule for that section.', about: 'school', params: [], canBeHard: false, fixed: 'Set in the bell schedule' },
  { code: 'R20', title: 'Same-grade classes at the same time', help: 'For setted Maths/English (International pack).', about: 'class', params: [], canBeHard: false, fixed: 'Use option blocks for now' },
  { code: 'R21', title: 'Room type required', help: 'Lessons needing a lab or special room get one.', about: 'school', params: [], canBeHard: true, fixed: 'Always kept when the room exists' },
  {
    code: 'R23',
    title: 'Same class not always last period',
    help: 'A teacher meets the same class in the last period of the day at most this many times a week.',
    about: 'teacher',
    params: [{ key: 'maxPerWeek', label: 'Times a week', min: 1, max: 5, default: 2 }],
    canBeHard: false,
  },
  {
    code: 'R24',
    title: 'Free periods spread across the week',
    help: 'A teacher’s free periods are not all bunched on one day.',
    about: 'teacher',
    params: [{ key: 'tolerance', label: 'Allowed difference', min: 0, max: 6, default: 3 }],
    canBeHard: false,
  },
  { code: 'R25', title: 'Compact days for visiting staff', help: 'Visiting and part-time staff wait as little as possible between lessons.', about: 'teacher', params: [], canBeHard: false },
  {
    code: 'R26',
    title: 'Teachers free for relief in every period',
    help: 'At least this many teachers are free in each period, so absent colleagues can be covered.',
    about: 'school',
    params: [{ key: 'minFree', label: 'Teachers free', min: 0, max: 15, default: 3 }],
    canBeHard: false,
  },
  { code: 'R27', title: 'Department common free period', help: 'International pack.', about: 'teacher', params: [], canBeHard: false, fixed: 'Coming with the International pack' },
  { code: 'R28', title: 'Duty quotas', help: 'Interval and gate duties.', about: 'teacher', params: [], canBeHard: true, fixed: 'Coming with duty rosters (P6)' },
];

export const ruleInfo = (code: string) => RULE_CATALOG.find((r) => r.code === code);
