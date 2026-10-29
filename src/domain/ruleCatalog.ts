import { tx } from '@/i18n';
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
  { key: 'minGradeLevel', get label() { return tx('From grade'); }, min: 1, max: 13, default: 1 },
  { key: 'maxGradeLevel', get label() { return tx('To grade'); }, min: 1, max: 13, default: 13 },
];

export const RULE_CATALOG: RuleInfo[] = [
  {
    code: 'R1',
    get title() { return tx('Class teacher takes period 1'); },
    get help() { return tx('The class teacher teaches their class in the first period, for marking the register and a daily start.'); },
    about: 'class',
    params: [{ key: 'daysPerWeek', get label() { return tx('Days a week'); }, min: 1, max: 6, default: 5 }, ...gradeRange],
    canBeHard: false,
  },
  {
    code: 'R3',
    get title() { return tx('Assembly / form time'); },
    get help() { return tx('Set as a slot in the bell schedule.'); },
    about: 'school',
    params: [],
    canBeHard: false,
    get fixed() { return tx('Set in the bell schedule'); },
  },
  {
    code: 'R4',
    get title() { return tx('A subject at most once a day'); },
    get help() { return tx('A class does not have the same subject twice on one day. A double period counts as one.'); },
    about: 'class',
    params: [{ key: 'maxPerDay', get label() { return tx('Times a day'); }, min: 1, max: 3, default: 1 }, ...gradeRange],
    canBeHard: true,
  },
  { code: 'R5', get title() { return tx('Spread a subject across the week'); }, get help() { return tx('Lessons of a subject fall on as many different days as possible.'); }, about: 'class', params: gradeRange, canBeHard: false },
  { code: 'R6', get title() { return tx('Heavy subjects in the morning'); }, get help() { return tx('Subjects marked “heavy” (Maths, languages, Science) go before mid-day.'); }, about: 'class', params: gradeRange, canBeHard: false },
  {
    code: 'R7',
    get title() { return tx('Activity subjects not first, not right after a break'); },
    get help() { return tx('PE, music and other activity subjects are not in period 1 or straight after the interval.'); },
    about: 'class',
    params: gradeRange,
    canBeHard: false,
  },
  {
    code: 'R8',
    get title() { return tx('A subject not in the same period every day'); },
    get help() { return tx('Avoids e.g. Maths always in P7. The class teacher’s P1 lesson is exempt.'); },
    about: 'class',
    params: gradeRange,
    canBeHard: false,
  },
  {
    code: 'R11',
    get title() { return tx('Maximum periods in a row'); },
    get help() { return tx('A teacher teaches no more than this many periods without a free one. A break resets the count.'); },
    about: 'teacher',
    params: [{ key: 'maxConsecutive', get label() { return tx('Periods in a row'); }, min: 2, max: 8, default: 4 }],
    canBeHard: false,
  },
  {
    code: 'R12',
    get title() { return tx('Maximum periods a day'); },
    get help() { return tx('A teacher teaches no more than this many periods on one day.'); },
    about: 'teacher',
    params: [{ key: 'maxPerDay', get label() { return tx('Periods a day'); }, min: 3, max: 10, default: 7 }],
    canBeHard: true,
  },
  { code: 'R13', get title() { return tx('Avoid single free periods between lessons'); }, get help() { return tx('Fewer isolated free periods for teachers.'); }, about: 'teacher', params: [], canBeHard: false },
  {
    code: 'R14',
    get title() { return tx('Balanced daily load'); },
    get help() { return tx('A teacher’s busiest and lightest days differ by at most this many periods.'); },
    about: 'teacher',
    params: [{ key: 'tolerance', get label() { return tx('Allowed difference'); }, min: 0, max: 6, default: 2 }],
    canBeHard: false,
  },
  { code: 'R15', get title() { return tx('At least one free period a day'); }, get help() { return tx('Every teacher gets a free period on each day they teach.'); }, about: 'teacher', params: [], canBeHard: false },
  { code: 'R18', get title() { return tx('Section finishes early'); }, get help() { return tx('Set with a separate bell schedule for that section.'); }, about: 'school', params: [], canBeHard: false, get fixed() { return tx('Set in the bell schedule'); } },
  { code: 'R20', get title() { return tx('Same-grade classes at the same time'); }, get help() { return tx('For setted Maths/English (International pack).'); }, about: 'class', params: [], canBeHard: false, get fixed() { return tx('Use option blocks for now'); } },
  { code: 'R21', get title() { return tx('Room type required'); }, get help() { return tx('Lessons needing a lab or special room get one.'); }, about: 'school', params: [], canBeHard: true, get fixed() { return tx('Always kept when the room exists'); } },
  {
    code: 'R23',
    get title() { return tx('Same class not always last period'); },
    get help() { return tx('A teacher meets the same class in the last period of the day at most this many times a week.'); },
    about: 'teacher',
    params: [{ key: 'maxPerWeek', get label() { return tx('Times a week'); }, min: 1, max: 5, default: 2 }],
    canBeHard: false,
  },
  {
    code: 'R24',
    get title() { return tx('Free periods spread across the week'); },
    get help() { return tx('A teacher’s free periods are not all bunched on one day.'); },
    about: 'teacher',
    params: [{ key: 'tolerance', get label() { return tx('Allowed difference'); }, min: 0, max: 6, default: 3 }],
    canBeHard: false,
  },
  { code: 'R25', get title() { return tx('Compact days for visiting staff'); }, get help() { return tx('Visiting and part-time staff wait as little as possible between lessons.'); }, about: 'teacher', params: [], canBeHard: false },
  {
    code: 'R26',
    get title() { return tx('Teachers free for relief in every period'); },
    get help() { return tx('At least this many teachers are free in each period, so absent colleagues can be covered.'); },
    about: 'school',
    params: [{ key: 'minFree', get label() { return tx('Teachers free'); }, min: 0, max: 15, default: 3 }],
    canBeHard: false,
  },
  { code: 'R27', get title() { return tx('Department common free period'); }, get help() { return tx('International pack.'); }, about: 'teacher', params: [], canBeHard: false, get fixed() { return tx('Coming with the International pack'); } },
  { code: 'R28', get title() { return tx('Duty quotas'); }, get help() { return tx('Interval and gate duties.'); }, about: 'teacher', params: [], canBeHard: true, get fixed() { return tx('Coming with duty rosters (P6)'); } },
];

export const ruleInfo = (code: string) => RULE_CATALOG.find((r) => r.code === code);
