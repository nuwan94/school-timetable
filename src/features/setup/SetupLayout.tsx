import { CheckScreen } from '@/features/build/CheckScreen';
import { EditScreen } from '@/features/build/EditScreen';
import { GenerateScreen } from '@/features/build/GenerateScreen';
import { RulesScreen } from '@/features/build/RulesScreen';
import { CalendarScreen } from '@/features/year/CalendarScreen';
import { ChangesScreen } from '@/features/year/ChangesScreen';
import { ExamsScreen } from '@/features/year/ExamsScreen';
import { PrintScreen } from '@/features/print/PrintScreen';
import { LedgerScreen } from '@/features/relief/LedgerScreen';
import { TodayScreen } from '@/features/relief/TodayScreen';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore, type BuildId, type View } from '@/store/uiStore';
import { AllocationsStep } from './AllocationsStep';
import { BlocksStep } from './BlocksStep';
import { ClassesStep } from './ClassesStep';
import { RoomsStep } from './RoomsStep';
import { SchoolStep } from './SchoolStep';
import { visibleSteps, type StepId } from './steps';
import { SubjectsStep } from './SubjectsStep';
import { TeachersStep } from './TeachersStep';

const BUILD: { id: BuildId; label: string }[] = [
  { id: 'check', label: 'Check' },
  { id: 'rules', label: 'Rules' },
  { id: 'generate', label: 'Generate' },
  { id: 'edit', label: 'Edit' },
  { id: 'print', label: 'Print & share' },
];

const DAILY: { id: BuildId; label: string }[] = [
  { id: 'today', label: 'Today — relief' },
  { id: 'ledger', label: 'Relief ledger' },
];

const YEAR: { id: BuildId; label: string }[] = [
  { id: 'changes', label: 'Mid-year changes' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'exams', label: 'Term tests' },
];

const SCREENS: Record<StepId, () => JSX.Element> = {
  school: SchoolStep,
  classes: ClassesStep,
  subjects: SubjectsStep,
  rooms: RoomsStep,
  teachers: TeachersStep,
  allocations: AllocationsStep,
  blocks: BlocksStep,
};

/** Setup wizard: a step list with progress ticks, the step screen, and Back/Next. */
export function SetupLayout() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const view = useUiStore((s) => s.view);
  const go = useUiStore((s) => s.go);
  const steps = visibleSteps(project);

  const build = [...BUILD, ...DAILY, ...YEAR].find((b) => b.id === view);
  const current = build ? null : (steps.find((s) => s.id === view) ?? steps[0]!);
  const index = current ? steps.indexOf(current) : -1;
  const Screen = current ? SCREENS[current.id] : null;
  const doneCount = steps.filter((s) => s.done(project)).length;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-3 py-4 md:flex-row md:px-4">
      <aside className="md:w-56 md:shrink-0">
        {/* Phone: compact select. Desktop: step list. */}
        <select className="field w-full md:hidden" value={view} onChange={(e) => go(e.target.value as View)} aria-label="Setup step">
          {steps.map((s, i) => (
            <option key={s.id} value={s.id}>
              {i + 1}. {s.label} {s.done(project) ? '✓' : ''}
            </option>
          ))}
          <optgroup label="Build">
            {BUILD.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Daily">
            {DAILY.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Year">
            {YEAR.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </optgroup>
        </select>

        <nav className="hidden md:block" aria-label="Setup steps">
          <p className="label">
            Setup · {doneCount}/{steps.length} done
          </p>
          <ol className="mt-2 space-y-1">
            {steps.map((s, i) => {
              const done = s.done(project);
              const active = s.id === current?.id;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => go(s.id)}
                    aria-current={active ? 'step' : undefined}
                    className={`flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left ${
                      active ? 'bg-teal-50 ring-1 ring-teal-600' : 'hover:bg-slate-100'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        done ? 'bg-teal-700 text-white' : 'border border-slate-300 text-slate-500'
                      }`}
                      aria-label={done ? 'done' : undefined}
                    >
                      {done ? '✓' : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{s.label}</span>
                      <span className="block truncate text-xs text-slate-500">{s.status(project)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="label mt-5">Build</p>
          <ol className="mt-2 space-y-1">
            {BUILD.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => go(b.id)}
                  aria-current={view === b.id ? 'page' : undefined}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-sm font-medium ${
                    view === b.id ? 'bg-teal-50 ring-1 ring-teal-600' : 'hover:bg-slate-100'
                  }`}
                >
                  {b.label}
                  {b.id === 'generate' && project.activeVersionId && <span className="ml-1.5 text-xs font-normal text-slate-500">· draft ready</span>}
                </button>
              </li>
            ))}
          </ol>
          {(
            [
              ['Daily', DAILY],
              ['Year', YEAR],
            ] as const
          ).map(([label, list]) => (
            <div key={label}>
              <p className="label mt-5">{label}</p>
              <ol className="mt-2 space-y-1">
                {list.map((b) => (
                  <li key={b.id}>
                    <button
                      onClick={() => go(b.id)}
                      aria-current={view === b.id ? 'page' : undefined}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-sm font-medium ${
                        view === b.id ? 'bg-teal-50 ring-1 ring-teal-600' : 'hover:bg-slate-100'
                      }`}
                    >
                      {b.label}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          <div className="mt-6 border-t border-slate-200 pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={project.simpleMode}
                onChange={(e) =>
                  update((d) => {
                    d.simpleMode = e.target.checked;
                  })
                }
              />
              Simple mode
            </label>
            <p className="mt-1 text-xs text-slate-500">Hides advanced fields. Nothing is deleted.</p>
          </div>
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        {Screen ? (
          <Screen />
        ) : view === 'check' ? (
          <CheckScreen onGenerate={() => go('generate')} />
        ) : view === 'rules' ? (
          <RulesScreen onGenerate={() => go('generate')} />
        ) : view === 'calendar' ? (
          <CalendarScreen />
        ) : view === 'exams' ? (
          <ExamsScreen />
        ) : view === 'changes' ? (
          <ChangesScreen onPrint={() => go('print')} />
        ) : view === 'generate' ? (
          <GenerateScreen onCheck={() => go('check')} onEdit={() => go('edit')} />
        ) : view === 'today' ? (
          <TodayScreen onGenerate={() => go('generate')} />
        ) : view === 'ledger' ? (
          <LedgerScreen />
        ) : view === 'edit' ? (
          <EditScreen onGenerate={() => go('generate')} onPrint={() => go('print')} />
        ) : (
          <PrintScreen onGenerate={() => go('generate')} />
        )}
        {current && (
          <div className="mt-6 flex justify-between border-t border-slate-200 pt-4">
            <button className="btn" disabled={index <= 0} onClick={() => go(steps[index - 1]!.id)}>
              ← Back
            </button>
            {index < steps.length - 1 ? (
              <button className="btn btn-primary" onClick={() => go(steps[index + 1]!.id)}>
                Next: {steps[index + 1]!.label} →
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => go('check')}>
                Next: Check &amp; generate →
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
