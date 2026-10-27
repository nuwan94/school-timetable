import { useEffect, useState } from 'react';
import type { Snapshot } from '@/store/autosave';
import { useProjectStore } from '@/store/projectStore';
import { autosave } from '@/store/useAutosave';
import { alertDialog } from '@/ui/dialogs';

/** The latest autosave snapshot (if any) and a way to restore it. */
export function useRecovery() {
  const load = useProjectStore((s) => s.load);
  const [recovery, setRecovery] = useState<Snapshot | null>(null);

  useEffect(() => {
    autosave
      .latest()
      .then((s) => setRecovery(s ?? null))
      .catch(() => setRecovery(null));
  }, []);

  const recover = () => {
    if (!recovery) return false;
    try {
      load(autosave.restore(recovery), { fileName: recovery.fileName, handle: null, dirty: recovery.unsaved });
      return true;
    } catch (e) {
      void alertDialog('Could not recover', e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  return { recovery, recover, dismiss: () => setRecovery(null) };
}
