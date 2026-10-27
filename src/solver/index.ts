import type { Project } from '@/domain/project';
import type { Placement } from '@/domain/schedule';
import type { Weekday } from '@/domain/time';
import { checkTimetable, type CheckReport } from './checker';
import { buildModel, type ModelOptions } from './model';
import { optimise } from './optimise';
import { softReport, SoftScorer, type SoftReport } from './soft';
import { solve, type SolveHooks } from './solve';
import { SolverState } from './state';

export interface GenerateOptions extends ModelOptions {
  seed?: number;
  maxIterations?: number;
  timeLimitMs?: number;
  /** Run the soft-rule optimisation pass (default true). */
  optimise?: boolean;
  optimiseMs?: number;
  /**
   * Start from these placements:
   * - 'improve': keep them and only optimise (no change penalty);
   * - 'minimal': keep as many as possible, penalise every lesson that moves.
   */
  start?: { placements: Placement[]; mode: 'improve' | 'minimal' };
}

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
  soft: SoftReport;
  stats: {
    units: number;
    placed: number;
    iterations: number;
    ms: number;
    stopped: boolean;
    seed: number;
    softBefore: number;
    softAfter: number;
    /** Lessons whose day/period differs from the start placements (improve / minimal-change). */
    moved: number | null;
  };
  relaxedRules: boolean;
}

export type GenerateHooks = SolveHooks & { onPhase?: (phase: 'placing' | 'improving') => void };

const keyOf = (pl: Pick<Placement, 'itemId' | 'occurrence'>) => `${pl.itemId}#${pl.occurrence}`;

/** Builds the model, places lessons, improves soft rules, and verifies the result with the independent checker. */
export async function generateTimetable(p: Project, opts: GenerateOptions = {}, hooks: GenerateHooks = {}): Promise<GenerateResult> {
  const t0 = Date.now();
  const seed = opts.seed ?? 1;
  const model = buildModel(p, opts);
  const start = opts.start ? new Map(opts.start.placements.map((pl) => [keyOf(pl), pl])) : undefined;

  hooks.onPhase?.('placing');
  const outcome = await solve(
    model,
    {
      seed,
      maxIterations: opts.maxIterations,
      timeLimitMs: opts.timeLimitMs,
      initial: start,
      prefer: opts.start?.mode === 'minimal' ? start : undefined,
    },
    hooks,
  );

  const units = new Map(model.units.map((u) => [u.key, u]));
  const state = new SolverState(model);
  for (const [key, at] of outcome.placed) state.place(units.get(key)!, at.pos, at.roomId);
  const scorer = new SoftScorer(p, model, { relaxRules: opts.relaxRules });
  let softBefore = scorer.total(state.placed);
  let softAfter = softBefore;
  let iterations = outcome.iterations;
  if (opts.optimise !== false && !outcome.stopped) {
    hooks.onPhase?.('improving');
    const o = await optimise(
      model,
      state,
      scorer,
      {
        seed,
        timeLimitMs: opts.optimiseMs,
        reference: opts.start?.mode === 'minimal' ? start : undefined,
      },
      {
        shouldStop: hooks.shouldStop,
        yieldEvery: hooks.yieldEvery,
        onProgress: ({ iteration }) => hooks.onProgress?.({ placed: state.placed.size, total: model.units.length, iteration }),
      },
    );
    iterations += o.iterations;
    softBefore = scorer.total(outcome.placed);
    softAfter = scorer.total(state.placed);
  }

  const placements: Placement[] = [];
  const locked = new Set((opts.locked ?? []).map(keyOf));
  for (const [key, at] of state.placed) {
    const u = units.get(key)!;
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
  for (const [key, at] of state.placed) {
    const u = units.get(key)!;
    for (const c of u.classIds) for (const s of at.pos.slotIds) covered.add(`${c}|${at.pos.day}|${s}`);
  }
  const gaps: Gap[] = [];
  for (const [classId, periods] of model.classPeriods)
    for (const pos of periods) if (!covered.has(`${classId}|${pos.day}|${pos.slotId}`)) gaps.push({ classId, day: pos.day, slotId: pos.slotId });

  const unplacedKeys = new Set(model.units.filter((u) => !state.placed.has(u.key)).map((u) => u.key));
  const reasons = new Map(outcome.unplaced.map((x) => [x.unit.key, x.reason]));
  let moved: number | null = null;
  if (start) {
    moved = 0;
    for (const pl of placements) {
      const was = start.get(keyOf(pl));
      if (!was || was.day !== pl.day || was.slotId !== pl.slotId) moved++;
    }
  }

  return {
    placements,
    unplaced: model.units
      .filter((u) => unplacedKeys.has(u.key))
      .map((u) => ({
        itemId: u.itemId,
        occurrence: u.occurrence,
        label: u.label,
        length: u.length,
        reason: reasons.get(u.key) ?? 'could not be placed',
        weight: u.weight,
      }))
      .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label)),
    gaps,
    check: checkTimetable(p, placements, { relaxedRules: !!opts.relaxRules }),
    soft: softReport(scorer, state.placed, model.names),
    stats: {
      units: model.units.length,
      placed: placements.length,
      iterations,
      ms: Date.now() - t0,
      stopped: outcome.stopped,
      seed,
      softBefore,
      softAfter,
      moved,
    },
    relaxedRules: !!opts.relaxRules,
  };
}

/** Soft-rule report for an existing timetable (e.g. after manual edits). */
export function scoreTimetable(p: Project, placements: Placement[]): SoftReport {
  const model = buildModel(p);
  const units = new Map(model.units.map((u) => [u.key, u]));
  const state = new SolverState(model);
  for (const pl of placements) {
    const u = units.get(keyOf(pl));
    const pos = u?.positions.find((x) => x.day === pl.day && x.slotId === pl.slotId);
    if (u && pos) state.place(u, pos, pl.roomId);
  }
  return softReport(new SoftScorer(p, model), state.placed, model.names);
}
