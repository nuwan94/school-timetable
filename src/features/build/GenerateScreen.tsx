import { useMemo, useRef, useState } from 'react';
import { classGrid, countGaps, lessonEntries, saveDraftVersion, teacherGrid } from '@/domain/timetable';
import type { GenerateOptions, GenerateResult } from '@/solver';
import { checkTimetable } from '@/solver/checker';
import { preflight } from '@/solver/preflight';
import { runSolver, type Progress, type SolverRun } from '@/solver/runner';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty, PageHeader } from '@/ui/kit';
import { TimetableGrid } from './TimetableGrid';
import { WhatIf } from './WhatIf';

/** Last run's details (unplaced reasons) survive switching screens, not reloads. */
let lastRun: { versionId: string; result: GenerateResult } | null = null;

const RELAXED_NOTE = 'rules relaxed';

type Mode = 'fresh' | 'improve' | 'minimal' | 'some';

const MODES: { value: Mode; label: string; help: string }[] = [
  { value: 'fresh', label: 'New timetable', help: 'Arranges everything from scratch.' },
  { value: 'improve', label: 'Improve the current one', help: 'Keeps it valid and moves lessons only where the rules get better.' },
  { value: 'minimal', label: 'Keep it, change as little as possible', help: 'After a change in teachers or periods: fixes what no longer fits and leaves the rest.' },
  { value: 'some', label: 'Redo only some classes', help: 'Everything else stays exactly where it is.' },
];

const TRY_ANOTHER_WARNING =
  'This timetable has already been approved and shared. "Try another" rearranges everything.\n\nTo adjust it instead, choose "Keep it, change as little as possible". Continue anyway?';

