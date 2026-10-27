import { useEffect, useState } from 'react';
import type { Pack } from '@/domain/common';
import { PACK_LABELS } from '@/packs';
import type { Snapshot } from '@/store/autosave';
import { useProjectStore } from '@/store/projectStore';
import { autosave } from '@/store/useAutosave';

const PACK_HINTS: Record<Pack, string> = {
  simple: 'Small or rural school. Guided setup, few rules, handles teacher shortage.',
  'sl-gov': 'National / provincial school. NIE grades, media, O/L baskets, A/L streams, returns.',
  international: 'Cambridge / Pearson Edexcel. Student-level clashes, sets, contact hours. (Full screens in v1.1)',
};

export function StartScreen({ onOpen }: { onOpen: () => void }) {
  const newProject = useProjectStore((s) => s.newProject);
  const load = useProjectStore((s) => s.load);
  const [pack, setPack] = useState<Pack>('sl-gov');
  const [name, setName] = useState('');
  const [recovery, setRecovery] = useState<Snapshot | null>(null);

  useEffect(() => {
    autosave
      .latest()
      .then((s) => setRecovery(s ?? null))
      .catch(() => setRecovery(null));
  }, []);

  const recover = () => {
    if (!recovery) return;
    try {
      load(autosave.restore(recovery), { fileName: recovery.fileName, handle: null, dirty: recovery.unsaved });
    } catch (e) {
      alert(`Could not recover: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">School Timetable</h1>
      <p className="mt-1 text-slate-600">
        Clash-free timetables, daily relief and printable sheets. Everything stays on this device.
      </p>

      {recovery && (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">
            Recover your last session?
          </p>
          <p className="mt-0.5 text-sm text-amber-800">
            {recovery.schoolName || 'Untitled school'} — autosaved{' '}
            {new Date(recovery.savedAt).toLocaleString()}
            {recovery.unsaved ? ' (had unsaved changes)' : ''}
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" onClick={recover}>
              Recover
            </button>
            <button className="btn" onClick={() => setRecovery(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_auto]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">New project</h2>
          <label className="label mt-4" htmlFor="school-name">
            School name
          </label>
          <input
            id="school-name"
            className="field w-full"
            value={name}
            placeholder="e.g. Sri Sumangala Vidyalaya"
            onChange={(e) => setName(e.target.value)}
          />
          <fieldset className="mt-4">
            <legend className="label">School type</legend>
            <div className="space-y-2">
              {(Object.keys(PACK_LABELS) as Pack[]).map((p) => (
                <label
                  key={p}
                  className={`flex cursor-pointer gap-3 rounded-md border p-3 ${
                    pack === p ? 'border-teal-600 bg-teal-50' : 'border-slate-200'
                  }`}
                >
                  <input type="radio" name="pack" checked={pack === p} onChange={() => setPack(p)} />
                  <span>
                    <span className="block text-sm font-medium">{PACK_LABELS[p]}</span>
                    <span className="block text-xs text-slate-600">{PACK_HINTS[p]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn btn-primary mt-5" onClick={() => newProject(pack, name.trim())}>
            Create project
          </button>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:w-56">
          <h2 className="font-semibold">Existing project</h2>
          <p className="mt-2 text-sm text-slate-600">Open a .ttb file saved earlier.</p>
          <button className="btn mt-4" onClick={onOpen}>
            Open file…
          </button>
        </section>
      </div>
    </div>
  );
}
