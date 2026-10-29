import { loadProject } from '@/domain/migrations';
import type { Project } from '@/domain/project';
import { tx } from '@/i18n';

/**
 * Project file I/O. Uses the File System Access API where available (Chrome/Edge
 * desktop) so "Save" writes back to the same file; elsewhere (Firefox, Safari,
 * phones, file://) falls back to <input type=file> and a download.
 */

export const FILE_EXTENSION = '.ttb';
const PICKER_TYPES = [
  {
    get description() { return tx('Timetable project'); },
    accept: { 'application/json': [FILE_EXTENSION, '.json'] },
  },
];

// Minimal typings for the parts of the File System Access API we use.
export interface WritableHandle {
  name: string;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}
interface ReadableHandle extends WritableHandle {
  getFile(): Promise<File>;
}
interface FsWindow {
  showOpenFilePicker?: (opts: unknown) => Promise<ReadableHandle[]>;
  showSaveFilePicker?: (opts: unknown) => Promise<WritableHandle>;
}
const fsWindow = (): FsWindow => window as unknown as FsWindow;

export function supportsFileHandles(): boolean {
  return typeof window !== 'undefined' && typeof fsWindow().showSaveFilePicker === 'function';
}

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 1);
}

export function parseProjectText(text: string): Project {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(tx('This file is not a timetable project (it is not valid JSON).'));
  }
  return loadProject(json);
}

/** e.g. "Timetable_2027_T1_2026-11-03.ttb". */
export function suggestedFileName(p: Project, today = new Date()): string {
  const clean = (s: string) => s.trim().replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '');
  const parts = ['Timetable', clean(p.institute.academicYear), clean(p.institute.term)].filter(Boolean);
  const date = today.toISOString().slice(0, 10);
  return `${parts.join('_')}_${date}${FILE_EXTENSION}`;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export interface OpenResult {
  project: Project;
  fileName: string;
  handle: WritableHandle | null;
}

/** Returns null if the user cancelled. */
export async function openProjectFile(): Promise<OpenResult | null> {
  const w = fsWindow();
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: PICKER_TYPES, multiple: false });
      if (!handle) return null;
      const file = await handle.getFile();
      return { project: parseProjectText(await file.text()), fileName: file.name, handle };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  const file = await pickFileWithInput(`${FILE_EXTENSION},.json,application/json`);
  if (!file) return null;
  return { project: parseProjectText(await file.text()), fileName: file.name, handle: null };
}

export interface SaveResult {
  fileName: string;
  handle: WritableHandle | null;
}

/**
 * Save to `handle` if given (plain Save), otherwise ask where to save (Save As).
 * Returns null if the user cancelled.
 */
export async function saveProjectFile(
  p: Project,
  handle: WritableHandle | null,
): Promise<SaveResult | null> {
  const blob = new Blob([serializeProject(p)], { type: 'application/json' });
  const w = fsWindow();
  if (handle || w.showSaveFilePicker) {
    try {
      const target =
        handle ?? (await w.showSaveFilePicker!({ suggestedName: suggestedFileName(p), types: PICKER_TYPES }));
      const writable = await target.createWritable();
      await writable.write(blob);
      await writable.close();
      return { fileName: target.name, handle: target };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  const fileName = suggestedFileName(p);
  downloadBlob(blob, fileName);
  return { fileName, handle: null };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function pickFileWithInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // 'cancel' fires in modern browsers when the dialog is dismissed.
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
