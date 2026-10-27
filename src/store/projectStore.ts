import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import type { Pack } from '@/domain/common';
import type { Project } from '@/domain/project';
import type { WritableHandle } from '@/io/projectFile';
import { createProject } from '@/packs';

export interface ProjectState {
  project: Project | null;
  /** Name of the file on disk this project was opened from / saved to. */
  fileName: string | null;
  /** File System Access handle for in-place Save (Chrome/Edge only). */
  handle: WritableHandle | null;
  /** Changes since the last save to a project file. */
  dirty: boolean;
  /** Bumped on every edit; autosave watches it. */
  revision: number;

  newProject(pack: Pack, schoolName: string): void;
  /** Replace the current project (open file, recover snapshot). */
  load(project: Project, source: { fileName: string | null; handle: WritableHandle | null; dirty?: boolean }): void;
  update(recipe: (draft: Draft<Project>) => void): void;
  markSaved(fileName: string, handle: WritableHandle | null): void;
  close(): void;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  project: null,
  fileName: null,
  handle: null,
  dirty: false,
  revision: 0,

  newProject(pack, schoolName) {
    set({
      project: createProject(pack, schoolName),
      fileName: null,
      handle: null,
      dirty: true,
      revision: get().revision + 1,
    });
  },

  load(project, { fileName, handle, dirty = false }) {
    set({ project, fileName, handle, dirty, revision: get().revision + 1 });
  },

  update(recipe) {
    const current = get().project;
    if (!current) return;
    const next = produce(current, (draft) => {
      recipe(draft);
      draft.updatedAt = new Date().toISOString();
    });
    if (next === current) return;
    set({ project: next, dirty: true, revision: get().revision + 1 });
  },

  markSaved(fileName, handle) {
    set({ fileName, handle, dirty: false });
  },

  close() {
    set({ project: null, fileName: null, handle: null, dirty: false, revision: get().revision + 1 });
  },
}));
