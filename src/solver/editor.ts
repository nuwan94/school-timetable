import { numParam, ruleFor } from '@/domain/rules';
import type { Project } from '@/domain/project';
import type { Placement } from '@/domain/schedule';
import type { Weekday } from '@/domain/time';
import { buildModel, positionsFor, type Model, type Position, type Unit } from './model';
import { scheduleForClass } from '@/domain/checks';
import { SolverState } from './state';
import { dayShort, tx } from '@/i18n';

/**
 * Manual editing support (PLAN.md §6). Reuses the solver's model and
 * occupancy state so the editor and generator agree on what a clash is.
 * Clashes are allowed while editing; the verdicts only colour the targets.
 */

export type Level = 'ok' | 'soft' | 'clash' | 'invalid';

export interface Verdict {
  level: Level;
  reasons: string[];
  /** Lessons in the way (keys). */
  blockers: string[];
  /** Room to use when the lesson needs a room type. */
  roomId: string | null;
}

export interface Step {
  key: string;
  day: Weekday;
  slotId: string;
}

export interface Suggestion {
  kind: 'move' | 'swap' | 'chain';
  description: string;
  steps: Step[];
  /** Names of every teacher whose timetable changes. */
  teachers: string[];
}

export const keyOf = (pl: Pick<Placement, 'itemId' | 'occurrence'>) => `${pl.itemId}#${pl.occurrence}`;


export class EditSession {
  readonly model: Model;
  readonly units: Map<string, Unit>;
  private state: SolverState;
  private placements: Map<string, Placement>;
  private softOncePerDay: boolean;
  private softMax: number | null;
  private slotLabel = new Map<string, string>();

  constructor(
    private readonly p: Project,
    placements: readonly Placement[],
  ) {
    this.model = buildModel(p);
    this.units = new Map(this.model.units.map((u) => [u.key, u]));
    this.state = new SolverState(this.model);
    this.placements = new Map();
    for (const pl of placements) {
      const u = this.units.get(keyOf(pl));
      const pos = u && this.positionAt(u, pl.day, pl.slotId);
      if (!u || !pos) continue;
      this.state.place(u, pos, pl.roomId);
      this.placements.set(u.key, pl);
    }
    const r4 = ruleFor(p, 'R4');
    this.softOncePerDay = !!r4 && r4.strength !== 'hard';
    const r12 = ruleFor(p, 'R12');
    this.softMax = r12 && r12.strength !== 'hard' ? numParam(r12, 'maxPerDay', 7) : null;
    for (const b of p.bellSchedules) for (const s of b.slots) this.slotLabel.set(s.id, s.label);
    for (const b of p.bellSchedules) for (const list of Object.values(b.dayOverrides)) for (const s of list ?? []) this.slotLabel.set(s.id, s.label);
  }

  private name(id: string) {
    return this.model.names.get(id) ?? '?';
  }

  label(key: string) {
    return this.units.get(key)?.label ?? key;
  }

  where(step: Pick<Step, 'day' | 'slotId'>) {
    return `${dayShort(step.day)} ${this.slotLabel.get(step.slotId) ?? ''}`.trim();
  }

  /** Any run of the right length starting at this slot, ignoring teacher availability. */
  private positionAt(u: Unit, day: Weekday, slotId: string): Position | undefined {
    const valid = u.positions.find((x) => x.day === day && x.slotId === slotId);
    if (valid) return valid;
    const cls = this.p.classes.find((c) => c.id === u.classIds[0]);
    const schedule = cls && scheduleForClass(this.p, cls);
    return schedule ? positionsFor(schedule, [day], u.length).find((x) => x.slotId === slotId) : undefined;
  }

  placementOf(key: string) {
    return this.placements.get(key);
  }

  /** Lessons that exist in the setup but are not on the timetable (the tray). */
  unplaced(): Unit[] {
    return this.model.units.filter((u) => !this.placements.has(u.key));
  }

