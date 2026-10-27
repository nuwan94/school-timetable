import type { Pack } from './common';
import type { Subject } from './entities';

/**
 * Starter subject list for Sri Lankan schools. Names only — NOT period
 * allocations (those change with the NIE reform and live in editable
 * templates). Sinhala/Tamil names are best-effort and editable.
 */
export interface CatalogSubject {
  code: string;
  name: string;
  si: string;
  ta: string;
  colour: string;
  kind?: Subject['kind'];
  priority?: Subject['priority'];
  heavy?: boolean;
  roomType?: string;
}

export const SL_SUBJECTS: CatalogSubject[] = [
  { code: 'SIN', name: 'Sinhala', si: 'සිංහල', ta: 'சிங்களம்', colour: '#b45309', priority: 'core', heavy: true },
  { code: 'TAM', name: 'Tamil', si: 'දෙමළ', ta: 'தமிழ்', colour: '#c2410c', priority: 'core', heavy: true },
  { code: 'ENG', name: 'English', si: 'ඉංග්‍රීසි', ta: 'ஆங்கிலம்', colour: '#1d4ed8', priority: 'core', heavy: true },
  { code: 'MAT', name: 'Mathematics', si: 'ගණිතය', ta: 'கணிதம்', colour: '#7c3aed', priority: 'core', heavy: true },
  { code: 'SCI', name: 'Science', si: 'විද්‍යාව', ta: 'விஞ்ஞானம்', colour: '#059669', priority: 'core', heavy: true, roomType: 'Science lab' },
  { code: 'HIS', name: 'History', si: 'ඉතිහාසය', ta: 'வரலாறு', colour: '#92400e' },
  { code: 'GEO', name: 'Geography', si: 'භූගෝල විද්‍යාව', ta: 'புவியியல்', colour: '#0f766e' },
  { code: 'CIV', name: 'Civic Education', si: 'පුරවැසි අධ්‍යාපනය', ta: 'குடியியல் கல்வி', colour: '#475569' },
  { code: 'BUD', name: 'Buddhism', si: 'බුද්ධ ධර්මය', ta: 'பௌத்தம்', colour: '#ca8a04' },
  { code: 'HIN', name: 'Hinduism', si: 'හින්දු ධර්මය', ta: 'இந்து சமயம்', colour: '#ea580c' },
  { code: 'ISL', name: 'Islam', si: 'ඉස්ලාම් ධර්මය', ta: 'இஸ்லாம்', colour: '#15803d' },
  { code: 'CHR', name: 'Christianity', si: 'ක්‍රිස්තු ධර්මය', ta: 'கிறிஸ்தவம்', colour: '#0369a1' },
  { code: 'CAT', name: 'Catholicism', si: 'කතෝලික ධර්මය', ta: 'கத்தோலிக்கம்', colour: '#1e40af' },
  { code: 'MUS', name: 'Music', si: 'සංගීතය', ta: 'சங்கீதம்', colour: '#db2777', kind: 'activity', priority: 'low' },
  { code: 'ART', name: 'Art', si: 'චිත්‍ර', ta: 'சித்திரம்', colour: '#e11d48', kind: 'activity', priority: 'low' },
  { code: 'DAN', name: 'Dance', si: 'නර්තනය', ta: 'நடனம்', colour: '#be185d', kind: 'activity', priority: 'low' },
  { code: 'DRA', name: 'Drama', si: 'නාට්‍ය', ta: 'நாடகம்', colour: '#9d174d', kind: 'activity', priority: 'low' },
  { code: 'HPE', name: 'Health & Physical Education', si: 'සෞඛ්‍ය හා ශාරීරික අධ්‍යාපනය', ta: 'சுகாதாரமும் உடற்கல்வியும்', colour: '#16a34a', kind: 'activity', priority: 'low', roomType: 'Playground' },
  { code: 'ICT', name: 'ICT', si: 'තොරතුරු හා සන්නිවේදන තාක්ෂණය', ta: 'தகவல் தொடர்பாடல் தொழில்நுட்பம்', colour: '#0891b2', roomType: 'Computer lab' },
  { code: 'PTS', name: 'Practical & Technical Skills', si: 'ප්‍රායෝගික හා තාක්ෂණික කුසලතා', ta: 'செய்முறை தொழில்நுட்பத் திறன்கள்', colour: '#65a30d', kind: 'practical' },
  { code: 'CAS', name: 'Commerce & Accounting', si: 'වාණිජ හා ගිණුම්කරණ අධ්‍යයනය', ta: 'வணிகமும் கணக்கீடும்', colour: '#a16207' },
];

export const STANDARD_ROOM_TYPES = ['Science lab', 'Computer lab', 'Playground', 'Hall', 'Music room', 'Library'];

/** Starter roles. Norms are empty until the official circular figures are confirmed (PLAN.md §16 Q2). */
export const DEFAULT_ROLES: Record<Pack, string[]> = {
  simple: ['Teacher', 'Principal'],
  'sl-gov': ['Teacher', 'Sectional Head', 'Deputy Principal', 'Principal'],
  international: ['Teacher', 'Head of Department', 'Head of Section', 'Principal'],
};

export const MEDIUM_LABELS = { si: 'Sinhala', ta: 'Tamil', en: 'English', bilingual: 'Bilingual' } as const;

export const CATEGORY_LABELS = {
  permanent: 'Permanent',
  contract: 'Contract',
  attached: 'Attached / shared',
  visiting: 'Visiting (hourly)',
  developmentOfficer: 'Development Officer',
  trainee: 'Trainee',
  coach: 'Coach',
  vacancy: 'Vacancy / TBA',
} as const;
