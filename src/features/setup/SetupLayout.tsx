import { useEffect, useState } from 'react';
import { CheckScreen } from '@/features/build/CheckScreen';
import { GenerateScreen } from '@/features/build/GenerateScreen';
import { PdfSpike } from '@/features/spike/PdfSpike';
import { useProjectStore } from '@/store/projectStore';
import { AllocationsStep } from './AllocationsStep';
import { BlocksStep } from './BlocksStep';
import { ClassesStep } from './ClassesStep';
import { RoomsStep } from './RoomsStep';
import { SchoolStep } from './SchoolStep';
import { visibleSteps, type StepId } from './steps';
import { SubjectsStep } from './SubjectsStep';
import { TeachersStep } from './TeachersStep';

type BuildId = 'check' | 'generate';
type View = StepId | BuildId | 'pdf';

const BUILD: { id: BuildId; label: string }[] = [
  { id: 'check', label: 'Check' },
  { id: 'generate', label: 'Generate' },
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

const VIEW_KEY = 'timetable.view';

function initialView(): View {
  try {
    return (localStorage.getItem(VIEW_KEY) as View | null) ?? 'school';
  } catch {
    return 'school';
  }
}

/** Setup wizard: a step list with progress ticks, the step screen, and Back/Next. */
export function SetupLayout() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [view, setView] = useState<View>(initialView);
  const steps = visibleSteps(project);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* storage unavailable: just don't remember the tab */
    }
  }, [view]);

  const build = BUILD.find((b) => b.id === view);
  const current = view === 'pdf' || build ? null : (steps.find((s) => s.id === view) ?? steps[0]!);
  const index = current ? steps.indexOf(current) : -1;
  const Screen = current ? SCREENS[current.id] : null;
  const doneCount = steps.filter((s) => s.done(project)).length;

  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };

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
          <option value="pdf">PDF test</option>
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
            <button className="mt-3 text-xs text-slate-500 underline" onClick={() => go('pdf')}>
              PDF test (spike)
            </button>
          </div>
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        {Screen ? (
          <Screen />
        ) : view === 'check' ? (
          <CheckScreen onGenerate={() => go('generate')} />
        ) : view === 'generate' ? (
          <GenerateScreen onCheck={() => go('check')} />
        ) : (
          <PdfSpike />
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