  /** How good would it be to put lesson `key` at day/slot, with `ignore` lessons out of the way? */
  verdict(key: string, day: Weekday, slotId: string, ignore: readonly string[] = []): Verdict {
    const u = this.units.get(key);
    if (!u) return { level: 'invalid', reasons: ['unknown lesson'], blockers: [], roomId: null };
    if (!this.model.days.includes(day)) return { level: 'invalid', reasons: ['not a school day'], blockers: [], roomId: null };
    const pos = this.positionAt(u, day, slotId);
    if (!pos)
      return {
        level: 'invalid',
        reasons: [u.length > 1 ? 'a double period does not fit here (break or end of day)' : 'not a teaching period'],
        blockers: [],
        roomId: null,
      };

    const lifted = [key, ...ignore].filter((k) => this.state.placed.has(k));
    const saved = lifted.map((k) => [k, this.state.placed.get(k)!] as const);
    for (const k of lifted) this.state.remove(this.units.get(k)!);
    try {
      const c = this.state.conflicts(u, pos);
      const reasons = [...c.reasons];
      let level: Level = c.blockers.size || c.hard ? 'clash' : 'ok';
      if (!u.positions.includes(pos) && !u.positions.some((x) => x.day === day && x.slotId === slotId)) {
        level = 'clash';
        reasons.push(tx('{names} not available', { names: u.teacherIds.map((t) => this.name(t)).join('/') }));
      }
      if (level === 'ok') {
        if (this.softOncePerDay && u.classIds.some((cl) => this.state.hasSubjectOnDay(cl, day, u.subjectKey)))
          reasons.push(tx('already has {subject} that day', { subject: u.label.split(' ').slice(1).join(' ') || tx('this subject') }));
        if (this.softMax !== null)
          for (const t of u.teacherIds) {
            const load = this.state.dayLoad(`t:${t}`, day) + u.length;
            if (load > this.softMax) reasons.push(tx('{name} would teach {load} periods (max {softMax})', { name: this.name(t), load, softMax: this.softMax }));
          }
        if (reasons.length) level = 'soft';
      }
      return { level, reasons, blockers: [...c.blockers], roomId: c.roomId };
    } finally {
      for (const [k, at] of saved) this.state.place(this.units.get(k)!, at.pos, at.roomId);
    }
  }

  /** Verdict for every start slot of the lesson's class week, keyed `${day}|${slotId}`. */
  targets(key: string): Map<string, Verdict> {
    const u = this.units.get(key);
    const out = new Map<string, Verdict>();
    if (!u) return out;
    const cls = this.p.classes.find((c) => c.id === u.classIds[0]);
    const schedule = cls && scheduleForClass(this.p, cls);
    if (!schedule) return out;
    for (const pos of positionsFor(schedule, this.model.days, 1)) out.set(`${pos.day}|${pos.slotId}`, this.verdict(key, pos.day, pos.slotId));
    return out;
  }

  private teachersOf(keys: string[]) {
    return [...new Set(keys.flatMap((k) => this.units.get(k)?.teacherIds ?? []))].map((t) => this.name(t));
  }

