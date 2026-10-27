import type { Medium } from '@/domain/common';
import type { Subject } from '@/domain/entities';
import type { Project } from '@/domain/project';

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

// ------------------------------------------------------------ allocations

/**
 * Parses "who teaches what" pasted from Excel. Two layouts are accepted:
 *
 * - **List**: Class | Subject | Periods | Teacher | Doubles (teacher and
 *   doubles optional), one row per class × subject.
 * - **Grid** (same shape as the matrix): header row "Class" then subject
 *   codes; each cell like `6`, `6 KP`, `5 1D NF` (periods, optional doubles,
 *   teacher code or name).
 */

export interface PastedAllocation {
  row: number;
  classId: string | null;
  subjectId: string | null;
  periods: number;
  doubles: number;
  teacherId: string | null;
  /** Problems that stop this row from being applied. */
  errors: string[];
  /** Readable labels for the preview. */
  label: { cls: string; subject: string; teacher: string };
}

type Lookups = Pick<Project, 'classes' | 'subjects' | 'teachers'>;

function finder<T extends { id: string; name: string; shortCode: string }>(items: T[]) {
  const map = new Map<string, T>();
  for (const x of items) {
    map.set(x.name.trim().toLowerCase(), x);
    if (x.shortCode) map.set(x.shortCode.trim().toLowerCase(), x);
  }
  return (key: string) => map.get(key.trim().toLowerCase());
}

/** "5 1D NF" → periods 5, doubles 1, teacher "NF". */
function parseCell(cell: string): { periods: number; doubles: number; teacher: string } | null {
  const parts = cell.trim().split(/[\s/]+/).filter(Boolean);
  const periods = Number(parts[0]);
  if (!parts.length || !Number.isFinite(periods)) return null;
  let doubles = 0;
  let rest = parts.slice(1);
  const d = rest[0]?.match(/^(\d+)d$/i);
  if (d) {
    doubles = Number(d[1]);
    rest = rest.slice(1);
  }
  return { periods, doubles, teacher: rest.join(' ') };
}

export function parseAllocationPaste(text: string, p: Lookups): PastedAllocation[] {
  const findClass = finder(p.classes);
  const findSubject = finder(p.subjects);
  const findTeacher = finder(p.teachers);
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split('\t'))
    .filter((cells) => cells.some((c) => c.trim()));
  if (rows.length === 0) return [];

  const make = (row: number, cls: string, subject: string, periods: number, doubles: number, teacher: string): PastedAllocation => {
    const c = findClass(cls);
    const s = findSubject(subject);
    const t = teacher ? findTeacher(teacher) : undefined;
    const errors: string[] = [];
    if (!c) errors.push(`unknown class "${cls}"`);
    if (!s) errors.push(`unknown subject "${subject}"`);
    if (teacher && !t) errors.push(`unknown teacher "${teacher}"`);
    if (!Number.isInteger(periods) || periods < 0 || periods > 20) errors.push(`bad periods "${periods}"`);
    if (doubles * 2 > periods) errors.push('more doubles than periods allow');
    return {
      row,
      classId: c?.id ?? null,
      subjectId: s?.id ?? null,
      periods,
      doubles,
      teacherId: t?.id ?? null,
      errors,
      label: { cls, subject, teacher },
    };
  };

  const header = rows[0]!;
  const isGrid =
    header[0]?.trim().toLowerCase() === 'class' && header.length >= 3 && header.slice(1).filter((h) => h.trim() && findSubject(h)).length >= 2;

  if (isGrid) {
    const out: PastedAllocation[] = [];
    rows.slice(1).forEach((cells, i) => {
      const cls = cells[0]?.trim() ?? '';
      cells.slice(1).forEach((cell, j) => {
        const subject = header[j + 1]?.trim() ?? '';
        // Columns that aren't subjects (Total, notes…) are ignored.
        if (!cell.trim() || !findSubject(subject)) return;
        const parsed = parseCell(cell);
        if (!parsed) {
          out.push({ ...make(i + 2, cls, subject, 0, 0, ''), errors: [`cannot read "${cell.trim()}"`] });
          return;
        }
        out.push(make(i + 2, cls, subject, parsed.periods, parsed.doubles, parsed.teacher));
      });
    });
    return out;
  }

  const body = header[0]?.trim().toLowerCase() === 'class' ? rows.slice(1) : rows;
  const offset = body === rows ? 1 : 2;
  return body.map((cells, i) =>
    make(i + offset, cells[0]?.trim() ?? '', cells[1]?.trim() ?? '', Number(cells[2]?.trim()), Number(cells[4]?.trim() || 0), cells[3]?.trim() ?? ''),
  );
}
