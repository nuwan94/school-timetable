import { useMemo } from 'react';
import type { Issue } from '@/domain/checks';
import { preflight } from '@/solver/preflight';
import { useProjectStore } from '@/store/projectStore';
import { Card, PageHeader, Select } from '@/ui/kit';

const PRIORITY = [
  { value: 'core', label: 'Core' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
] as const;

const TONE = {
  error: 'border-red-300 bg-red-50 text-red-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
} as const;

function IssueList({ title, issues, tone }: { title: string; issues: Issue[]; tone: keyof typeof TONE }) {
  if (!issues.length) return null;
  return (
    <Card title={`${title} (${issues.length})`}>
      <ul className="space-y-2">
        {issues.map((i, n) => (
          <li key={n} className={`rounded-md border px-3 py-2 text-sm ${TONE[tone]}`}>
            <p>{i.message}</p>
            {i.fix && <p className="mt-0.5 text-xs opacity-80">→ {i.fix}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Pre-flight: what will stop or weaken generation, each with a fix, plus the shortage policy. */
export function CheckScreen({ onGenerate }: { onGenerate: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const pf = useMemo(() => preflight(project), [project]);
  const used = new Set([
    ...project.allocations.map((a) => a.subjectId),
    ...project.optionBlocks.flatMap((b) => b.lines.flatMap((l) => l.sets.map((s) => s.subjectId))),
  ]);
  const subjects = project.subjects.filter((s) => used.has(s.id));

  return (
    <div className="space-y-4">
      <PageHeader title="Check before generating">
        Problems listed here would stop lessons from being placed. Errors must be fixed (or the lessons will stay unplaced); warnings are worth a
        look.
      </PageHeader>

      <Card>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Stat label="Lessons to place" value={pf.summary.lessons} />
          <Stat label="Classes" value={pf.summary.classes} />
          <Stat label="Teachers" value={pf.summary.teachers} />
          <Stat label="Periods needed / teachers can give" value={`${pf.summary.demand} / ${pf.summary.supply}`} warn={pf.shortage} />
          <div className="ml-auto flex items-center gap-3">
            {pf.errors.length === 0 ? (
              <span className="text-sm font-medium text-teal-800" data-testid="preflight-status">
                ✓ Ready to generate
              </span>
            ) : (
              <span className="text-sm font-medium text-red-800" data-testid="preflight-status">
                {pf.errors.length} problem{pf.errors.length === 1 ? '' : 's'} to fix
              </span>
            )}
            <button className="btn btn-primary" onClick={onGenerate}>
              Go to Generate →
            </button>
          </div>
        </div>
      </Card>

      <IssueList title="Must fix" issues={pf.errors} tone="error" />
      <IssueList title="Worth checking" issues={pf.warnings} tone="warning" />
      <IssueList title="For information" issues={pf.info} tone="info" />

      <Card title={pf.shortage ? 'Teacher shortage — what gives way first' : 'If there are not enough teachers'}>
        <p className="mb-3 max-w-3xl text-sm text-slate-600">
          {pf.shortage
            ? 'More periods are needed than the teachers can give, so not every lesson will fit. '
            : 'Everything should fit. If it ever does not, '}
          the timetable is still made: <b>Low</b> priority subjects are left out first, then <b>Normal</b>; <b>Core</b> subjects are kept as
          long as possible. Lessons with no teacher yet are placed as “uncovered”, and empty periods show as <i>Self-study</i>.
        </p>
        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            <label key={s.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{s.name}</span>
              <Select
                aria-label={`${s.name} priority`}
                value={s.priority}
                options={PRIORITY}
                className="w-28"
                onChange={(v) =>
                  update((d) => {
                    d.subjects.find((x) => x.id === s.id)!.priority = v;
                  })
                }
              />
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold ${warn ? 'text-amber-700' : ''}`}>{value}</p>
    </div>
  );
}
