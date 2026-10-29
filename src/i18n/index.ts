import { create } from 'zustand';
import type { Lang } from '@/print/labels';
import { SI, TA } from './dicts';

/**
 * The language of the app's own screens (sheets have their own print
 * language). English text stays in the code and is the key; Sinhala and
 * Tamil live in dictionaries beside this file. Text with no entry shows in
 * English. `i18n.test.ts` checks every marked text has both translations.
 */

const KEY = 'timetable.uiLang';
const DICTS: Record<Lang, Record<string, string> | null> = { en: null, si: SI, ta: TA };

function load(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'si' || v === 'ta' ? v : 'en';
  } catch {
    return 'en';
  }
}

let current: Lang = load();
if (typeof document !== 'undefined') document.documentElement.lang = current;

/**
 * Translates English text into the UI language. `{name}` placeholders are
 * filled from `params`, after translation so word order can change.
 */
export function tx(en: string, params?: Record<string, string | number | null | undefined>): string {
  const s = DICTS[current]?.[en] ?? en;
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k] ?? '') : m)) : s;
}

/** Marks text for translation where it is defined (e.g. a list at the top of a module); pass it through `tx` where it is shown. */
export const msg = (en: string): string => en;

const DAYS: Record<string, [short: string, long: string]> = {
  mon: [msg('Mon'), msg('Monday')],
  tue: [msg('Tue'), msg('Tuesday')],
  wed: [msg('Wed'), msg('Wednesday')],
  thu: [msg('Thu'), msg('Thursday')],
  fri: [msg('Fri'), msg('Friday')],
  sat: [msg('Sat'), msg('Saturday')],
  sun: [msg('Sun'), msg('Sunday')],
};

/** A weekday ('mon') as a short name in the UI language. */
export const dayShort = (d: string): string => (DAYS[d] ? tx(DAYS[d][0]) : d);

/** A weekday ('mon') as a full name in the UI language. */
export const dayLong = (d: string): string => (DAYS[d] ? tx(DAYS[d][1]) : d);

/** Joins names with "and" in the UI language: "A and B". */
export const joinAnd = (items: string[]): string => items.join(tx(' and '));

/** The UI language now (for code outside React, such as report builders). */
export const uiLang = (): Lang => current;

const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = [
  msg('Jan'),
  msg('Feb'),
  msg('Mar'),
  msg('Apr'),
  msg('May'),
  msg('Jun'),
  msg('Jul'),
  msg('Aug'),
  msg('Sep'),
  msg('Oct'),
  msg('Nov'),
  msg('Dec'),
];

/**
 * A date as "Thu 29 Oct" (or "29 Oct 14:05" with `time`) in the UI language.
 * Built from the dictionaries rather than `toLocaleDateString`, because
 * Chrome ships no Sinhala date names and would fall back to English.
 */
export function dateLabel(d: Date, o: { weekday?: boolean; time?: boolean; utc?: boolean } = {}): string {
  const [day, date, month] = o.utc ? [d.getUTCDay(), d.getUTCDate(), d.getUTCMonth()] : [d.getDay(), d.getDate(), d.getMonth()];
  let s = `${date} ${tx(MONTHS[month] ?? '')}`;
  if (o.weekday) s = `${dayShort(WEEK[day] ?? '')} ${s}`;
  if (o.time) s += ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return s;
}

/** Sets the language without remembering it (the solver worker, tests). */
export function setLangQuietly(lang: Lang): void {
  current = lang;
}

interface LangState {
  lang: Lang;
  setLang(lang: Lang): void;
}

/** The UI language for React: changing it re-renders the app in the new language and remembers it on this device. */
export const useLang = create<LangState>()((set) => ({
  lang: current,
  setLang: (lang) => {
    current = lang;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* storage unavailable: the choice lasts for this visit */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

export const LANG_OPTIONS: { value: Lang; label: string; short: string }[] = [
  { value: 'en', label: 'English', short: 'EN' },
  { value: 'si', label: 'සිංහල', short: 'සිං' },
  { value: 'ta', label: 'தமிழ்', short: 'தமி' },
];
