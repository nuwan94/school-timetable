import { useMemo } from 'react';
import { workloadReport } from '@/domain/returns';
import { isoDate } from '@/domain/relief';
import { useProjectStore } from '@/store/projectStore';
import { PageHeader } from '@/ui/kit';
import { ReportView } from '@/ui/ReportView';
import { tx } from '@/i18n';

/** Teacher workload and relief fairness (PLAN.md §9.3): load, free periods, relief taken, duties and invigilation. */
export function WorkloadScreen() {
  const project = useProjectStore((s) => s.project)!;
  const table = useMemo(() => workloadReport(project, isoDate(Date.now())), [project]);
  const term = table.rows.map((r) => Number(r.reliefTerm));
  const max = Math.max(0, ...term);
  const top = table.rows.filter((r) => max > 0 && Number(r.reliefTerm) === max).map((r) => r.name);
  const under = table.rows.filter((r) => r.status === tx('Under norm')).length;
  const over = table.rows.filter((r) => r.status === tx('Over')).length;

  return (
    <div className="space-y-4">
      <PageHeader title={tx('Workload and fairness')}>{tx('Who carries how much: teaching load, free periods, relief taken, duties and invigilation.')}</PageHeader>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={tx('Teachers under their norm')} value={under} tone={under ? 'amber' : 'emerald'} />
        <Stat label={tx('Teachers over their maximum')} value={over} tone={over ? 'red' : 'emerald'} />
        <Stat label={tx('Most relief this term')} value={max} hint={top.slice(0, 3).join(', ')} tone="sky" />
      </div>
      <ReportView project={project} table={table} />
    </div>
  );
}

const TONE = {
  amber: 'bg-amber-50 text-amber-900 ring-amber-200',
  emerald: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  red: 'bg-red-50 text-red-900 ring-red-200',
  sky: 'bg-sky-50 text-sky-900 ring-sky-200',
} as const;

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone: keyof typeof TONE }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${TONE[tone]}`}>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      {hint && <p className="mt-0.5 truncate text-xs opacity-80">{hint}</p>}
    </div>
  );
}
