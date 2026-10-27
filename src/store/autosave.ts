import Dexie, { type Table } from 'dexie';
import type { Project } from '@/domain/project';
import { parseProjectText, serializeProject } from '@/io/projectFile';

/**
 * Autosave / crash recovery. IndexedDB keeps the last few snapshots so a power
 * cut or closed tab never loses work. It is a safety net only — the project
 * file is the real store (browser data can be cleared).
 */

export interface Snapshot {
  id?: number;
  projectId: string;
  schoolName: string;
  fileName: string | null;
  savedAt: string;
  /** True if the snapshot has changes not yet saved to a project file. */
  unsaved: boolean;
  json: string;
}

export class AutosaveDb extends Dexie {
  snapshots!: Table<Snapshot, number>;
  constructor(name = 'timetable-autosave') {
    super(name);
    this.version(1).stores({ snapshots: '++id, projectId, savedAt' });
  }
}

export const KEEP_PER_PROJECT = 10;

export class Autosave {
  constructor(private readonly db: AutosaveDb = new AutosaveDb()) {}

  async write(project: Project, fileName: string | null, unsaved: boolean): Promise<void> {
    await this.db.transaction('rw', this.db.snapshots, async () => {
      await this.db.snapshots.add({
        projectId: project.id,
        schoolName: project.institute.name,
        fileName,
        savedAt: new Date().toISOString(),
        unsaved,
        json: serializeProject(project),
      });
      const ids = await this.db.snapshots.where('projectId').equals(project.id).sortBy('savedAt');
      const excess = ids.length - KEEP_PER_PROJECT;
      if (excess > 0) await this.db.snapshots.bulkDelete(ids.slice(0, excess).map((s) => s.id!));
    });
  }

  /** Most recent snapshot overall (what to offer on startup). */
  async latest(): Promise<Snapshot | undefined> {
    return this.db.snapshots.orderBy('savedAt').last();
  }

  async list(projectId?: string): Promise<Snapshot[]> {
    const all = projectId
      ? await this.db.snapshots.where('projectId').equals(projectId).sortBy('savedAt')
      : await this.db.snapshots.orderBy('savedAt').toArray();
    return all.reverse();
  }

  restore(snapshot: Snapshot): Project {
    return parseProjectText(snapshot.json);
  }

  async clear(): Promise<void> {
    await this.db.snapshots.clear();
  }
}

/** Calls `fn` once `ms` has passed without another call; `flush` runs it now. */
export function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    timer = null;
    fn();
  };
  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, ms);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        run();
      }
    },
  };
}
