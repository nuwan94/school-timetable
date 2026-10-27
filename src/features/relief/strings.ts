import type { Lang } from '@/print/labels';

/**
 * Words on the Today and Relief ledger screens. These screens are used
 * daily by deputy principals and sectional heads, often on a phone, so
 * they speak Sinhala and Tamil too. Best-effort translations; editable.
 */
const EN = {
  title: 'Today — relief',
  whoAway: 'Who is away?',
  tapToMark: 'Tap a teacher to mark them away for the whole day. Tap again for options.',
  search: 'Search teachers',
  wholeDay: 'Whole day',
  periodsOnly: 'Only these periods',
  until: 'Until',
  reason: 'Reason',
  repeat: 'Repeat',
  never: 'No',
  weekly: 'Every week',
  fortnightly: 'Every 2 weeks',
  notAway: 'Not away',
  fromCalendar: 'from calendar',
  repeats: 'repeats',
  toCover: 'Lessons to cover',
  covered: 'covered',
  autoAssign: 'Auto-assign all',
  clearAll: 'Clear all',
  insteadOf: 'instead of',
  moreOptions: 'More options',
  fewerOptions: 'Fewer options',
  noFree: 'No free teacher at this time.',
  thisWeek: 'this week',
  teachesClass: 'teaches class',
  change: 'Change',
  share: 'Share & print',
  registerPdf: 'Relief register (PDF)',
  registerPng: 'Image for WhatsApp',
  slipsPdf: 'Relief slips (PDF)',
  print: 'Print register',
  nothingToCover: 'Nobody is away — nothing to cover.',
  closed: 'No school today',
  noTimetable: 'No timetable yet. Generate one (and approve it) first.',
  goGenerate: 'Go to Generate',
  ledger: 'Relief ledger',
  ledgerNote: 'Reliefs each teacher has taken. Suggestions favour those with fewer.',
  termStart: 'Term started on',
  week: 'This week',
  term: 'This term',
  total: 'All time',
  absentDays: 'Days away (term)',
  teacher: 'Teacher',
  prevDay: 'Previous day',
  nextDay: 'Next day',
  working: 'Working…',
  freeTeachers: 'Free teachers (fewest reliefs first)',
  otherWays: 'Other ways',
  remove: 'Remove',
};

export type Strings = typeof EN;

const SI: Strings = {
  title: 'අද — ආදේශ',
  whoAway: 'අද නොපැමිණෙන්නේ කවුද?',
  tapToMark: 'මුළු දිනයටම නොපැමිණි ලෙස සලකුණු කිරීමට ගුරුවරයා මත තට්ටු කරන්න. විකල්ප සඳහා නැවත තට්ටු කරන්න.',
  search: 'ගුරුවරුන් සොයන්න',
  wholeDay: 'මුළු දිනය',
  periodsOnly: 'මෙම කාලච්ඡේද පමණි',
  until: 'දක්වා',
  reason: 'හේතුව',
  repeat: 'නැවත',
  never: 'නැත',
  weekly: 'සෑම සතියකම',
  fortnightly: 'සති 2කට වරක්',
  notAway: 'පැමිණ ඇත',
  fromCalendar: 'දින දර්ශනයෙන්',
  repeats: 'නැවත නැවත',
  toCover: 'ආවරණය කළ යුතු පාඩම්',
  covered: 'ආවරණය කළා',
  autoAssign: 'සියල්ල ස්වයංක්‍රීයව පවරන්න',
  clearAll: 'සියල්ල ඉවත් කරන්න',
  insteadOf: 'වෙනුවට',
  moreOptions: 'තවත් විකල්ප',
  fewerOptions: 'අඩු විකල්ප',
  noFree: 'මෙම වේලාවේ නිදහස් ගුරුවරයෙකු නැත.',
  thisWeek: 'මෙම සතියේ',
  teachesClass: 'පන්තියට උගන්වයි',
  change: 'වෙනස් කරන්න',
  share: 'බෙදාගන්න සහ මුද්‍රණය',
  registerPdf: 'ආදේශ ලේඛනය (PDF)',
  registerPng: 'WhatsApp සඳහා රූපය',
  slipsPdf: 'ආදේශ පත්‍රිකා (PDF)',
  print: 'ලේඛනය මුද්‍රණය',
  nothingToCover: 'කිසිවෙකු නොපැමිණ නැත — ආවරණය කිරීමට කිසිවක් නැත.',
  closed: 'අද පාසල නැත',
  noTimetable: 'තවම කාලසටහනක් නැත. පළමුව එකක් සාදා අනුමත කරන්න.',
  goGenerate: 'කාලසටහන සාදන්න',
  ledger: 'ආදේශ සාරාංශය',
  ledgerNote: 'එක් එක් ගුරුවරයා ගත් ආදේශ. අඩුවෙන් ගත් අයට යෝජනාවලදී ප්‍රමුඛත්වය.',
  termStart: 'වාරය ආරම්භ වූ දිනය',
  week: 'මෙම සතිය',
  term: 'මෙම වාරය',
  total: 'සියල්ල',
  absentDays: 'නොපැමිණි දින (වාරය)',
  teacher: 'ගුරුවරයා',
  prevDay: 'පෙර දිනය',
  nextDay: 'ඊළඟ දිනය',
  working: 'සකසමින්…',
  freeTeachers: 'නිදහස් ගුරුවරුන් (අඩු ආදේශ ඇති අය මුලින්)',
  otherWays: 'වෙනත් ක්‍රම',
  remove: 'ඉවත් කරන්න',
};

