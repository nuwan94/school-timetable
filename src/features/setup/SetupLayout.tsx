import { CheckScreen } from '@/features/build/CheckScreen';
import { EditScreen } from '@/features/build/EditScreen';
import { GenerateScreen } from '@/features/build/GenerateScreen';
import { RulesScreen } from '@/features/build/RulesScreen';
import { CalendarScreen } from '@/features/year/CalendarScreen';
import { ChangesScreen } from '@/features/year/ChangesScreen';
import { ExamsScreen } from '@/features/year/ExamsScreen';
import { DutiesScreen } from '@/features/reports/DutiesScreen';
import { ReturnsScreen } from '@/features/reports/ReturnsScreen';
import { WorkloadScreen } from '@/features/reports/WorkloadScreen';
import { PrintScreen } from '@/features/print/PrintScreen';
import { LedgerScreen } from '@/features/relief/LedgerScreen';
import { TodayScreen } from '@/features/relief/TodayScreen';
import type { ReactNode } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore, type BuildId, type View } from '@/store/uiStore';
import { Icon, type IconName } from '@/ui/Icon';
import { AllocationsStep } from './AllocationsStep';
import { BlocksStep } from './BlocksStep';
import { ClassesStep } from './ClassesStep';
import { RoomsStep } from './RoomsStep';
import { SchoolStep } from './SchoolStep';
import { visibleSteps, type StepId } from './steps';
import { SubjectsStep } from './SubjectsStep';
import { TeachersStep } from './TeachersStep';

interface NavLink {
  id: BuildId;
  label: string;
  hint: string;
  icon: IconName;
}

const BUILD: NavLink[] = [
  { id: 'check', label: 'Check', hint: 'Find problems first', icon: 'checkCircle' },
  { id: 'rules', label: 'Rules', hint: 'Balance and preferences', icon: 'sliders' },
  { id: 'generate', label: 'Generate', hint: 'Build the timetable', icon: 'sparkle' },
  { id: 'edit', label: 'Edit', hint: 'Move lessons by hand', icon: 'pen' },
  { id: 'print', label: 'Print & share', hint: 'Sheets, PDF and PNG', icon: 'print' },
];

const DAILY: NavLink[] = [
  { id: 'today', label: 'Today — relief', hint: 'Cover for absent teachers', icon: 'sun' },
  { id: 'ledger', label: 'Relief ledger', hint: 'Who covered, kept fair', icon: 'book' },
];

const YEAR: NavLink[] = [
  { id: 'changes', label: 'Mid-year changes', hint: 'Leavers, joiners, long leave', icon: 'users' },
  { id: 'calendar', label: 'Calendar', hint: 'Holidays and events', icon: 'calendar' },
  { id: 'exams', label: 'Term tests', hint: 'Papers and invigilation', icon: 'clipboard' },
];

const REPORTS: NavLink[] = [
  { id: 'returns', label: 'Returns', hint: 'Cadre, deployment, surplus', icon: 'fileText' },
  { id: 'workload', label: 'Workload', hint: 'Load and relief fairness', icon: 'chart' },
  { id: 'duties', label: 'Duty rosters', hint: 'Interval and gate duty', icon: 'shield' },
];

/** Colours per group (full class names so Tailwind keeps them). */
const TONES = {
  teal: { head: 'text-teal-700', tile: 'bg-teal-50 text-teal-700', tileOn: 'bg-teal-700 text-white', on: 'bg-teal-50 ring-teal-600' },
  amber: { head: 'text-amber-700', tile: 'bg-amber-50 text-amber-700', tileOn: 'bg-amber-500 text-white', on: 'bg-amber-50 ring-amber-500' },
  violet: { head: 'text-violet-700', tile: 'bg-violet-50 text-violet-700', tileOn: 'bg-violet-600 text-white', on: 'bg-violet-50 ring-violet-500' },
  sky: { head: 'text-sky-700', tile: 'bg-sky-50 text-sky-700', tileOn: 'bg-sky-600 text-white', on: 'bg-sky-50 ring-sky-500' },
} as const;
type Tone = keyof typeof TONES;

function NavGroup({ title, icon, tone, meta, children }: { title: string; icon: IconName; tone: Tone; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex items-center gap-2 px-2 pb-1.5 pt-1">
        <Icon name={icon} className={`h-4 w-4 ${TONES[tone].head}`} />
        <span className={`text-xs font-bold uppercase tracking-wider ${TONES[tone].head}`}>{title}</span>
        <span className="ml-auto">{meta}</span>
      </div>
      <ol className="space-y-0.5">{children}</ol>
    </section>
  );
}

