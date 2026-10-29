import type { Draft } from 'immer';
import { newId } from './common';
import { House, Student } from './entities';
import type { Project } from './project';
import { tx } from '@/i18n';

/**
 * Students for the International pack: a list pasted from the school's
 * admissions system, each with a form class, a house and subject choices.
 * Sets then list their members, so clashes can be checked per student.
 */

export interface ImportRow {
  line: number;
  admissionNo: string;
  name: string;
  className: string;
  classId: string | null;
  houseName: string;
  subjectIds: string[];
  /** Subject codes that match no subject. */
  unknown: string[];
}

export interface ImportPreview {
  rows: ImportRow[];
  /** Lines that could not be read, with the reason. */
  problems: string[];
  /** Houses named in the list that do not exist yet. */
  newHouses: string[];
}

const HEADERS: [keyof Pick<ImportRow, 'admissionNo' | 'name' | 'className' | 'houseName'> | 'subjects', RegExp][] = [
  ['admissionNo', /^(adm|admission|student ?(no|id|number)|no\.?|id)/i],
  ['name', /name/i],
  ['className', /^(class|form|tutor|year|grade)/i],
  ['houseName', /house/i],
  ['subjects', /^(subject|choice|option|course)/i],
];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Splits pasted text into cells: tabs when there are any (a spreadsheet copy), commas otherwise (CSV, with quotes). */
export function splitRows(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const tabbed = lines.some((l) => l.includes('\t'));
  return lines.map((l) => {
    if (tabbed) return l.split('\t').map((c) => c.trim());
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]!;
      if (quoted) {
        if (ch === '"' && l[i + 1] === '"') ((cur += '"'), i++);
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') (cells.push(cur.trim()), (cur = ''));
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  });
}

/**
 * Reads a student list. Columns: admission no, name, class, house, then the
 * subject choices — one code per column, or several in one cell separated by
 * spaces, semicolons or slashes. A header row may name the columns in any order.
 */
export function parseStudents(p: Project, text: string): ImportPreview {
  const all = splitRows(text);
  const rows: ImportRow[] = [];
  const problems: string[] = [];
  let order: (string | null)[] = ['admissionNo', 'name', 'className', 'houseName', 'subjects'];
  let start = 0;
  const firstFilled = all.findIndex((r) => r.some(Boolean));
  if (firstFilled >= 0) {
    const head = all[firstFilled]!;
    const named = head.map((c) => HEADERS.find(([, re]) => re.test(c.trim()))?.[0] ?? null);
    if (named.includes('name')) {
      order = named;
      start = firstFilled + 1;
    }
  }
  const subjectsFrom = order.indexOf('subjects');
  const classByName = new Map<string, string>();
  for (const c of p.classes) {
    classByName.set(norm(c.name), c.id);
    if (c.shortCode) classByName.set(norm(c.shortCode), c.id);
  }
  const subjectByCode = new Map<string, string>();
  for (const s of p.subjects) {
    subjectByCode.set(norm(s.name), s.id);
    if (s.syllabusCode) subjectByCode.set(norm(s.syllabusCode), s.id);
    if (s.shortCode) subjectByCode.set(norm(s.shortCode), s.id);
  }
  const houses = new Set(p.houses.map((h) => norm(h.name)));
  const newHouses = new Map<string, string>();

  for (let i = start; i < all.length; i++) {
    const cells = all[i]!;
    if (!cells.some(Boolean)) continue;
    const get = (key: string) => {
      const k = order.indexOf(key);
      return k >= 0 ? (cells[k] ?? '').trim() : '';
    };
    const name = get('name');
    if (!name) {
      problems.push(tx('Line {x}: no name.', { x: i + 1 }));
      continue;
    }
    const className = get('className');
    const classId = classByName.get(norm(className)) ?? null;
    if (!classId) problems.push(tx('Line {x}: class "{className}" not found — {name} is skipped.', { x: i + 1, className, name }));
    const codes =
      subjectsFrom < 0
        ? []
        : cells
            .slice(subjectsFrom)
            .filter((_, k) => k === 0 || order[subjectsFrom + k] == null)
            .flatMap((c) => c.split(/[\s;/|]+/))
            .filter(Boolean);
    const subjectIds: string[] = [];
    const unknown: string[] = [];
    for (const code of codes) {
      const id = subjectByCode.get(norm(code));
      if (!id) unknown.push(code);
      else if (!subjectIds.includes(id)) subjectIds.push(id);
    }
    const houseName = get('houseName');
    if (houseName && !houses.has(norm(houseName)) && !newHouses.has(norm(houseName))) newHouses.set(norm(houseName), houseName);
    rows.push({ line: i + 1, admissionNo: get('admissionNo'), name, className, classId, houseName, subjectIds, unknown });
  }
  return { rows, problems, newHouses: [...newHouses.values()] };
}

/**
 * Adds the previewed students, creating missing houses. A student whose
 * admission number already exists is updated in place (class, house and
 * choices), so re-importing a corrected list changes as little as possible.
 * Returns the number added and updated.
 */
export function applyStudentImport(d: Draft<Project>, preview: ImportPreview): { added: number; updated: number } {
  for (const h of preview.newHouses) d.houses.push(House.parse({ id: newId('house'), name: h }));
  const houseId = (name: string) => (name ? (d.houses.find((h) => norm(h.name) === norm(name))?.id ?? null) : null);
  let added = 0;
  let updated = 0;
  for (const r of preview.rows) {
    if (!r.classId) continue;
    const existing = r.admissionNo ? d.students.find((s) => s.admissionNo === r.admissionNo) : undefined;
    if (existing) {
      existing.name = r.name;
      existing.classId = r.classId;
      existing.houseId = houseId(r.houseName) ?? existing.houseId;
      existing.choices = r.subjectIds.map(
        (subjectId) => existing.choices.find((c) => c.subjectId === subjectId) ?? { subjectId, from: null, to: null },
      );
      updated++;
    } else {
      d.students.push(
        Student.parse({
          id: newId('stu'),
          name: r.name,
          admissionNo: r.admissionNo,
          classId: r.classId,
          houseId: houseId(r.houseName),
          choices: r.subjectIds.map((subjectId) => ({ subjectId, from: null, to: null })),
        }),
      );
      added++;
    }
  }
  return { added, updated };
}

/** Removes a student and takes them out of every set and activity. */
export function removeStudent(d: Draft<Project>, id: string): void {
  d.students = d.students.filter((s) => s.id !== id);
  for (const g of d.studentGroups) if (g.studentIds.includes(id)) g.studentIds = g.studentIds.filter((x) => x !== id);
  for (const c of d.ccas) c.studentIds = c.studentIds.filter((x) => x !== id);
}

/** Subjects the student is taking on a date (choices with no dates always count). */
export function choicesOn(s: Student, date?: string): string[] {
  return s.choices.filter((c) => !date || ((!c.from || c.from <= date) && (!c.to || date <= c.to))).map((c) => c.subjectId);
}

/**
 * The students in a group or class: a set's listed members, or everyone in its
 * classes when nobody is listed (or the id is a class).
 */
export function membersOf(p: Project, groupOrClassId: string): string[] {
  const g = p.studentGroups.find((x) => x.id === groupOrClassId);
  if (g?.studentIds.length) return g.studentIds;
  const classIds = g ? g.classIds : [groupOrClassId];
  return p.students.filter((s) => classIds.includes(s.classId)).map((s) => s.id);
}
