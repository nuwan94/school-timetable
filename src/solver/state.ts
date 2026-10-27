import type { Weekday } from '@/domain/time';
import type { Model, Position, Unit } from './model';

interface Entry {
  key: string;
  start: number;
  end: number;
  /** Multi-grade group of the unit (teacher overlap allowed within it). */
  mg: string | null;
}

export interface Placed {
  pos: Position;
  roomId: string | null;
}

export interface Conflicts {
  /** Placed units that would have to move for `unit` to go here. */
  blockers: Set<string>;
  /** A blocker that can't move (pinned unit, hard daily max). */
  hard: boolean;
  /** Human-readable reasons with counts, for "why unplaced" reports. */
  reasons: string[];
  /** Room chosen for a room-type requirement, when free. */
  roomId: string | null;
}

const rk = (resource: string, day: Weekday) => `${resource}|${day}`;
const overlapping = (list: Entry[] | undefined, start: number, end: number) =>
  (list ?? []).filter((e) => e.start < end && start < e.end);

/** Occupancy of classes, teachers and rooms, keyed by clock time. */
export class SolverState {
  readonly placed = new Map<string, Placed>();
  private occ = new Map<string, Entry[]>();
  /** class|day|subjectKey → unit keys on that day. */
  private subjectDay = new Map<string, string[]>();
  private load = new Map<string, number>();
  readonly units: Map<string, Unit>;

  constructor(private readonly model: Model) {
    this.units = new Map(model.units.map((u) => [u.key, u]));
  }

  private name(id: string) {
    return this.model.names.get(id) ?? '?';
  }

  conflicts(u: Unit, pos: Position, stopAtFirst = false): Conflicts {
    const blockers = new Set<string>();
    const reasons: string[] = [];
    let hard = false;
    const block = (keys: string[], reason: string) => {
      if (keys.length === 0) return;
      reasons.push(reason);
      for (const k of keys) {
        if (k === u.key) continue;
        blockers.add(k);
        if (this.units.get(k)?.pinned) hard = true;
      }
    };
    const done = () => stopAtFirst && (blockers.size > 0 || hard);

    for (const c of u.classIds) {
      block(overlapping(this.occ.get(rk(`c:${c}`, pos.day)), pos.start, pos.end).map((e) => e.key), `${this.name(c)} busy`);
      if (u.oncePerDay) block(this.subjectDay.get(`${c}|${pos.day}|${u.subjectKey}`) ?? [], `${this.name(c)} already has it that day`);
      if (done()) return { blockers, hard, reasons, roomId: null };
    }
    for (const t of u.teacherIds) {
      const hits = overlapping(this.occ.get(rk(`t:${t}`, pos.day)), pos.start, pos.end).filter(
        (e) => !(u.multiGradeGroupId && e.mg === u.multiGradeGroupId),
      );
      block(hits.map((e) => e.key), `${this.name(t)} busy`);
      const max = this.model.teacherDailyMax.get(t);
      if (max !== undefined && (this.load.get(`t:${t}|${pos.day}`) ?? 0) + u.length > max) {
        hard = true;
        reasons.push(`${this.name(t)} at daily maximum`);
      }
      if (done()) return { blockers, hard, reasons, roomId: null };
    }
    for (const r of u.fixedRoomIds) {
      const hits = overlapping(this.occ.get(rk(`r:${r}`, pos.day)), pos.start, pos.end);
      if (hits.length >= (this.model.roomConcurrent.get(r) ?? 1)) block(hits.map((e) => e.key), `${this.name(r)} full`);
    }
    let roomId: string | null = null;
    if (u.roomTypeId) {
      const rooms = this.model.roomsByType.get(u.roomTypeId) ?? [];
      let fewest: Entry[] | null = null;
      for (const r of rooms) {
        const hits = overlapping(this.occ.get(rk(`r:${r}`, pos.day)), pos.start, pos.end);
        if (hits.length < (this.model.roomConcurrent.get(r) ?? 1)) {
          roomId = r;
          break;
        }
        if (!fewest || hits.length < fewest.length) fewest = hits;
      }
      if (!roomId && fewest) block(fewest.map((e) => e.key), `no ${rooms.length > 1 ? 'room' : this.name(rooms[0]!)} free`);
    }
    return { blockers, hard, reasons, roomId };
  }

  place(u: Unit, pos: Position, roomId: string | null): void {
    const entry = (): Entry => ({ key: u.key, start: pos.start, end: pos.end, mg: u.multiGradeGroupId });
    const add = (res: string) => {
      const k = rk(res, pos.day);
      const list = this.occ.get(k);
      if (list) list.push(entry());
      else this.occ.set(k, [entry()]);
      this.load.set(k, (this.load.get(k) ?? 0) + u.length);
    };
    for (const c of u.classIds) {
      add(`c:${c}`);
      const sk = `${c}|${pos.day}|${u.subjectKey}`;
      this.subjectDay.set(sk, [...(this.subjectDay.get(sk) ?? []), u.key]);
    }
    for (const t of u.teacherIds) add(`t:${t}`);
    for (const r of u.fixedRoomIds) add(`r:${r}`);
    if (roomId) add(`r:${roomId}`);
    this.placed.set(u.key, { pos, roomId });
  }

  remove(u: Unit): void {
    const at = this.placed.get(u.key);
    if (!at) return;
    const { pos, roomId } = at;
    const drop = (res: string) => {
      const k = rk(res, pos.day);
      const list = this.occ.get(k);
      if (list) this.occ.set(k, list.filter((e) => e.key !== u.key));
      this.load.set(k, (this.load.get(k) ?? 0) - u.length);
    };
    for (const c of u.classIds) {
      drop(`c:${c}`);
      const sk = `${c}|${pos.day}|${u.subjectKey}`;
      this.subjectDay.set(sk, (this.subjectDay.get(sk) ?? []).filter((k) => k !== u.key));
    }
    for (const t of u.teacherIds) drop(`t:${t}`);
    for (const r of u.fixedRoomIds) drop(`r:${r}`);
    if (roomId) drop(`r:${roomId}`);
    this.placed.delete(u.key);
  }

  /** Periods already placed for a class or teacher on a day. */
  dayLoad(resource: string, day: Weekday): number {
    return this.load.get(rk(resource, day)) ?? 0;
  }

  hasSubjectOnDay(classId: string, day: Weekday, subjectKey: string): boolean {
    return (this.subjectDay.get(`${classId}|${day}|${subjectKey}`)?.length ?? 0) > 0;
  }

  /** Does a teacher already teach a unit of this multi-grade group starting at `start`? */
  multiGradeAt(teacherId: string, day: Weekday, start: number, mg: string): boolean {
    return (this.occ.get(rk(`t:${teacherId}`, day)) ?? []).some((e) => e.mg === mg && e.start === start);
  }

  isClassFree(classId: string, pos: Position): boolean {
    return overlapping(this.occ.get(rk(`c:${classId}`, pos.day)), pos.start, pos.end).length === 0;
  }
}
