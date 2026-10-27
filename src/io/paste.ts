import type { Medium } from '@/domain/common';
import type { Subject } from '@/domain/entities';

/**
 * Parses rows pasted from Excel / Google Sheets (tab-separated) into teacher
 * drafts. Columns: Name | Short code | Subjects | Media. Subjects and media
 * may be separated by commas, slashes or spaces, and matched by code or name.
 * A header row (first cell "name") is skipped.
 */

export interface PastedTeacher {
  name: string;
  shortCode: string;
  subjectIds: string[];
  media: Medium[];
  /** Subject tokens that did not match any subject. */
  unknown: string[];
}

const MEDIA: Record<string, Medium> = {
  s: 'si', si: 'si', sin: 'si', sinhala: 'si', 'සිංහල': 'si',
  t: 'ta', ta: 'ta', tam: 'ta', tamil: 'ta', 'தமிழ்': 'ta',
  e: 'en', en: 'en', eng: 'en', english: 'en',
};

const tokens = (cell: string | undefined) =>
  (cell ?? '')
    .split(/[,/;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

export function parseTeacherPaste(text: string, subjects: Pick<Subject, 'id' | 'name' | 'shortCode'>[]): PastedTeacher[] {
  const byKey = new Map<string, string>();
  for (const s of subjects) {
    byKey.set(s.name.toLowerCase(), s.id);
    if (s.shortCode) byKey.set(s.shortCode.toLowerCase(), s.id);
  }
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split('\t'))
    .filter((cells) => cells.some((c) => c.trim()));
  if (rows[0]?.[0]?.trim().toLowerCase() === 'name') rows.shift();

  return rows.map((cells) => {
    const subjectTokens = tokens(cells[2]).flatMap((t) => (byKey.has(t.toLowerCase()) ? [t] : t.split(/\s+/)));
    const subjectIds: string[] = [];
    const unknown: string[] = [];
    for (const t of subjectTokens) {
      const id = byKey.get(t.toLowerCase());
      if (id) {
        if (!subjectIds.includes(id)) subjectIds.push(id);
      } else unknown.push(t);
    }
    const media = [
      ...new Set(
        tokens(cells[3])
          .flatMap((t) => t.split(/\s+/))
          .map((t) => MEDIA[t.toLowerCase()])
          .filter((m): m is Medium => !!m),
      ),
    ];
    return { name: (cells[0] ?? '').trim(), shortCode: (cells[1] ?? '').trim(), subjectIds, media, unknown };
  }).filter((t) => t.name);
}
