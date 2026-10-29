import { useCallback, useEffect, useState } from 'react';
import { ProjectFileError } from '@/domain/migrations';
import { openProjectFile, saveProjectFile } from '@/io/projectFile';
import { useProjectStore } from '@/store/projectStore';
import { confirmDiscard } from '@/ui/dialogs';
import { tx } from '@/i18n';

export interface FileError {
  message: string;
  details: string[];
}

function toFileError(e: unknown): FileError {
  if (e instanceof ProjectFileError) return { message: e.message, details: e.details };
  return { message: e instanceof Error ? e.message : String(e), details: [] };
}

/** Open / Save / Save As, plus Ctrl+S / Ctrl+O shortcuts. */
export function useFileCommands() {
  const [error, setError] = useState<FileError | null>(null);

  const open = useCallback(async () => {
    const { dirty } = useProjectStore.getState();
    if (dirty && !(await confirmDiscard(tx('Open another file')))) return;
    try {
      const result = await openProjectFile();
      if (result) {
        useProjectStore.getState().load(result.project, { fileName: result.fileName, handle: result.handle });
        setError(null);
      }
    } catch (e) {
      setError(toFileError(e));
    }
  }, []);

  const save = useCallback(async (saveAs = false) => {
    const { project, handle, markSaved } = useProjectStore.getState();
    if (!project) return;
    try {
      const result = await saveProjectFile(project, saveAs ? null : handle);
      if (result) {
        markSaved(result.fileName, result.handle);
        setError(null);
      }
    } catch (e) {
      setError(toFileError(e));
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        void save(e.shiftKey);
      } else if (key === 'o') {
        e.preventDefault();
        void open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, save]);

  return { open, save, error, clearError: () => setError(null) };
}
