import type { Weekday } from '@/domain/time';

export type Lang = 'en' | 'si' | 'ta';

/**
 * Words printed on sheets. Sinhala/Tamil are best-effort translations of
 * common school usage; schools can override names of subjects, teachers and
 * the school itself through the Sinhala/Tamil name fields.
 */
const EN = {
  days: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
  daysShort: { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' },
  classTimetable: 'Class timetable',
  teacherTimetable: 'Teacher timetable',
  roomTimetable: 'Room timetable',
  masterStaff: 'Master timetable — staff',
  masterClassDay: 'Master timetable — classes',
  freePeriods: 'Free-period chart',
  classList: 'Section-wise class list',
  period: 'Period',
  interval: 'Interval',
  assembly: 'Assembly',
  class: 'Class',
  classTeacher: 'Class teacher',
  subject: 'Subject',
  teacher: 'Teacher',
  teachers: 'Teachers',
  room: 'Room',
  periods: 'Periods',
  section: 'Section',
  medium: 'Medium',
  students: 'Students',
  selfStudy: 'Self-study',
  noTeacher: 'no teacher',
  totalPerWeek: 'Periods per week',
  freePerWeek: 'Free periods',
  freeTeachers: 'Free teachers',
  effectiveFrom: 'Effective from',
  draft: 'DRAFT',
  principal: 'Principal',
  signature: 'Signature',
  date: 'Date',
  page: 'Page',
  mediumNames: { si: 'Sinhala', ta: 'Tamil', en: 'English', bilingual: 'Bilingual' },
};

export type Labels = typeof EN;

const SI: Labels = {
  days: { mon: 'සඳුදා', tue: 'අඟහරුවාදා', wed: 'බදාදා', thu: 'බ්‍රහස්පතින්දා', fri: 'සිකුරාදා', sat: 'සෙනසුරාදා', sun: 'ඉරිදා' },
  daysShort: { mon: 'සඳුදා', tue: 'අඟහ', wed: 'බදාදා', thu: 'බ්‍රහස්', fri: 'සිකු', sat: 'සෙන', sun: 'ඉරි' },
  classTimetable: 'පන්ති කාලසටහන',
  teacherTimetable: 'ගුරු කාලසටහන',
  roomTimetable: 'කාමර කාලසටහන',
  masterStaff: 'ප්‍රධාන කාලසටහන — ගුරුවරුන්',
  masterClassDay: 'ප්‍රධාන කාලසටහන — පන්ති',
  freePeriods: 'නිදහස් කාලච්ඡේද සටහන',
  classList: 'අංශ අනුව පන්ති ලැයිස්තුව',
  period: 'කාලච්ඡේදය',
  interval: 'විවේකය',
  assembly: 'උදෑසන රැස්වීම',
  class: 'පන්තිය',
  classTeacher: 'පන්ති භාර ගුරුවරයා',
  subject: 'විෂයය',
  teacher: 'ගුරුවරයා',
  teachers: 'ගුරුවරුන්',
  room: 'කාමරය',
  periods: 'කාලච්ඡේද',
  section: 'අංශය',
  medium: 'මාධ්‍යය',
  students: 'සිසුන්',
  selfStudy: 'ස්වයං අධ්‍යයනය',
  noTeacher: 'ගුරුවරයෙකු නැත',
  totalPerWeek: 'සතියකට කාලච්ඡේද',
  freePerWeek: 'නිදහස් කාලච්ඡේද',
  freeTeachers: 'නිදහස් ගුරුවරුන්',
  effectiveFrom: 'බලපැවැත්වෙන දිනය',
  draft: 'කෙටුම්පත',
  principal: 'විදුහල්පති',
  signature: 'අත්සන',
  date: 'දිනය',
  page: 'පිටුව',
  mediumNames: { si: 'සිංහල', ta: 'දෙමළ', en: 'ඉංග්‍රීසි', bilingual: 'ද්විභාෂා' },
};

const TA: Labels = {
  days: { mon: 'திங்கள்', tue: 'செவ்வாய்', wed: 'புதன்', thu: 'வியாழன்', fri: 'வெள்ளி', sat: 'சனி', sun: 'ஞாயிறு' },
  daysShort: { mon: 'திங்', tue: 'செவ்', wed: 'புத', thu: 'வியா', fri: 'வெள்', sat: 'சனி', sun: 'ஞாயி' },
  classTimetable: 'வகுப்பு நேர அட்டவணை',
  teacherTimetable: 'ஆசிரியர் நேர அட்டவணை',
  roomTimetable: 'அறை நேர அட்டவணை',
  masterStaff: 'பிரதான நேர அட்டவணை — ஆசிரியர்கள்',
  masterClassDay: 'பிரதான நேர அட்டவணை — வகுப்புகள்',
  freePeriods: 'ஓய்வு பாடவேளை அட்டவணை',
  classList: 'பிரிவு வாரியான வகுப்புப் பட்டியல்',
  period: 'பாடவேளை',
  interval: 'இடைவேளை',
  assembly: 'காலைக் கூட்டம்',
  class: 'வகுப்பு',
  classTeacher: 'வகுப்பாசிரியர்',
  subject: 'பாடம்',
  teacher: 'ஆசிரியர்',
  teachers: 'ஆசிரியர்கள்',
  room: 'அறை',
  periods: 'பாடவேளைகள்',
  section: 'பிரிவு',
  medium: 'மொழிமூலம்',
  students: 'மாணவர்கள்',
  selfStudy: 'சுய கற்றல்',
  noTeacher: 'ஆசிரியர் இல்லை',
  totalPerWeek: 'வாரத்துக்கான பாடவேளைகள்',
  freePerWeek: 'ஓய்வு பாடவேளைகள்',
  freeTeachers: 'ஓய்வான ஆசிரியர்கள்',
  effectiveFrom: 'நடைமுறைக்கு வரும் திகதி',
  draft: 'வரைவு',
  principal: 'அதிபர்',
  signature: 'கையொப்பம்',
  date: 'திகதி',
  page: 'பக்கம்',
  mediumNames: { si: 'சிங்களம்', ta: 'தமிழ்', en: 'ஆங்கிலம்', bilingual: 'இருமொழி' },
};

export const LABELS: Record<Lang, Labels> = { en: EN, si: SI, ta: TA };

export const dayName = (lang: Lang, d: Weekday, short = false) => (short ? LABELS[lang].daysShort : LABELS[lang].days)[d];

/** Name in the print language, falling back to the English name. */
export const localName = (e: { name: string; local?: { si?: string; ta?: string } } | undefined, lang: Lang): string =>
  !e ? '' : lang === 'en' ? e.name : e.local?.[lang]?.trim() || e.name;
