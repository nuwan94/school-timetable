import type { Weekday } from '@/domain/time';
import type { Model, Position, Unit } from './model';
import { mulberry32 } from './rng';
import type { SoftScorer } from './soft';
import type { Placed, SolverState } from './state';

/**
 * Optimisation pass (PLAN.md §5.1 step 2): simulated annealing over moves
 * and swaps. Every candidate is checked against the occupancy state first,
 * so hard constraints are never broken. Minimal-change runs add a penalty
 * for each lesson that leaves its reference position.
 */

export interface OptimiseOptions {
  seed?: number;
  timeLimitMs?: number;
  maxIterations?: number;
  /** Reference positions (unit key → day/slot) for minimal-change. */
  reference?: Map<string, { day: Weekday; slotId: string }>;
  /** Penalty per lesson moved away from its reference position. */
  changeWeight?: number;
}

export interface OptimiseHooks {
  onProgress?: (p: { iteration: number; score: number }) => void;
  shouldStop?: () => boolean;
  yieldEvery?: number;
}

export interface OptimiseOutcome {
  before: number;
  after: number;
  iterations: number;
  accepted: number;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function optimise(
  model: Model,
  state: SolverState,
  scorer: SoftScorer,
  opts: OptimiseOptions = {},
  hooks: OptimiseHooks = {},
): Promise<OptimiseOutcome> {
  const t0 = Date.now();
  const rng = mulberry32((opts.seed ?? 1) ^ 0x9e3779b9);
  const units = new Map(model.units.map((u) => [u.key, u]));
  const movable = model.units.filter((u) => !u.pinned && u.positions.length > 1 && state.placed.has(u.key));
  const ref = opts.reference;
  const cw = ref ? (opts.changeWeight ?? 30) : 0;
  const changeCost = (u: Unit, pos: Pick<Position, 'day' | 'slotId'>) => {
    const r = ref?.get(u.key);
    return r && (r.day !== pos.day || r.slotId !== pos.slotId) ? cw : 0;
  };
  const placed = state.placed;
  let current = scorer.total(placed);
  for (const [k, at] of placed) current += changeCost(units.get(k)!, at.pos);
  const before = current;
  let best = current;
  let bestPlaced: Map<string, Placed> = new Map(placed);
  const maxIterations = opts.maxIterations ?? Math.min(80_000, Math.max(5_000, movable.length * 40));
  const timeLimit = opts.timeLimitMs ?? 4_000;
  const T0 = 12;
  const T1 = 0.05;
  let iteration = 0;
  let accepted = 0;
  if (!movable.length) return { before, after: before, iterations: 0, accepted: 0 };

  const restore = (moves: [Unit, Placed | undefined][]) => {
    for (const [u] of moves) if (state.placed.has(u.key)) state.remove(u);
    for (const [u, at] of moves) if (at) state.place(u, at.pos, at.roomId);
  };

  while (iteration < maxIterations) {
    if (iteration % 256 === 0) {
      if (hooks.shouldStop?.() || Date.now() - t0 > timeLimit) break;
    }
    iteration++;
    const T = T0 * Math.pow(T1 / T0, iteration / maxIterations);
    const u = movable[Math.floor(rng() * movable.length)]!;
    const from = placed.get(u.key);
    if (!from) continue;
    const pos = u.positions[Math.floor(rng() * u.positions.length)]!;
    if (pos.day === from.pos.day && pos.slotId === from.pos.slotId) continue;

    // Which kind of change is possible here?
    state.remove(u);
    const c = state.conflicts(u, pos);
    state.place(u, from.pos, from.roomId);
    if (c.hard || c.blockers.size > 1) continue;

    let other: Unit | undefined;
    let otherFrom: Placed | undefined;
    let otherPos: Position | undefined;
    if (c.blockers.size === 1) {
      other = units.get([...c.blockers][0]!);
      otherFrom = other && placed.get(other.key);
      if (!other || !otherFrom || other.pinned || other.length !== u.length) continue;
      otherPos = other.positions.find((x) => x.day === from.pos.day && x.slotId === from.pos.slotId);
      if (!otherPos) continue;
    }

    const touched = other ? [u, other] : [u];
    const days = [from.pos.day, pos.day];
    const scoreBefore = scorer.local(touched, days, placed) + changeCost(u, from.pos) + (other ? changeCost(other, otherFrom!.pos) : 0);

    const undo: [Unit, Placed | undefined][] = [[u, from]];
    state.remove(u);
    if (other) {
      undo.push([other, otherFrom]);
      state.remove(other);
    }
    const cu = state.conflicts(u, pos);
    if (cu.hard || cu.blockers.size) {
      restore(undo);
      continue;
    }
    state.place(u, pos, u.roomTypeId ? cu.roomId : from.roomId);
    if (other) {
      const co = state.conflicts(other, otherPos!);
      if (co.hard || co.blockers.size) {
        restore(undo);
        continue;
      }
      state.place(other, otherPos!, other.roomTypeId ? co.roomId : otherFrom!.roomId);
    }
    const scoreAfter = scorer.local(touched, days, placed) + changeCost(u, pos) + (other ? changeCost(other, otherPos!) : 0);
    const delta = scoreAfter - scoreBefore;
    if (delta <= 0 || rng() < Math.exp(-delta / T)) {
      current += delta;
      accepted++;
      if (current < best - 1e-9) {
        best = current;
        bestPlaced = new Map(placed);
      }
    } else restore(undo);

    if (hooks.yieldEvery && iteration % hooks.yieldEvery === 0) {
      hooks.onProgress?.({ iteration, score: current });
      await tick();
    }
  }

  // Leave the state at the best arrangement found.
  if (best < current) {
    for (const u of model.units) if (state.placed.has(u.key)) state.remove(u);
    for (const [k, at] of bestPlaced) state.place(units.get(k)!, at.pos, at.roomId);
  }
  return { before, after: best, iterations: iteration, accepted };
}