  /**
   * Ways to move a lesson without clashes: free moves, single swaps with one
   * blocking lesson, and 2-step chains (the blocker moves to a free slot first).
   */
  suggestions(key: string, limit = 12): Suggestion[] {
    const u = this.units.get(key);
    const at = this.placements.get(key);
    if (!u) return [];
    const out: Suggestion[] = [];
    const seen = new Set<string>();
    const add = (s: Suggestion) => {
      const id = s.steps.map((x) => `${x.key}@${x.day}|${x.slotId}`).join(',');
      if (!seen.has(id)) {
        seen.add(id);
        out.push(s);
      }
    };
    const here = (st: Pick<Step, 'day' | 'slotId'>) => !!at && st.day === at.day && st.slotId === at.slotId;

    for (const pos of u.positions) {
      if (here(pos)) continue;
      const v = this.verdict(key, pos.day, pos.slotId);
      if (v.level === 'ok')
        add({ kind: 'move', description: tx('Move to {where}', { where: this.where(pos) }), steps: [{ key, day: pos.day, slotId: pos.slotId }], teachers: this.teachersOf([key]) });
    }
    const moves = out.splice(0, Math.ceil(limit / 2));
    out.length = 0;

    for (const pos of u.positions) {
      if (here(pos) || out.length >= limit) continue;
      const v = this.verdict(key, pos.day, pos.slotId);
      if (v.level !== 'clash' || v.blockers.length !== 1) continue;
      const b = v.blockers[0]!;
      const bu = this.units.get(b);
      const bat = this.placements.get(b);
      if (!bu || !bat || bat.locked) continue;
      // Swapping two lessons of the same subject and teachers changes nothing.
      if (bu.subjectKey === u.subjectKey && bu.length === u.length && bu.teacherIds.join() === u.teacherIds.join()) continue;
      // Single swap: the blocker takes this lesson's old place.
      if (at) {
        const back = this.verdictWith(b, at.day, at.slotId, key, pos);
        if (back.level === 'ok')
          add({
            kind: 'swap',
            description: tx('Swap with {label} ({where} ↔ {where2})', { label: bu.label, where: this.where(bat), where2: this.where(at) }),
            steps: [
              { key, day: pos.day, slotId: pos.slotId },
              { key: b, day: at.day, slotId: at.slotId },
            ],
            teachers: this.teachersOf([key, b]),
          });
      }
      // Chain: the blocker moves to a free slot, then this lesson takes its place.
      for (const bpos of bu.positions) {
        if (bpos.day === bat.day && bpos.slotId === bat.slotId) continue;
        if (at && bpos.day === at.day && bpos.slotId === at.slotId) continue; // that is the swap
        const vb = this.verdictWith(b, bpos.day, bpos.slotId, key, pos);
        if (vb.level !== 'ok') continue;
        add({
          kind: 'chain',
          description: tx('Move {label} to {where}, then this to {where2}', { label: bu.label, where: this.where(bpos), where2: this.where(pos) }),
          steps: [
            { key: b, day: bpos.day, slotId: bpos.slotId },
            { key, day: pos.day, slotId: pos.slotId },
          ],
          teachers: this.teachersOf([key, b]),
        });
        break;
      }
    }
    return [...moves, ...out].slice(0, limit);
  }

  /** Verdict for `key` at day/slot when `other` has already moved to `otherPos`. */
  private verdictWith(key: string, day: Weekday, slotId: string, other: string, otherPos: Position): Verdict {
    const ou = this.units.get(other)!;
    const prev = this.state.placed.get(other);
    if (prev) this.state.remove(ou);
    this.state.place(ou, otherPos, prev?.roomId ?? null);
    try {
      return this.verdict(key, day, slotId);
    } finally {
      this.state.remove(ou);
      if (prev) this.state.place(ou, prev.pos, prev.roomId);
    }
  }
}

/**
 * Applies steps to a placement list (pure). New placements are created for
 * lessons coming from the tray. Rooms of room-type lessons are re-picked.
 */
export function applySteps(session: EditSession, placements: readonly Placement[], steps: readonly Step[]): Placement[] {
  const next = new Map(placements.map((pl) => [keyOf(pl), pl]));
  const moved: string[] = [];
  for (const st of steps) {
    const u = session.units.get(st.key);
    if (!u) continue;
    const v = session.verdict(st.key, st.day, st.slotId, moved);
    const prev = next.get(st.key);
    next.set(st.key, {
      itemId: u.itemId,
      occurrence: u.occurrence,
      day: st.day,
      slotId: st.slotId,
      roomId: u.roomTypeId ? (v.roomId ?? prev?.roomId ?? null) : (prev?.roomId ?? null),
      locked: prev?.locked ?? false,
    });
    moved.push(st.key);
  }
  return [...next.values()];
}

export const removePlacement = (placements: readonly Placement[], key: string) => placements.filter((pl) => keyOf(pl) !== key);

export const toggleLock = (placements: readonly Placement[], key: string) =>
  placements.map((pl) => (keyOf(pl) === key ? { ...pl, locked: !pl.locked } : pl));