export function GenerateScreen({ onCheck, onEdit }: { onCheck: () => void; onEdit: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [relax, setRelax] = useState(false);
  const shared = project.versions.some((v) => v.status !== 'draft');
  const [mode, setMode] = useState<Mode>(() => (shared ? 'minimal' : 'fresh'));
  const [someClasses, setSomeClasses] = useState<string[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, rerender] = useState(0);
  const run = useRef<SolverRun | null>(null);
  const running = progress !== null;

  const pf = useMemo(() => preflight(project), [project]);
  const version = project.versions.find((v) => v.id === project.activeVersionId);
  const last = lastRun && lastRun.versionId === version?.id ? lastRun.result : null;

  const optionsFor = (m: Mode, seed: number): GenerateOptions => {
    const current = version?.placements ?? [];
    const locked = current.filter((pl) => pl.locked);
    const base: GenerateOptions = { seed, relaxRules: relax, locked };
    if (!version || m === 'fresh') return base;
    if (m === 'improve' || m === 'minimal') return { ...base, start: { placements: current, mode: m } };
    // Redo some classes: everything not touching them stays where it is.
    const entries = lessonEntries(project, current);
    const keep = new Set(entries.filter((e) => !e.classIds.some((c) => someClasses.includes(c))).map((e) => `${e.itemId}#${e.occurrence}`));
    return { ...base, locked: current.filter((pl) => pl.locked || keep.has(`${pl.itemId}#${pl.occurrence}`)) };
  };

  const start = (seed: number, m: Mode = version ? mode : 'fresh') => {
    setError(null);
    setProgress({ placed: 0, total: pf.summary.lessons, iteration: 0 });
    const r = runSolver(project, optionsFor(m, seed), setProgress);
    run.current = r;
    r.result
      .then((result) => {
        const how = { fresh: '', improve: 'improved', minimal: 'minimal change', some: 'some classes redone' }[m];
        const note = [how, `seed ${seed}`, relax ? RELAXED_NOTE : '', result.stats.stopped ? 'stopped early' : ''].filter(Boolean).join(', ');
        let id = '';
        update((d) => {
          id = saveDraftVersion(d, result.placements, note);
        });
        lastRun = { versionId: id, result };
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        run.current = null;
        setProgress(null);
        rerender((n) => n + 1);
      });
  };
  const nextSeed = () => Math.floor(Math.random() * 1_000_000) + 2;

  return (
    <div className="space-y-4">
      <PageHeader title="Generate timetable">
        Places every lesson with no clashes for classes, teachers or rooms, keeping the hard rules. Each run is checked again independently
        before you see it.
      </PageHeader>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {!running ? (
            <>
              <button
                className="btn btn-primary"
                onClick={() => start(1)}
                data-testid="generate"
                disabled={!!version && mode === 'some' && someClasses.length === 0}
              >
                {!version ? 'Generate' : { fresh: 'Generate new', improve: 'Improve', minimal: 'Update with least change', some: 'Redo these classes' }[mode]}
              </button>
              {version && mode === 'fresh' && (
                <button
                  className="btn"
                  onClick={() => {
                    if (shared && !confirm(TRY_ANOTHER_WARNING)) return;
                    start(nextSeed());
                  }}
                  title="Same data, a different arrangement"
                >
                  Try another
                </button>
              )}
            </>
          ) : (
            <button className="btn" onClick={() => run.current?.stop()} data-testid="stop">
              Stop
            </button>
          )}
          {version && !running && (
            <button className="btn" onClick={onEdit}>
              Edit by hand →
            </button>
          )}
          <label className="flex items-center gap-2 text-sm" title="Treat once-per-day and daily-maximum rules as preferences">
            <input type="checkbox" checked={relax} disabled={running} onChange={(e) => setRelax(e.target.checked)} />
            Relax rules if needed
          </label>
          <span className="ml-auto text-sm">
            {pf.errors.length > 0 ? (
              <button className="text-red-800 underline" onClick={onCheck}>
                {pf.errors.length} problem{pf.errors.length === 1 ? '' : 's'} found in Check — some lessons cannot be placed
              </button>
            ) : pf.shortage ? (
              <button className="text-amber-800 underline" onClick={onCheck}>
                Teacher shortage: low-priority lessons will give way
              </button>
            ) : (
              <span className="text-teal-800">✓ Checks passed</span>
            )}
          </span>
        </div>

        {version && !running && (
          <fieldset className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="How to generate">
            {MODES.map((m) => (
              <label
                key={m.value}
                className={`flex cursor-pointer gap-2 rounded-md border p-2 text-sm ${mode === m.value ? 'border-teal-600 bg-teal-50' : 'border-slate-200'}`}
              >
                <input type="radio" name="gen-mode" className="mt-0.5" checked={mode === m.value} onChange={() => setMode(m.value)} />
                <span>
                  <span className="font-medium">{m.label}</span>
                  <span className="block text-xs text-slate-600">{m.help}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {version && !running && mode === 'some' && (
          <div className="mt-3 flex flex-wrap gap-1" aria-label="Classes to redo">
            {project.classes.map((c) => {
              const on = someClasses.includes(c.id);
              return (
                <button
                  key={c.id}
                  aria-pressed={on}
                  className={`rounded-full border px-2.5 py-1 text-sm ${on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white'}`}
                  onClick={() => setSomeClasses(on ? someClasses.filter((x) => x !== c.id) : [...someClasses, c.id])}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        )}

        {running && (
          <div className="mt-4" role="status" aria-live="polite">
            <div className="h-2 overflow-hidden rounded bg-slate-200">
              <div
                className="h-full bg-teal-600 transition-[width]"
                style={{ width: `${progress.total ? Math.round((100 * progress.placed) / progress.total) : 0}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {progress.phase === 'improving' ? 'Improving for the rules · ' : ''}
              {progress.placed} of {progress.total} lessons placed · step {progress.iteration}
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-800">
            {error}
          </p>
        )}
      </Card>

      {last && <RunResult result={last} />}
      {version && !running && <WhatIf />}
      {version ? <Viewer /> : !running && <Empty>No timetable yet. Press Generate.</Empty>}
    </div>
  );
}

function RunResult({ result }: { result: GenerateResult }) {
  const { stats, check, unplaced } = result;
  return (
    <Card title="Result">
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <span data-testid="placed-count">
          <b>{stats.placed}</b> of {stats.units} lessons placed
        </span>
        <span>{(stats.ms / 1000).toFixed(1)} s</span>
        <span title="Lower is better: strength × number of times a preference is not met" data-testid="soft-score">
          Rule penalty {stats.softBefore !== stats.softAfter ? `${stats.softBefore} → ` : ''}
          <b>{stats.softAfter}</b>
        </span>
        {stats.moved !== null && <span data-testid="moved">{stats.moved} lesson(s) moved</span>}
        {stats.stopped && <span className="text-amber-800">Stopped early — showing the best found so far</span>}
        {result.relaxedRules && <span className="text-amber-800">Rules relaxed</span>}
        <span className={check.violations.length ? 'font-medium text-red-800' : 'text-teal-800'} data-testid="checker-status">
          {check.violations.length ? `Independent check: ${check.violations.length} problem(s)` : '✓ Independent check: no clashes'}
        </span>
      </div>
      {check.violations.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
          {check.violations.slice(0, 20).map((v, i) => (
            <li key={i}>{v.message}</li>
          ))}
        </ul>
      )}
      {unplaced.length > 0 && (
        <div className="mt-4">
          <p className="label">Not placed ({unplaced.length})</p>
          <ul className="mt-1 max-h-72 space-y-1 overflow-y-auto text-sm" data-testid="unplaced">
            {unplaced.map((u) => (
              <li key={`${u.itemId}#${u.occurrence}`} className="rounded border border-amber-200 bg-amber-50 px-2 py-1">
                <b>{u.label}</b>
                {u.length > 1 && ' (double)'} — <span className="text-slate-700">{u.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Viewer() {
  const project = useProjectStore((s) => s.project)!;
  const version = project.versions.find((v) => v.id === project.activeVersionId)!;
  const [who, setWho] = useState<string>(() => (project.classes[0] ? `c:${project.classes[0].id}` : ''));
  const entries = useMemo(() => lessonEntries(project, version.placements), [project, version]);
  const check = useMemo(
    () => checkTimetable(project, version.placements, { relaxedRules: version.note.includes(RELAXED_NOTE) }),
    [project, version],
  );
  const nameOf = (id: string) => project.classes.find((c) => c.id === id)?.name ?? '?';
  const id = who.slice(2);
  const grid = who.startsWith('t:') ? teacherGrid(project, entries, id) : classGrid(project, entries, id);
  const gaps = who.startsWith('c:') ? countGaps(project, entries, id) : 0;
  const teacherLessons = who.startsWith('t:') ? entries.filter((e) => e.teacherIds.includes(id)).reduce((s, e) => s + e.slotIds.length, 0) : 0;

  return (
    <Card
      title={
        <span>
          {version.name} <span className="text-xs font-normal text-slate-500">({version.note})</span>
        </span>
      }
      actions={
        <select className="field w-56" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Show timetable for">
          <optgroup label="Classes">
            {project.classes.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Teachers">
            {project.teachers.map((t) => (
              <option key={t.id} value={`t:${t.id}`}>
                {t.name}
              </option>
            ))}
          </optgroup>
        </select>
      }
    >
      {check.violations.length > 0 && (
        <p className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          This timetable no longer matches the setup ({check.violations.length} problem(s), e.g. “{check.violations[0]!.message}”). Generate again
          to update it.
        </p>
      )}
      <p className="mb-2 text-xs text-slate-500">
        {who.startsWith('c:')
          ? gaps
            ? `${gaps} empty period(s) — shown as Self-study.`
            : 'Every period has a lesson.'
          : `${teacherLessons} period(s) a week.`}{' '}
        Amber = no teacher yet (uncovered).
      </p>
      {grid ? <TimetableGrid grid={grid} mode={who.startsWith('t:') ? 'teacher' : 'class'} nameOf={nameOf} teacherId={who.startsWith('t:') ? id : undefined} /> : <Empty>Nothing to show.</Empty>}
    </Card>
  );
}
