import { deleteEntity, deleteImpact, type EntityKind } from '@/domain/mutations';
import { useProjectStore } from '@/store/projectStore';

/** Delete with a confirmation that lists what else will change. */
export function useDelete() {
  const update = useProjectStore((s) => s.update);
  return (kind: EntityKind, id: string, name: string) => {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const impact = deleteImpact(project, kind, id);
    const msg = impact.length ? `Delete "${name}"?\n\nThis also affects:\n• ${impact.join('\n• ')}` : `Delete "${name}"?`;
    if (!confirm(msg)) return;
    try {
      update((d) => deleteEntity(d, kind, id));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };
}
