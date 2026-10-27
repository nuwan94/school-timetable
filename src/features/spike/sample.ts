/**
 * Sample teacher timetable chosen to stress complex-script shaping:
 * Sinhala ZWJ conjuncts (ශ්‍රී, ප්‍ර, ද්‍ය), rakaransaya/yansaya, pre-base vowel
 * signs (කො, සේ); Tamil pre-base / split vowels (தொ, பெ, கை) and ஸ்ரீ, க்ஷ.
 */
export const SAMPLE = {
  school: { si: 'ශ්‍රී සුමංගල විද්‍යාලය', ta: 'ஸ்ரீ சுமங்கல வித்தியாலயம்', en: 'Sri Sumangala Vidyalaya' },
  title: { si: 'ගුරු කාලසටහන — 2027 පළමු වාරය', ta: 'ஆசிரியர் நேர அட்டவணை — 2027 முதலாம் தவணை', en: 'Teacher timetable — 2027 Term 1' },
  teacher: { si: 'ගුරුවරිය: කේ. පෙරේරා (කොළඹ)', ta: 'ஆசிரியை: கே. பெரேரா (கொழும்பு)', en: 'Teacher: K. Perera (Colombo)' },
  days: {
    si: ['සඳුදා', 'අඟහරුවාදා', 'බදාදා', 'බ්‍රහස්පතින්දා', 'සිකුරාදා'],
    ta: ['திங்கள்', 'செவ்வாய்', 'புதன்', 'வியாழன்', 'வெள்ளி'],
    en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  },
  subjects: {
    si: ['ගණිතය 9A', 'විද්‍යාව 10B', 'ඉංග්‍රීසි 8C', 'බුද්ධ ධර්මය', 'ප්‍රායෝගික', 'ක්‍රීඩා', 'සෞන්දර්ය', 'තොරතුරු තාක්ෂණය'],
    ta: ['கணிதம் 9A', 'விஞ்ஞானம் 10B', 'ஆங்கிலம் 8C', 'இந்து சமயம்', 'செய்முறை', 'விளையாட்டு', 'அழகியல்', 'தகவல் தொழில்நுட்பம்'],
    en: ['Maths 9A', 'Science 10B', 'English 8C', 'Religion', 'Practical', 'PE', 'Aesthetics', 'ICT'],
  },
  footer: { si: 'අනුමත කළේ: විදුහල්පති ____________', ta: 'அங்கீகரித்தவர்: அதிபர் ____________', en: 'Approved by Principal ____________' },
} as const;

export type Lang = 'si' | 'ta' | 'en';

/** Deterministic cell contents: index into subjects, or null for a free period. */
export function cell(day: number, period: number): number | null {
  const v = (day * 5 + period * 3) % 11;
  return v < 8 ? v : null;
}

export const PERIODS = 8;
