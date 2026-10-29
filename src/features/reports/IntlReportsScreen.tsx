import { useMemo, useState } from 'react';
import {
  ccaRoster,
  ccaSummary,
  contactHours,
  contractHours,
  houseList,
  houseSummary,
  roomUtilisation,
  setSummary,
  visitingClaims,
} from '@/domain/intlReports';
import { addDays, isoDate } from '@/domain/relief';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { PageHeader } from '@/ui/kit';
import { ExportButtons, ReportView } from '@/ui/ReportView';
import { tx } from '@/i18n';
import { Rich } from '@/i18n/Rich';

const TABS = [
  { id: 'contact', get label() { return tx('Contact hours'); } },
  { id: 'rooms', get label() { return tx('Rooms'); } },
  { id: 'contract', get label() { return tx('Contract hours'); } },
  { id: 'visiting', get label() { return tx('Visiting claims'); } },
  { id: 'sets', get label() { return tx('Sets'); } },
  { id: 'houses', get label() { return tx('Houses'); } },
  { id: 'ccas', get label() { return tx('Activities'); } },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** Extra export buttons set apart from the table's own, with what they export. */
function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-r border-slate-200 pr-2">
      <span className="text-xs font-medium text-slate-500">{label}:</span>
      {children}
    </div>
  );
}

/** First day of the current month and today, as the default claim period. */
function thisMonth(): [string, string] {
  const today = isoDate(Date.now());
  return [`${today.slice(0, 8)}01`, today];
}

/** International reports (PLAN.md §13 P7). Each tab is one table with Excel, CSV and PDF export. */
export function IntlReportsScreen() {
  const project = useProjectStore((s) => s.project)!;
  const go = useUiStore((s) => s.go);
  const [tab, setTab] = useState<Tab>('contact');
  const [[from, to], setRange] = useState(thisMonth);
  const hasTimetable = !!project.activeVersionId;

  const contact = useMemo(() => contactHours(project), [project]);
  const rooms = useMemo(() => roomUtilisation(project), [project]);
  const contract = useMemo(() => contractHours(project), [project]);
  const claims = useMemo(() => visitingClaims(project, from, to), [project, from, to]);
  const sets = useMemo(() => setSummary(project), [project]);
  const houses = useMemo(() => houseSummary(project), [project]);
  const houseLists = useMemo(() => project.houses.map((h) => houseList(project, h.id)), [project]);
  const ccas = useMemo(() => ccaSummary(project), [project]);
  const rosters = useMemo(() => project.ccas.map((c) => ccaRoster(project, c.id)), [project]);
  const meets = tx('Meets');
  const short = contact.rows.filter((r) => r.status && r.status !== meets).length;

  return (
    <div className="space-y-4">
      <PageHeader title={tx('International reports')}>
        {tx('Contact time against each board\'s guided learning hours, room use, contract hours for expatriate staff, visiting specialists\' claims for payroll, teaching sets, houses and co-curricular rosters.')}
      </PageHeader>

      <div role="tablist" aria-label={tx('International reports')} className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            data-testid={`intl-tab-${t.id}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === t.id ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {t.label}
            {t.id === 'contact' && short > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">{short}</span>
            )}
          </button>
        ))}
      </div>

      {!hasTimetable && ['contact', 'rooms', 'contract', 'visiting'].includes(tab) && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <Rich
            text={tx('These figures come from the timetable. <link>Generate one first</link>.')}
            tags={{ link: (c) => <button className="font-medium underline" onClick={() => go('generate')}>{c}</button> }}
          />
        </p>
      )}

      {tab === 'contact' && (
        <>
          {!project.institute.teachingWeeks && (
            <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
              <Rich
                text={tx('Hours a year need the number of teaching weeks. <link>Set it in School & bells</link>.')}
                tags={{ link: (c) => <button className="font-medium underline" onClick={() => go('school')}>{c}</button> }}
              />
            </p>
          )}
          <ReportView project={project} table={contact} />
        </>
      )}
      {tab === 'rooms' && <ReportView project={project} table={rooms} />}
      {tab === 'contract' && <ReportView project={project} table={contract} />}
      {tab === 'visiting' && (
        <ReportView
          project={project}
          table={claims}
          actions={
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1">
                {tx('From')}
                <input
                  type="date"
                  className="field w-36"
                  value={from}
                  onChange={(e) => e.target.value && setRange([e.target.value, to < e.target.value ? e.target.value : to])}
                />
              </label>
              <label className="flex items-center gap-1">
                {tx('to')}
                <input
                  type="date"
                  className="field w-36"
                  value={to}
                  min={from}
                  max={addDays(from, 366)}
                  onChange={(e) => e.target.value && setRange([from, e.target.value])}
                />
              </label>
            </div>
          }
        />
      )}
      {tab === 'sets' && <ReportView project={project} table={sets} />}
      {tab === 'houses' && (
        <>
          <ReportView
            project={project}
            table={houses}
            actions={
              houseLists.length > 0 && (
                <Labelled label={tx('House lists')}>{<ExportButtons project={project} tables={houseLists} label="house-lists" />}</Labelled>
              )
            }
          />
          <p className="text-xs text-slate-500">{tx('House lists export every house as its own sheet (Excel) or pages (PDF).')}</p>
        </>
      )}
      {tab === 'ccas' && (
        <ReportView
          project={project}
          table={ccas}
          actions={
            rosters.length > 0 && <Labelled label={tx('Rosters')}>{<ExportButtons project={project} tables={rosters} label="activity-rosters" />}</Labelled>
          }
        />
      )}
    </div>
  );
}
