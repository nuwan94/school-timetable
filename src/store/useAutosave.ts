import { useEffect, useMemo } from 'react';
import { Autosave, debounce } from './autosave';
import { useProjectStore } from './projectStore';

export const autosave = new Autosave();

/** Snapshot to IndexedDB shortly after every edit, and immediately when the tab is hidden. */
export function useAutosave(): void {
  const revision = useProjectStore((s) => s.revision);

  const writer = useMemo(
    () =>
      debounce(() => {
        const { project, fileName, dirty } = useProjectStore.getState();
        if (project) void autosave.write(project, fileName, dirty).catch(console.error);
      }, 800),
    [],
  );

  useEffect(() => {
    if (revision > 0 && useProjectStore.getState().project) writer.schedule();
  }, [revision, writer]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') writer.flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      writer.flush();
      if (useProjectStore.getState().dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [writer]);
}
