import { useMemo, useState } from 'react';
import { MEDIUM_LABELS } from '@/domain/catalog';
import type { Medium } from '@/domain/common';
import { CADRE_COLUMNS, cadreLayout, cadreReturn, deploymentReturn, inCadre, surplusReport } from '@/domain/returns';
import { reportSheets } from '@/print/reportSheets';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { Card, IconButton, NumberInput, PageHeader, Select, TextInput, TrashIcon, UpIcon, DownIcon } from '@/ui/kit';
import { ExportButtons, ReportView } from '@/ui/ReportView';
import { tx } from '@/i18n';
import { Rich } from '@/i18n/Rich';

type Tab = 'cadre' | 'deployment' | 'surplus';
const TABS: { id: Tab; label: string }[] = [
  { id: 'cadre', get label() { return tx('Cadre return'); } },
  { id: 'deployment', get label() { return tx('Teacher deployment'); } },
  { id: 'surplus', get label() { return tx('Surplus & deficit'); } },
];
const MEDIA: { value: Medium; label: string }[] = (['si', 'ta', 'en'] as const).map((m) => ({ value: m, label: MEDIUM_LABELS[m] }));

/** SL returns (PLAN.md §9.3): cadre, teacher deployment, and surplus/deficit with a request for teachers. */
export function ReturnsScreen() {
  const project = useProjectStore((s) => s.project)!;
  const [tab, setTab] = useState<Tab>('cadre');
  const cadre = useMemo(() => cadreReturn(project), [project]);
  const deployment = useMemo(() => deploymentReturn(project), [project]);
  const surplus = useMemo(() => surplusReport(project), [project]);
  const missing = project.teachers.filter((t) => inCadre(t) && (!t.appointmentSubjectId || !t.appointmentMedium)).length;
  const go = useUiStore((s) => s.go);

  return (
    <div className="space-y-4">
      <PageHeader title={tx('Returns')}>
        {tx('Returns for the zonal office, worked out from your teachers and the allocations. Download each as Excel, CSV or PDF.')}
      </PageHeader>

      <div role="tablist" aria-label={tx('Returns')} className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            data-testid={`returns-tab-${t.id}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === t.id ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {t.label}
          </button>
        ))}
        <span className="mx-1 self-center text-slate-300">|</span>
        <ExportButtons project={project} tables={[cadre, deployment, surplus]} label="returns" />
      </div>

      {missing > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <Rich
            text={tx('{missing} teacher(s) have no appointment subject or medium, so they are left out of the cadre and surplus counts. <link>Add them in Teachers</link>.', {
              missing,
            })}
            tags={{
              link: (c) => (
                <button className="font-medium underline" onClick={() => go('teachers')}>
                  {c}
                </button>
              ),
            }}
          />
        </p>
      )}

      {tab === 'cadre' && (
        <>
          <ApprovedCadre />
          <ReportView project={project} table={cadre} />
          <CadreLayout />
        </>
      )}
      {tab === 'deployment' && <ReportView project={project} table={deployment} />}
      {tab === 'surplus' && <Surplus />}
    </div>
  );
}

function ApprovedCadre() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const subjects = project.subjects.map((s) => ({ value: s.id, label: s.name }));
  // A starting point only: one row per subject × medium staffed now, approved = how many teachers there are.
  const fill = () =>
    update((d) => {
      for (const t of d.teachers)
        if (inCadre(t) && t.appointmentSubjectId && t.appointmentMedium) {
          const e = d.cadre.find((c) => c.subjectId === t.appointmentSubjectId && c.medium === t.appointmentMedium);
          if (e) e.approved++;
          else d.cadre.push({ subjectId: t.appointmentSubjectId, medium: t.appointmentMedium, approved: 1 });
        }
    });
  return (
    <Card
      title={tx('Approved cadre')}
      actions={
        <>
          {project.cadre.length === 0 && (
            <button
              className="btn"
              onClick={fill}
              title={tx('One row per subject and medium your teachers are appointed to, approved = how many there are now')}
            >
              {tx('Start from current staff')}
            </button>
          )}
          <button
            className="btn"
            data-testid="cadre-add"
            onClick={() =>
              update((d) => {
                const s = d.subjects.find((x) => !d.cadre.some((c) => c.subjectId === x.id));
                if (s)
                  d.cadre.push({
                    subjectId: s.id,
                    medium: d.classes[0]?.medium === 'ta' ? 'ta' : d.classes[0]?.medium === 'en' ? 'en' : 'si',
                    approved: 1,
                  });
              })
            }
          >
            {tx('+ Add subject')}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        {tx('Enter the figures from the approved cadre letter. Actual numbers come from each teacher\'s appointment subject and medium.')}
      </p>
      {project.cadre.length === 0 ? (
        <p className="text-sm text-slate-500">{tx('No approved figures yet.')}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="cadre-list">
          {project.cadre.map((c, i) => (
            <div
              key={`${c.subjectId}-${c.medium}-${i}`}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2 sm:flex-nowrap"
            >
              <Select
                aria-label={tx('Subject')}
                value={c.subjectId}
                options={subjects}
                onChange={(v) => update((d) => void (d.cadre[i]!.subjectId = v))}
                className="min-w-0 flex-1 basis-full sm:basis-0"
              />
              <Select
                aria-label={tx('Medium')}
                value={c.medium}
                options={MEDIA}
                onChange={(v) => update((d) => void (d.cadre[i]!.medium = v))}
                className="w-24"
              />
              <NumberInput
                aria-label={tx('Approved')}
                value={c.approved}
                min={0}
                onChange={(v) => update((d) => void (d.cadre[i]!.approved = v ?? 0))}
                className="w-16"
              />
              <IconButton
                label={tx('Remove {x}', { x: project.subjects.find((s) => s.id === c.subjectId)?.name ?? '' })}
                danger
                onClick={() => update((d) => void d.cadre.splice(i, 1))}
              >
                <TrashIcon />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CadreLayout() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const cols = cadreLayout(project);
  const set = (next: typeof cols) => update((d) => void (d.reports.cadreColumns = next));
  const move = (i: number, by: number) => {
    const next = [...cols];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x!);
    set(next);
  };
  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer font-semibold">{tx('Layout for your zone')}</summary>
      <p className="mt-2 text-sm text-slate-600">
        {tx('Rename, reorder or hide columns to match your zonal office\'s form. The Excel, CSV and PDF follow this layout.')}
      </p>
      <ol className="mt-3 space-y-1.5" data-testid="cadre-layout">
        {cols.map((c, i) => (
          <li key={c.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-teal-700"
              aria-label={tx('Show {label}', { label: c.label })}
              checked={c.visible}
              onChange={(e) => set(cols.map((x, j) => (j === i ? { ...x, visible: e.target.checked } : x)))}
            />
            <TextInput
              aria-label={tx('Heading for {label}', { label: c.label })}
              value={c.label}
              onChange={(v) => set(cols.map((x, j) => (j === i ? { ...x, label: v } : x)))}
              className="w-56"
            />
            <span className="text-xs text-slate-400">{CADRE_COLUMNS.find((d) => d.key === c.key)?.label}</span>
            <span className="ml-auto flex gap-1">
              <IconButton label={tx('Move {label} up', { label: c.label })} onClick={() => i > 0 && move(i, -1)}>
                <UpIcon />
              </IconButton>
              <IconButton label={tx('Move {label} down', { label: c.label })} onClick={() => i < cols.length - 1 && move(i, 1)}>
                <DownIcon />
              </IconButton>
            </span>
          </li>
        ))}
      </ol>
      <button className="btn mt-3" onClick={() => set([])}>
        {tx('Reset to the generic layout')}
      </button>
    </details>
  );
}

function Surplus() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const table = useMemo(() => surplusReport(project), [project]);
  const request = useMemo(() => surplusReport(project, true), [project]);
  const per = project.reports.periodsPerTeacher;
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="label">{tx('Periods per teacher')}</span>
            <NumberInput
              aria-label={tx('Periods per teacher')}
              data-testid="periods-per-teacher"
              value={per}
              nullable
              min={1}
              onChange={(v) => update((d) => void (d.reports.periodsPerTeacher = v))}
              className="w-24"
            />
          </label>
          <p className="max-w-xl text-sm text-slate-600">
            {tx('The weekly teaching load your zone expects from one teacher, from the current circular. It turns periods into teachers. The app does not assume a figure.')}
          </p>
          {per && request.rows.length > 0 && (
            <div className="ml-auto">
              <ExportButtons
                project={project}
                tables={[request]}
                label="request-for-teachers"
                pdf={reportSheets(project, request, { sign: true, meta: [tx('Subject-wise deficit, attached to the request for teachers.')] })}
              />
              <p className="mt-1 text-right text-xs text-slate-500">{tx('Request for teachers ({rows} subject(s) short)', { rows: request.rows.length })}</p>
            </div>
          )}
        </div>
      </Card>
      <ReportView project={project} table={table} />
    </>
  );
}
