import type { Model, Position, Unit } from './model';
import { mulberry32 } from './rng';
import { SolverState, type Placed } from './state';

/**
 * Construction + conflict-directed repair (PLAN.md §5.1, step 1).
 *
 * Units are placed most-constrained first. When a unit has no free position,
 * the position whose blockers are cheapest to move is taken and the blockers
 * go back into the queue. Cheap = low weight (low-priority subjects and
 * self-study give way first) and not moved many times before (avoids
 * cycling). The best state seen is kept, so the result is always usable —
 * in shortage, low-priority lessons are the ones left unplaced.
 */

export interface SolveOptions {
  seed?: number;
  /** Repair steps before giving up on the remaining units. */
  maxIterations?: number;
  timeLimitMs?: number;
  /** Start from these positions where still valid and clash-free (improve / minimal-change). */
  initial?: Map<string, { day: string; slotId: string; roomId: string | null }>;
  /** Positions to prefer when placing (minimal-change reference). */
  prefer?: Map<string, { day: string; slotId: string }>;
}

export interface SolveHooks {
  onProgress?: (p: { placed: number; total: number; iteration: number }) => void;
  shouldStop?: () => boolean;
  /** Await between batches so a worker can receive "stop". */
  yieldEvery?: number;
}

export interface Unplaced {
  unit: Unit;
  reason: string;
}

