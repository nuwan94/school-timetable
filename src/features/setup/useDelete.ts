import { deleteEntity, deleteImpact, type EntityKind } from '@/domain/mutations';
import { useProjectStore } from '@/store/projectStore';
import { alertDialog, confirmDialog } from '@/ui/dialogs';
import { tx } from '@/i18n';

/** Delete with a confirmation that lists what else will change. */
export function useDelete() {
  const update = useProjectStore((s) => s.update);
  return async (kind: EntityKind, id: string, name: string) => {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const impact = deleteImpact(project, kind, id);
    const ok = await confirmDialog(tx('Delete "{name}"?', { name }), {
      text: impact.length ? tx('This also affects:\n• {join}', { join: impact.join('\n• ') }) : undefined,
      confirmText: tx('Delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      update((d) => deleteEntity(d, kind, id));
    } catch (e) {
      void alertDialog(tx('Could not delete'), e instanceof Error ? e.message : String(e));
    }
  };
}
