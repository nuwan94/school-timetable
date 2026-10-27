import { deleteEntity, deleteImpact, type EntityKind } from '@/domain/mutations';
import { useProjectStore } from '@/store/projectStore';
import { alertDialog, confirmDialog } from '@/ui/dialogs';

/** Delete with a confirmation that lists what else will change. */
export function useDelete() {
  const update = useProjectStore((s) => s.update);
  return async (kind: EntityKind, id: string, name: string) => {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const impact = deleteImpact(project, kind, id);
    const ok = await confirmDialog(`Delete "${name}"?`, {
      text: impact.length ? `This also affects:\n• ${impact.join('\n• ')}` : undefined,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      update((d) => deleteEntity(d, kind, id));
    } catch (e) {
      void alertDialog('Could not delete', e instanceof Error ? e.message : String(e));
    }
  };
}