export interface SolveOutcome {
  placed: Map<string, Placed>;
  unplaced: Unplaced[];
  iterations: number;
  stopped: boolean;
  ms: number;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function solve(model: Model, opts: SolveOptions = {}, hooks: SolveHooks = {}): Promise<SolveOutcome> {
  const t0 = Date.now();
  const rng = mulberry32(opts.seed ?? 1);
  const state = new SolverState(model);
  const placeable = model.units.filter((u) => u.positions.length > 0);
  const total = model.units.length;
  const maxIterations = opts.maxIterations ?? Math.max(3000, placeable.length * 60);
  const timeLimit = opts.timeLimitMs ?? 30_000;
  const yieldEvery = hooks.yieldEvery ?? 0;

  // Most constrained first: pinned, then fewest positions, longer, more resources.
  const difficulty = (u: Unit) =>
    (u.pinned ? -1e6 : 0) + u.positions.length - u.length * 8 - u.teacherIds.length * 3 - u.classIds.length * 2 - (u.roomTypeId ? 5 : 0);
  const queue = [...placeable].sort((a, b) => difficulty(a) - difficulty(b) || a.key.localeCompare(b.key));

  // Keep what already works (improve / minimal-change): those units skip the queue.
  let preplaced = 0;
  if (opts.initial) {
    for (const u of [...queue]) {
      const at = opts.initial.get(u.key);
      const pos = at && u.positions.find((x) => x.day === at.day && x.slotId === at.slotId);
      if (!pos) continue;
      const c = state.conflicts(u, pos, true);
      if (c.hard || c.blockers.size) continue;
      state.place(u, pos, u.roomTypeId ? (c.roomId ?? at.roomId) : at.roomId);
      preplaced += u.weight;
      queue.splice(queue.indexOf(u), 1);
    }
  }

  const moved = new Map<string, number>();
  const weightOf = (key: string) => state.units.get(key)?.weight ?? 1;
  let best: { weight: number; placed: Map<string, Placed> } = { weight: -1, placed: new Map() };
  let placedWeight = preplaced;

  const snapshot = () => {
    if (placedWeight > best.weight) best = { weight: placedWeight, placed: new Map(state.placed) };
  };

  /** Lower is better among free positions: spread subjects and daily load, heavy early, co-place multi-grade. */
  const score = (u: Unit, pos: Position) => {
    let s = rng() * 0.6;
    for (const c of u.classIds) {
      if (state.hasSubjectOnDay(c, pos.day, u.subjectKey)) s += 8;
      s += 0.4 * state.dayLoad(`c:${c}`, pos.day);
    }
    for (const t of u.teacherIds) {
      s += 0.3 * state.dayLoad(`t:${t}`, pos.day);
      if (u.multiGradeGroupId && state.multiGradeAt(t, pos.day, pos.start, u.multiGradeGroupId)) s -= 6;
    }
    if (u.heavy) s += 0.15 * pos.periodIndex;
    // R1: class teacher in P1, others leave it free.
    if (pos.periodIndex === 0) s += u.classTeacherLesson ? -6 : u.keepP1Free ? 3 : 0;
    const pref = opts.prefer?.get(u.key);
    if (pref && pref.day === pos.day && pref.slotId === pos.slotId) s -= 10;
    return s;
  };

  let iteration = 0;
  let stopped = false;
  while (queue.length > 0 && iteration < maxIterations) {
    if (hooks.shouldStop?.() || Date.now() - t0 > timeLimit) {
      stopped = !!hooks.shouldStop?.();
      break;
    }
    iteration++;
    const u = queue.shift()!;

    let bestFree: { pos: Position; roomId: string | null; s: number } | null = null;
    let bestRepair: { pos: Position; blockers: Set<string>; roomId: string | null; cost: number } | null = null;
    for (const pos of u.positions) {
      const c = state.conflicts(u, pos);
      if (c.hard) continue;
      if (c.blockers.size === 0) {
        const s = score(u, pos);
        if (!bestFree || s < bestFree.s) bestFree = { pos, roomId: c.roomId, s };
      } else if (!bestFree) {
        let cost = rng() * 0.5;
        for (const b of c.blockers) cost += weightOf(b) + 3 * (moved.get(b) ?? 0);
        if (!bestRepair || cost < bestRepair.cost) bestRepair = { pos, blockers: c.blockers, roomId: c.roomId, cost };
      }
    }

    if (bestFree) {
      state.place(u, bestFree.pos, bestFree.roomId);
      placedWeight += u.weight;
    } else if (bestRepair && (u.pinned || bestRepair.cost < u.weight + 12 + 4 * (moved.get(u.key) ?? 0))) {
      // A unit may push out others only if they are cheaper than it; each
      // failed attempt makes it more insistent, each move makes a blocker dearer.
      for (const key of bestRepair.blockers) {
        const b = state.units.get(key)!;
        state.remove(b);
        placedWeight -= b.weight;
        moved.set(key, (moved.get(key) ?? 0) + 1);
        queue.push(b);
      }
      // Room may now be free after evictions.
      const roomId = u.roomTypeId ? state.conflicts(u, bestRepair.pos).roomId : null;
      state.place(u, bestRepair.pos, roomId);
      placedWeight += u.weight;
    } else {
      // Too costly to force in right now; retry later (it may get cheaper).
      moved.set(u.key, (moved.get(u.key) ?? 0) + 1);
      if ((moved.get(u.key) ?? 0) < 25) queue.push(u);
    }
    snapshot();

    if (yieldEvery && iteration % yieldEvery === 0) {
      hooks.onProgress?.({ placed: state.placed.size, total, iteration });
      await tick();
    }
  }
  snapshot();

  // Report from the best state seen.
  const finalState = new SolverState(model);
  for (const [key, at] of best.placed) finalState.place(finalState.units.get(key)!, at.pos, at.roomId);
  const unplaced: Unplaced[] = model.units.filter((u) => !best.placed.has(u.key)).map((u) => ({ unit: u, reason: explain(finalState, u) }));
  hooks.onProgress?.({ placed: best.placed.size, total, iteration });
  return { placed: best.placed, unplaced, iterations: iteration, stopped, ms: Date.now() - t0 };
}

/** Why a unit could not be placed: the most common blockers across its possible positions. */
export function explain(state: SolverState, u: Unit): string {
  if (u.positions.length === 0) return u.noPositionReason ?? 'no possible time';
  const counts = new Map<string, number>();
  for (const pos of u.positions) {
    const c = state.conflicts(u, pos);
    for (const r of new Set(c.reasons)) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  if (counts.size === 0) return 'ran out of time while repairing — try Generate again or allow more time';
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return `no free time — ${top.map(([r, n]) => `${r} (${n} of ${u.positions.length} times)`).join(', ')}`;
}
