import type { Draft } from 'immer';
import { addBlock, addLine, addSet } from './blocks';
import { mulberry32 } from '@/solver/rng';
import type { Project } from './project';
import { choicesOn } from './students';
import { tx } from '@/i18n';

/**
 * Option block builder (International). From the students' subject choices it
 * works out how many sets each subject needs, places the sets in lines so that
 * as many students as possible can take every subject they chose, and puts
 * each student into one set per subject with balanced set sizes.
 */

export interface BuilderInput {
  /** Form classes the block draws from; may span Year groups. */
  classIds: string[];
  /** The option subjects to block (core subjects stay as class lessons). */
  subjectIds: string[];
  maxSetSize: number;
  /** Lines to use; null = the fewest that satisfy everyone (up to a sensible limit). */
  lines: number | null;
}

export interface PlannedSet {
  subjectId: string;
  line: number;
  studentIds: string[];
}

export interface Unsatisfied {
  studentId: string;
  /** Subjects that could not be fitted alongside the others. */
  missing: string[];
  /** Subjects running in the lines left free, as an alternative to offer. */
  alternatives: string[];
}

export interface BlockPlan {
  lines: number;
  sets: PlannedSet[];
  unsatisfied: Unsatisfied[];
  /** Students per subject. */
  enrolment: Record<string, number>;
  /** Students taking both subjects, keyed `a|b` with a < b. */
  clashes: Record<string, number>;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface Want {
  id: string;
  subjects: string[];
}

/** Every way to give the student one set per subject on distinct lines (each set given by its index). */
function combos(want: string[], setsBySubject: Map<string, number[]>, lineOf: number[]): number[][] {
  const out: number[][] = [];
  const pick: number[] = [];
  const used = new Set<number>();
  const walk = (i: number) => {
    if (out.length > 200) return;
    if (i === want.length) {
      out.push([...pick]);
      return;
    }
    for (const s of setsBySubject.get(want[i]!) ?? []) {
      const line = lineOf[s]!;
      if (used.has(line)) continue;
      used.add(line);
      pick.push(s);
      walk(i + 1);
      pick.pop();
      used.delete(line);
    }
  };
  walk(0);
  return out;
}

/** The largest subset of `want` that fits on distinct lines (drops the fewest, least-taken subjects first). */
function bestSubset(want: string[], setsBySubject: Map<string, number[]>, lineOf: number[]): string[] {
  for (let drop = 1; drop < want.length; drop++) {
    const pick = (start: number, left: number, kept: string[]): string[] | null => {
      if (left === 0) {
        const rest = want.filter((w) => !kept.includes(w));
        return combos(rest, setsBySubject, lineOf).length ? rest : null;
      }
      for (let i = start; i < want.length; i++) {
        const r = pick(i + 1, left - 1, [...kept, want[i]!]);
        if (r) return r;
      }
      return null;
    };
    const r = pick(0, drop, []);
    if (r) return r;
  }
  return [];
}

/** Students who cannot get all their placed subjects on distinct lines. */
function countBlocked(wants: Want[], setsBySubject: Map<string, number[]>, lineOf: number[]): number {
  let n = 0;
  for (const w of wants) {
    const placed = w.subjects.filter((s) => setsBySubject.has(s));
    if (placed.length > 1 && combos(placed, setsBySubject, lineOf).length === 0) n++;
  }
  return n;
}

function placeSets(wants: Want[], setSubjects: string[], lines: number, clashes: Record<string, number>): number[] {
  // Most-clashing subjects first (DSatur-like): they have the fewest good lines. Then a few seeded restarts in shuffled order.
  const weight = (s: string) => Object.entries(clashes).reduce((t, [k, n]) => t + (k.split('|').includes(s) ? n : 0), 0);
  const first = setSubjects.map((_, i) => i).sort((a, b) => weight(setSubjects[b]!) - weight(setSubjects[a]!) || a - b);
  const rnd = mulberry32(7);
  let best: number[] = [];
  let bestBlocked = Infinity;
  for (let attempt = 0; attempt < 8 && bestBlocked > 0; attempt++) {
    const order = attempt === 0 ? first : [...first].sort(() => rnd() - 0.5);
    const lineOf = placeInOrder(wants, setSubjects, lines, order);
    const blocked = improve(wants, setSubjects, lines, lineOf);
    if (blocked < bestBlocked) ((bestBlocked = blocked), (best = lineOf));
  }
  return best;
}

function bySubject(setSubjects: string[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  setSubjects.forEach((s, i) => m.set(s, [...(m.get(s) ?? []), i]));
  return m;
}

function placeInOrder(wants: Want[], setSubjects: string[], lines: number, order: number[]): number[] {
  const lineOf: number[] = new Array(setSubjects.length).fill(-1);
  const setsBySubject = new Map<string, number[]>();
  for (const i of order) {
    const subject = setSubjects[i]!;
    let best = 0;
    let bestCost = Infinity;
    for (let line = 0; line < lines; line++) {
      lineOf[i] = line;
      setsBySubject.set(subject, [...(setsBySubject.get(subject) ?? []).filter((x) => x !== i), i]);
      const blocked = countBlocked(wants, setsBySubject, lineOf);
      const sameSubject = (setsBySubject.get(subject) ?? []).filter((x) => x !== i && lineOf[x] === line).length;
      const crowd = lineOf.filter((l, k) => k !== i && l === line).length;
      const cost = blocked * 1000 + sameSubject * 100 + crowd;
      if (cost < bestCost) ((bestCost = cost), (best = line));
    }
    lineOf[i] = best;
  }
  return lineOf;
}

/** Local search: move one set, or swap two, while that frees more students. Returns the students still blocked. */
function improve(wants: Want[], setSubjects: string[], lines: number, lineOf: number[]): number {
  const sets = bySubject(setSubjects);
  let here = countBlocked(wants, sets, lineOf);
  for (let pass = 0; pass < 20 && here > 0; pass++) {
    let improved = false;
    for (let i = 0; i < setSubjects.length && here > 0; i++) {
      const from = lineOf[i]!;
      for (let line = 0; line < lines; line++) {
        if (line === from) continue;
        lineOf[i] = line;
        const n = countBlocked(wants, sets, lineOf);
        if (n < here) {
          here = n;
          improved = true;
          break;
        }
        lineOf[i] = from;
      }
      for (let j = i + 1; j < setSubjects.length && lineOf[i] === from; j++) {
        if (lineOf[j] === from) continue;
        lineOf[i] = lineOf[j]!;
        lineOf[j] = from;
        const n = countBlocked(wants, sets, lineOf);
        if (n < here) {
          here = n;
          improved = true;
          break;
        }
        lineOf[j] = lineOf[i]!;
        lineOf[i] = from;
      }
    }
    if (!improved) break;
  }
  return here;
}

/** Puts each student into sets: the combination that keeps set sizes most even (and under the cap). */
function assignStudents(wants: Want[], setSubjects: string[], lineOf: number[], cap: number) {
  const setsBySubject = bySubject(setSubjects);
  const members: string[][] = setSubjects.map(() => []);
  const unsatisfied: Unsatisfied[] = [];
  // Hardest students first: those with the fewest workable combinations.
  const scored = wants.map((w) => ({ w, n: combos(w.subjects, setsBySubject, lineOf).length }));
  scored.sort((a, b) => a.n - b.n);
  for (const { w } of scored) {
    let fit = w.subjects;
    let options = combos(fit, setsBySubject, lineOf);
    if (!options.length) {
      fit = bestSubset(w.subjects, setsBySubject, lineOf);
      options = combos(fit, setsBySubject, lineOf);
      const missing = w.subjects.filter((s) => !fit.includes(s));
      const usedLines = new Set((options[0] ?? []).map((s) => lineOf[s]));
      const alternatives = [...new Set(setSubjects.filter((s, i) => !usedLines.has(lineOf[i]) && !w.subjects.includes(s)))];
      unsatisfied.push({ studentId: w.id, missing, alternatives });
    }
    let best: number[] | null = null;
    let bestCost = Infinity;
    for (const o of options) {
      const cost = o.reduce((t, s) => t + members[s]!.length + (members[s]!.length >= cap ? 1000 : 0), 0);
      if (cost < bestCost) ((bestCost = cost), (best = o));
    }
    for (const s of best ?? []) members[s]!.push(w.id);
  }
  return { members, unsatisfied };
}

export function planBlock(p: Project, input: BuilderInput): BlockPlan {
  const subjects = new Set(input.subjectIds);
  const wants: Want[] = p.students
    .filter((s) => s.active && input.classIds.includes(s.classId))
    .map((s) => ({ id: s.id, subjects: choicesOn(s).filter((x) => subjects.has(x)) }))
    .filter((w) => w.subjects.length > 0);
  const enrolment: Record<string, number> = {};
  const clashes: Record<string, number> = {};
  for (const w of wants)
    for (let i = 0; i < w.subjects.length; i++) {
      const a = w.subjects[i]!;
      enrolment[a] = (enrolment[a] ?? 0) + 1;
      for (let j = i + 1; j < w.subjects.length; j++) {
        const k = pairKey(a, w.subjects[j]!);
        clashes[k] = (clashes[k] ?? 0) + 1;
      }
    }
  const cap = Math.max(1, input.maxSetSize);
  const setSubjects = input.subjectIds.flatMap((s) => Array.from({ length: Math.ceil((enrolment[s] ?? 0) / cap) }, () => s));
  const most = Math.max(1, ...wants.map((w) => w.subjects.length));

  const tryLines = (lines: number) => {
    const lineOf = placeSets(wants, setSubjects, lines, clashes);
    const { members, unsatisfied } = assignStudents(wants, setSubjects, lineOf, cap);
    return {
      lines,
      sets: setSubjects.map((subjectId, i) => ({ subjectId, line: lineOf[i]!, studentIds: members[i]! })),
      unsatisfied,
      enrolment,
      clashes,
    };
  };
  if (input.lines) return tryLines(input.lines);
  let plan = tryLines(most);
  for (let lines = most + 1; plan.unsatisfied.length && lines <= most + 3; lines++) {
    const next = tryLines(lines);
    if (next.unsatisfied.length < plan.unsatisfied.length) plan = next;
  }
  return plan;
}

const LINE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Turns a plan into an option block: a line per plan line, a set per planned
 * set with its students listed. Teachers who teach the subject are shared out
 * so nobody has two sets in the same line. Returns the block id.
 */
export function applyBlockPlan(
  d: Draft<Project>,
  plan: BlockPlan,
  input: { name: string; classIds: string[]; periods: number; doubles?: number },
): string {
  const blockId = addBlock(d, { name: input.name, classIds: input.classIds });
  const lineIds = Array.from({ length: plan.lines }, (_, i) =>
    addLine(d, blockId, { label: tx('Line {x}', { x: LINE_LETTERS[i] ?? i + 1 }), periods: input.periods, doubles: input.doubles ?? 0 }),
  );
  const busy = new Set<string>();
  const load = new Map<string, number>();
  const count = new Map<string, number>();
  // A set nobody could be placed in would still need a teacher and a room: leave it out.
  const sets = plan.sets.filter((s) => s.studentIds.length > 0);
  for (const s of [...sets].sort((a, b) => a.line - b.line)) {
    const lineId = lineIds[s.line]!;
    const subject = d.subjects.find((x) => x.id === s.subjectId);
    const n = (count.get(s.subjectId) ?? 0) + 1;
    count.set(s.subjectId, n);
    const total = sets.filter((x) => x.subjectId === s.subjectId).length;
    const teacher = d.teachers
      .filter((t) => t.active && t.subjectIds.includes(s.subjectId) && !busy.has(`${t.id}|${s.line}`))
      .sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0];
    if (teacher) {
      busy.add(`${teacher.id}|${s.line}`);
      load.set(teacher.id, (load.get(teacher.id) ?? 0) + 1);
    }
    const label = subject?.shortCode || subject?.name || 'Set';
    const setId = addSet(d, blockId, lineId, {
      subjectId: s.subjectId,
      groupName: total > 1 ? `${label} ${n}` : label,
      teacherId: teacher?.id ?? null,
      studentCount: s.studentIds.length,
    });
    const groupId = d.optionBlocks
      .find((b) => b.id === blockId)!
      .lines.flatMap((l) => l.sets)
      .find((x) => x.id === setId)!.groupId;
    const g = d.studentGroups.find((x) => x.id === groupId)!;
    g.kind = 'set';
    g.studentIds = [...s.studentIds];
  }
  return blockId;
}

/**
 * After a student's choices change: moves them into sets for their new
 * choices in this block, keeping the lines as they are and keeping the
 * student in any set they are already in when that still works. Returns the
 * subjects that could not be fitted.
 */
export function reassignStudent(d: Draft<Project>, blockId: string, studentId: string): string[] {
  const block = d.optionBlocks.find((b) => b.id === blockId);
  const student = d.students.find((s) => s.id === studentId);
  if (!block || !student) return [];
  const sets = block.lines.flatMap((l, line) => l.sets.map((s) => ({ ...s, line })));
  const offered = new Set(sets.map((s) => s.subjectId));
  const want = choicesOn(student).filter((s) => offered.has(s));
  const group = (id: string) => d.studentGroups.find((g) => g.id === id);
  const setSubjects = sets.map((s) => s.subjectId);
  const lineOf = sets.map((s) => s.line);
  const subjectSets = bySubject(setSubjects);
  let fit = want;
  let options = combos(fit, subjectSets, lineOf);
  if (!options.length) {
    fit = bestSubset(want, subjectSets, lineOf);
    options = combos(fit, subjectSets, lineOf);
  }
  const cost = (o: number[]) =>
    o.reduce((t, i) => {
      const g = group(sets[i]!.groupId);
      return t + (g?.studentIds.includes(studentId) ? -10_000 : (g?.studentIds.length ?? 0));
    }, 0);
  const best = options.sort((a, b) => cost(a) - cost(b))[0] ?? [];
  const keep = new Set(best.map((i) => sets[i]!.groupId));
  for (const s of sets) {
    const g = group(s.groupId);
    if (!g) continue;
    const has = g.studentIds.includes(studentId);
    if (has && !keep.has(g.id)) g.studentIds = g.studentIds.filter((x) => x !== studentId);
    if (!has && keep.has(g.id)) g.studentIds.push(studentId);
    g.studentCount = g.studentIds.length;
  }
  return want.filter((s) => !fit.includes(s));
}

/** Pairs of subjects a student can take together in this block (sets on different lines). */
export function compatiblePairs(p: Project, blockId: string): Set<string> {
  const block = p.optionBlocks.find((b) => b.id === blockId);
  const out = new Set<string>();
  if (!block) return out;
  const lines = block.lines.map((l) => new Set(l.sets.map((s) => s.subjectId)));
  const subjects = [...new Set(lines.flatMap((l) => [...l]))];
  for (const a of subjects)
    for (const b of subjects) if (a < b && lines.some((la, i) => la.has(a) && lines.some((lb, j) => j !== i && lb.has(b)))) out.add(pairKey(a, b));
  return out;
}

export { pairKey };

/**
 * Keeps one student's set places in step with their class and choices: in
 * blocks of their class they are re-fitted (lines unchanged), elsewhere they
 * are taken out. Blocks whose sets list nobody are count-based and left alone.
 * Returns the subjects that could not be fitted.
 */
export function refitStudent(d: Draft<Project>, studentId: string): string[] {
  const student = d.students.find((s) => s.id === studentId);
  const missing: string[] = [];
  for (const b of d.optionBlocks) {
    const groups = b.lines.flatMap((l) => l.sets.map((s) => d.studentGroups.find((g) => g.id === s.groupId))).filter((g) => !!g);
    if (!groups.some((g) => g.studentIds.length)) continue;
    if (student && b.classIds.includes(student.classId)) missing.push(...reassignStudent(d, b.id, studentId));
    else
      for (const g of groups)
        if (g.studentIds.includes(studentId)) {
          g.studentIds = g.studentIds.filter((x) => x !== studentId);
          g.studentCount = g.studentIds.length;
        }
  }
  return missing;
}

/** Chosen subjects offered in a block of the student's class where they are in no set. */
export function unplacedChoices(p: Project, studentId: string): string[] {
  const s = p.students.find((x) => x.id === studentId);
  if (!s) return [];
  const out: string[] = [];
  for (const b of p.optionBlocks) {
    if (!b.classIds.includes(s.classId)) continue;
    const sets = b.lines.flatMap((l) => l.sets);
    const listed = sets.some((x) => p.studentGroups.find((g) => g.id === x.groupId)?.studentIds.length);
    if (!listed) continue;
    for (const subjectId of choicesOn(s))
      if (
        sets.some((x) => x.subjectId === subjectId) &&
        !sets.some((x) => x.subjectId === subjectId && p.studentGroups.find((g) => g.id === x.groupId)?.studentIds.includes(studentId))
      )
        out.push(subjectId);
  }
  return out;
}