const TA: Strings = {
  title: 'இன்று — பதில் கடமை',
  whoAway: 'இன்று யார் வரவில்லை?',
  tapToMark: 'முழு நாளும் வரவில்லை எனக் குறிக்க ஆசிரியரைத் தட்டவும். விருப்பங்களுக்கு மீண்டும் தட்டவும்.',
  search: 'ஆசிரியர்களைத் தேடுக',
  wholeDay: 'முழு நாள்',
  periodsOnly: 'இந்தப் பாடவேளைகள் மட்டும்',
  until: 'வரை',
  reason: 'காரணம்',
  repeat: 'மீண்டும்',
  never: 'இல்லை',
  weekly: 'ஒவ்வொரு வாரமும்',
  fortnightly: '2 வாரங்களுக்கு ஒருமுறை',
  notAway: 'வந்துள்ளார்',
  fromCalendar: 'நாட்காட்டியிலிருந்து',
  repeats: 'மீண்டும் வரும்',
  toCover: 'ஈடுசெய்ய வேண்டிய பாடங்கள்',
  covered: 'ஒதுக்கப்பட்டது',
  autoAssign: 'அனைத்தையும் தானாக ஒதுக்கு',
  clearAll: 'அனைத்தையும் நீக்கு',
  insteadOf: 'பதிலாக',
  moreOptions: 'மேலும் விருப்பங்கள்',
  fewerOptions: 'குறைவான விருப்பங்கள்',
  noFree: 'இந்த நேரத்தில் ஓய்வான ஆசிரியர் இல்லை.',
  thisWeek: 'இந்த வாரம்',
  teachesClass: 'வகுப்புக்குக் கற்பிப்பவர்',
  change: 'மாற்று',
  share: 'பகிர் & அச்சிடு',
  registerPdf: 'பதில் ஆசிரியர் பதிவேடு (PDF)',
  registerPng: 'WhatsApp படம்',
  slipsPdf: 'கடமைச் சீட்டுகள் (PDF)',
  print: 'பதிவேட்டை அச்சிடு',
  nothingToCover: 'யாரும் விடுப்பில் இல்லை — ஈடுசெய்ய எதுவும் இல்லை.',
  closed: 'இன்று பாடசாலை இல்லை',
  noTimetable: 'இன்னும் நேர அட்டவணை இல்லை. முதலில் ஒன்றை உருவாக்கி அங்கீகரிக்கவும்.',
  goGenerate: 'நேர அட்டவணை உருவாக்கு',
  ledger: 'பதில் கடமை சுருக்கம்',
  ledgerNote: 'ஒவ்வொரு ஆசிரியரும் செய்த பதில் கடமைகள். குறைவாகச் செய்தவர்களுக்கு முன்னுரிமை.',
  termStart: 'தவணை ஆரம்பித்த திகதி',
  week: 'இந்த வாரம்',
  term: 'இந்தத் தவணை',
  total: 'மொத்தம்',
  absentDays: 'வராத நாட்கள் (தவணை)',
  teacher: 'ஆசிரியர்',
  prevDay: 'முந்தைய நாள்',
  nextDay: 'அடுத்த நாள்',
  working: 'செயலாக்கப்படுகிறது…',
  freeTeachers: 'ஓய்வான ஆசிரியர்கள் (குறைவான பதில் கடமை முதலில்)',
  otherWays: 'வேறு வழிகள்',
  remove: 'நீக்கு',
};

export const STRINGS: Record<Lang, Strings> = { en: EN, si: SI, ta: TA };

const KEY = 'timetable.uiLang';

/** UI language for daily screens: remembered per device, defaulting to the print language. */
export function loadUiLang(fallback: Lang): Lang {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'si' || v === 'ta' ? v : fallback;
  } catch {
    return fallback;
  }
}

export function saveUiLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage unavailable */
  }
}
