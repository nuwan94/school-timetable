import { useState } from 'react';
import { addMultiGradeGroup, mergeClasses, setMergeExceptions, unmergeClasses } from '@/domain/mutations';
import { useProjectStore } from '@/store/projectStore';
import { Card, Chips, IconButton, TextInput, TrashIcon } from '@/ui/kit';
import { ClassPicker, classNames } from './ClassPicker';
import { confirmDialog } from '@/ui/dialogs';

type Kind = 'merge' | 'multigrade';

/**
 * Small-school structures: merged classes (low numbers, taught as one class
 * except for listed subjects) and multi-grade groups (one teacher and room
 * holding several grades at once, each grade with its own lesson).
 */
export function TaughtTogether() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [kind, setKind] = useState<Kind>('merge');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const subjectOptions = project.subjects.map((s) => ({ value: s.id, label: s.shortCode || s.name, title: s.name }));

  const add = () => {
    try {
      const name = classNames(project, classIds).replace(/, /g, ' + ');
      update((d) => {
        if (kind === 'merge') mergeClasses(d, { name, classIds, exceptSubjectIds: [] });
        else addMultiGradeGroup(d, { name, classIds });
      });
      setClassIds([]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card title="Classes taught together">
      <p className="mb-3 text-sm text-slate-600">
        <strong>Merged classes</strong>: few students, so two classes sit together for every subject except the ones you tick (they then appear as one
        shared cell in Who teaches what).
        <br />
        <strong>Multi-grade</strong>: one teacher holds several grades in one room at the same time, each doing its own lesson — their periods count
        once in the teacher's load.
      </p>

      {project.mergedClasses.length + project.multiGradeGroups.length > 0 && (
        <ul className="mb-4 space-y-2">
          {project.mergedClasses.map((m) => (
            <li key={m.id} className="rounded-md border border-indigo-200 bg-indigo-50/50 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-indigo-100 px-1.5 text-xs font-semibold text-indigo-800">Merged</span>
                <TextInput
                  aria-label="Merge name"
                  value={m.name}
                  onChange={(v) =>
                    update((d) => {
                      d.mergedClasses.find((x) => x.id === m.id)!.name = v;
                    })
                  }
                  className="w-48"
                />
                <span className="text-sm text-slate-600">{classNames(project, m.classIds)}</span>
                <button
                  className="btn ml-auto"
                  onClick={async () =>
                    (await confirmDialog(`Separate ${m.name}?`, {
                      text: 'Each class keeps a copy of the shared lessons.',
                      confirmText: 'Separate',
                    })) && update((d) => unmergeClasses(d, m.id))
                  }
                >
                  Separate
                </button>
              </div>
              <div className="mt-2">
                <p className="mb-1 text-xs text-slate-600">Taught separately (tick subjects):</p>
                <Chips
                  size="sm"
                  value={m.exceptSubjectIds}
                  options={subjectOptions}
                  onChange={(v) => update((d) => setMergeExceptions(d, m.id, v))}
                />
              </div>
            </li>
          ))}
          {project.multiGradeGroups.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50/50 p-2">
              <span className="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900">Multi-grade</span>
              <TextInput
                aria-label="Group name"
                value={g.name}
                onChange={(v) =>
                  update((d) => {
                    d.multiGradeGroups.find((x) => x.id === g.id)!.name = v;
                  })
                }
                className="w-48"
              />
              <span className="text-sm text-slate-600">{classNames(project, g.classIds)}</span>
              <span className="ml-auto">
                <IconButton
                  label={`Remove ${g.name}`}
                  danger
                  onClick={() =>
                    update((d) => {
                      d.multiGradeGroups = d.multiGradeGroups.filter((x) => x.id !== g.id);
                    })
                  }
                >
                  <TrashIcon />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md bg-slate-50 p-3">
        <div className="mb-2 flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="tt-kind" checked={kind === 'merge'} onChange={() => setKind('merge')} /> Merge classes
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="tt-kind" checked={kind === 'multigrade'} onChange={() => setKind('multigrade')} /> Multi-grade group
          </label>
        </div>
        <ClassPicker value={classIds} onChange={setClassIds} />
        <div className="mt-2 flex items-center gap-3">
          <button className="btn btn-primary" disabled={classIds.length < 2} onClick={add}>
            {kind === 'merge' ? 'Merge' : 'Group'} {classIds.length >= 2 ? classNames(project, classIds) : 'classes'}
          </button>
          {error && <span className="text-sm text-red-800">{error}</span>}
        </div>
      </div>
    </Card>
  );
}
