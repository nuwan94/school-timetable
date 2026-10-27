import type { Project } from '@/domain/project';
import type { Placement } from '@/domain/schedule';
import type { Weekday } from '@/domain/time';
import { checkTimetable, type CheckReport } from './checker';
import { buildModel, type ModelOptions } from './model';
import { solve, type SolveHooks, type SolveOptions } from './solve';

export interface GenerateOptions extends SolveOptions, ModelOptions {}

export interface UnplacedLesson {
  itemId: string;
  occurrence: number;
  label: string;
  length: number;
  reason: string;
  weight: number;
}

export interface Gap {
  classId: string;
  day: Weekday;
  slotId: string;
}

export interface GenerateResult {
  placements: Placement[];
  unplaced: UnplacedLesson[];
  /** Class periods with no lesson — shown as Self-study. */
  gaps: Gap[];
  check: CheckReport;
  stats: { units: number; placed: number; iterations: number; ms: number; stopped: boolean; seed: number };
  relaxedRules: boolean;
}

/** Builds the model, runs the solver, and verifies the result with the independent checker. */
export async function generateTimetable(p: Project, opts: GenerateOptions = {}, hooks: SolveHooks = {}): Promise<GenerateResult> {
  const seed = opts.seed ?? 1;
  const model = buildModel(p, opts);
  const outcome = await solve(model, { ...opts, seed }, hooks);

  const placements: Placement[] = [];
  const locked = new Set((opts.locked ?? []).map((l) => `${l.itemId}#${l.occurrence}`));
  for (const [key, at] of outcome.placed) {
    const u = model.units.find((x) => x.key === key)!;
    placements.push({
      itemId: u.itemId,
      occurrence: u.occurrence,
      day: at.pos.day,
      slotId: at.pos.slotId,
      roomId: at.roomId,
      locked: locked.has(key),
    });
  }

  // Gaps: class teaching periods covered by no placed unit.
  const covered = new Set<string>();
  for (const [key, at] of outcome.placed) {
    const u = model.units.find((x) => x.key === key)!;
    for (const c of u.classIds) for (const s of at.pos.slotIds) covered.add(`${c}|${at.pos.day}|${s}`);
  }
  const gaps: Gap[] = [];
  for (const [classId, periods] of model.classPeriods)
    for (const pos of periods) if (!covered.has(`${classId}|${pos.day}|${pos.slotId}`)) gaps.push({ classId, day: pos.day, slotId: pos.slotId });

  return {
    placements,
    unplaced: outcome.unplaced
      .map((x) => ({
        itemId: x.unit.itemId,
        occurrence: x.unit.occurrence,
        label: x.unit.label,
        length: x.unit.length,
        reason: x.reason,
        weight: x.unit.weight,
      }))
      .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label)),
    gaps,
    check: checkTimetable(p, placements, { relaxedRules: !!opts.relaxRules }),
    stats: {
      units: model.units.length,
      placed: placements.length,
      iterations: outcome.iterations,
      ms: outcome.ms,
      stopped: outcome.stopped,
      seed,
    },
    relaxedRules: !!opts.relaxRules,
  };
}