function NavItem({ link, tone, active, onClick, extra }: { link: NavLink; tone: Tone; active: boolean; onClick: () => void; extra?: ReactNode }) {
  const t = TONES[tone];
  return (
    <li>
      <button
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition ${active ? `ring-1 ${t.on}` : 'hover:bg-slate-50'}`}
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${active ? t.tileOn : t.tile}`}>
          <Icon name={link.icon} className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
            {link.label}
            {extra}
          </span>
          <span className="block truncate text-xs text-slate-500">{link.hint}</span>
        </span>
      </button>
    </li>
  );
}

const Count = ({ n }: { n: number }) =>
  n > 0 ? <span className="rounded-full bg-violet-100 px-1.5 text-[10px] font-semibold text-violet-700">{n}</span> : null;

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

  const build = [...BUILD, ...DAILY, ...YEAR, ...REPORTS].find((b) => b.id === view);
  const current = build ? null : (steps.find((s) => s.id === view) ?? steps[0]!);
  const index = current ? steps.indexOf(current) : -1;
  const Screen = current ? SCREENS[current.id] : null;
  const doneCount = steps.filter((s) => s.done(project)).length;
  const version = project.versions.find((v) => v.id === project.activeVersionId);
  const badge = !version
    ? { text: 'Not yet', cls: 'bg-slate-100 text-slate-600' }
    : version.status === 'approved'
      ? { text: 'Approved', cls: 'bg-emerald-100 text-emerald-800' }
      : { text: 'Draft', cls: 'bg-amber-100 text-amber-800' };
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-3 py-4 md:flex-row md:px-4">
      <aside className="md:sticky md:top-[4.5rem] md:max-h-[calc(100vh-5.5rem)] md:w-64 md:shrink-0 md:overflow-y-auto md:pb-4 md:pr-1 [scrollbar-width:thin]">
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
          <optgroup label="Reports">
            {REPORTS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </optgroup>
        </select>

        <nav className="hidden space-y-3 md:block" aria-label="Setup steps">
          <NavGroup
            title="Setup"
            icon="school"
            tone="teal"
            meta={
              <span className="text-xs font-semibold text-slate-500">
                {doneCount}/{steps.length} done
              </span>
            }
          >
            <li className="px-2 pb-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
              </div>
            </li>
            {steps.map((s, i) => {
              const done = s.done(project);
              const active = s.id === current?.id;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => go(s.id)}
                    aria-current={active ? 'step' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition ${
                      active ? 'bg-teal-50 ring-1 ring-teal-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                        done ? 'bg-teal-700 text-white' : active ? 'bg-white text-teal-700 ring-1 ring-teal-600' : 'bg-slate-100 text-slate-500'
                      }`}
                      aria-label={done ? 'done' : undefined}
                    >
                      {done ? <Icon name="check" className="h-4 w-4" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800">{s.label}</span>
                      <span className="block truncate text-xs text-slate-500">{s.status(project)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </NavGroup>

          <NavGroup
            title="Build"
            icon="grid"
            tone="teal"
            meta={<span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.text}</span>}
          >
            {BUILD.map((b) => (
              <NavItem key={b.id} link={b} tone="teal" active={view === b.id} onClick={() => go(b.id)} />
            ))}
          </NavGroup>

          <NavGroup title="Daily" icon="sun" tone="amber" meta={<span className="text-xs font-medium text-slate-500">{todayLabel}</span>}>
            {DAILY.map((b) => (
              <NavItem key={b.id} link={b} tone="amber" active={view === b.id} onClick={() => go(b.id)} />
            ))}
          </NavGroup>

          <NavGroup title="Year" icon="calendar" tone="violet">
            {YEAR.map((b) => (
              <NavItem
                key={b.id}
                link={b}
                tone="violet"
                active={view === b.id}
                onClick={() => go(b.id)}
                extra={b.id === 'calendar' ? <Count n={project.overlays.length} /> : b.id === 'exams' ? <Count n={project.exams.length} /> : null}
              />
            ))}
          </NavGroup>

          <NavGroup title="Reports" icon="fileText" tone="sky">
            {REPORTS.map((b) => (
              <NavItem key={b.id} link={b} tone="sky" active={view === b.id} onClick={() => go(b.id)} />
            ))}
          </NavGroup>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-teal-700"
              checked={project.simpleMode}
              onChange={(e) =>
                update((d) => {
                  d.simpleMode = e.target.checked;
                })
              }
            />
            <span>
              <span className="block text-sm font-medium">Simple mode</span>
              <span className="block text-xs text-slate-500">Hides advanced fields. Nothing is deleted.</span>
            </span>
          </label>
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        {Screen ? (
          <Screen />
        ) : view === 'check' ? (
          <CheckScreen onGenerate={() => go('generate')} />
        ) : view === 'rules' ? (
          <RulesScreen onGenerate={() => go('generate')} />
        ) : view === 'returns' ? (
          <ReturnsScreen />
        ) : view === 'workload' ? (
          <WorkloadScreen />
        ) : view === 'duties' ? (
          <DutiesScreen />
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
