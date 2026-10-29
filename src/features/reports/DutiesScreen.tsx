import { useMemo, useState } from 'react';
import { newId } from '@/domain/common';
import { autoAssignDuties, dutyClashes, dutyKey, makeDutyRoster, sessionLabel } from '@/domain/duties';
import { dutyCounts, type ReportTable } from '@/domain/returns';
import type { DutyRoster } from '@/domain/schedule';
import { formatClock, type Weekday } from '@/domain/time';
import { dutyRosterSheet } from '@/print/dutySheets';
import type { Lang } from '@/print/labels';
import { useProjectStore } from '@/store/projectStore';
import { confirmDialog } from '@/ui/dialogs';
import { Card, Chips, Empty, IconButton, PageHeader, Select, TextInput, TrashIcon } from '@/ui/kit';
import { ExportButtons } from '@/ui/ReportView';
import { tx } from '@/i18n';

const DAY_LABELS: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', get label() { return tx('English'); } },
  { value: 'si', label: 'සිංහල' },
  { value: 'ta', label: 'தமிழ்' },
];
const toClock = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Interval and gate duty rosters: posts × sessions × days, filled fairly, printed for the notice board. */
export function DutiesScreen() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [selected, setSelected] = useState<string | null>(project.dutyRosters[0]?.id ?? null);
  const roster = project.dutyRosters.find((r) => r.id === selected) ?? project.dutyRosters[0];
  const [newPost, setNewPost] = useState('');
  const [lang, setLang] = useState<Lang>(project.institute.printLanguage);
  const clashes = useMemo(() => (roster ? dutyClashes(project, roster) : []), [project, roster]);
  const totals = useMemo(() => dutyCounts(project), [project]);

  const edit = (fn: (r: DutyRoster) => void) =>
    update((d) => {
      const r = d.dutyRosters.find((x) => x.id === roster?.id);
      if (r) fn(r);
    });
  const create = (kind: DutyRoster['kind']) => {
    const r = makeDutyRoster(project, kind);
    update((d) => void d.dutyRosters.push(r));
    setSelected(r.id);
  };

  const teacherOptions = [
    { value: '', label: '—' },
    ...[...project.teachers]
      .filter((t) => t.active)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ value: t.id, label: `${t.name} (${totals.get(t.id) ?? 0})` })),
  ];
  const who = new Map(roster?.assignments.map((a) => [dutyKey(a), a.teacherId]) ?? []);
  const setCell = (day: Weekday, sessionId: string, post: string, teacherId: string) =>
    edit((r) => {
      r.assignments = r.assignments.filter((a) => dutyKey(a) !== dutyKey({ day, sessionId, post }));
      if (teacherId) r.assignments.push({ day, sessionId, post, teacherId });
    });

  const table: ReportTable | null = roster
    ? {
        id: 'duty',
        title: roster.name,
        columns: [
          { key: 'session', label: tx('Session') },
          { key: 'post', label: tx('Place') },
          ...roster.days.map((d) => ({ key: d, label: DAY_LABELS[d] })),
        ],
        rows: roster.sessions.flatMap((s) =>
          roster.posts.map((post) => ({
            session: sessionLabel(s),
            post,
            ...Object.fromEntries(
              roster.days.map((d) => [d, project.teachers.find((t) => t.id === who.get(dutyKey({ day: d, sessionId: s.id, post })))?.name ?? '']),
            ),
          })),
        ),
      }
    : null;

  return (
    <div className="space-y-4">
      <PageHeader title={tx('Duty rosters')}>
        {tx('Interval and gate duty for the week. Auto-fill shares duties evenly, skips visiting staff and coaches, and never puts anyone on duty during their lesson or another duty.')}
      </PageHeader>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {project.dutyRosters.length > 0 && (
            <Select
              aria-label={tx('Duty roster')}
              value={roster?.id ?? ''}
              options={project.dutyRosters.map((r) => ({ value: r.id, label: r.name }))}
              onChange={setSelected}
              className="w-56"
              data-testid="duty-select"
            />
          )}
          <button className="btn btn-primary" onClick={() => create('interval')} data-testid="duty-new-interval">
            {tx('+ Interval duty')}
          </button>
          <button className="btn" onClick={() => create('gate')} data-testid="duty-new-gate">
            {tx('+ Gate duty')}
          </button>
          <button className="btn" onClick={() => create('other')}>
            {tx('+ Other')}
          </button>
          {roster && (
            <button
              className="btn ml-auto"
              onClick={async () => {
                if (!(await confirmDialog(tx('Delete {name}?', { name: roster.name }), { confirmText: tx('Delete'), danger: true }))) return;
                update((d) => void (d.dutyRosters = d.dutyRosters.filter((x) => x.id !== roster.id)));
                setSelected(null);
              }}
            >
              {tx('Delete roster')}
            </button>
          )}
        </div>
      </Card>

      {!roster ? (
        <Empty>{tx('No duty rosters yet. Start with interval or gate duty.')}</Empty>
      ) : (
        <>
          <Card title={tx('Roster')}>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="label">{tx('Name')}</span>
                <TextInput value={roster.name} onChange={(v) => edit((r) => void (r.name = v))} />
              </label>
              <div>
                <span className="label">{tx('Days')}</span>
                <Chips
                  value={roster.days}
                  options={project.institute.workingDays.map((d) => ({ value: d, label: DAY_LABELS[d] }))}
                  onChange={(v) => edit((r) => void (r.days = project.institute.workingDays.filter((d) => v.includes(d))))}
                />
              </div>
              <div>
                <span className="label">{tx('Places')}</span>
                <div className="flex flex-wrap items-center gap-1.5" data-testid="duty-posts">
                  {roster.posts.map((post) => (
                    <span
                      key={post}
                      className="inline-flex items-center gap-1 rounded-full bg-teal-50 py-0.5 pl-2.5 pr-1 text-sm text-teal-900 ring-1 ring-teal-200"
                    >
                      {post}
                      <button
                        aria-label={tx('Remove {post}', { post })}
                        className="rounded-full px-1 text-teal-700 hover:bg-teal-100"
                        onClick={() =>
                          edit((r) => {
                            r.posts = r.posts.filter((x) => x !== post);
                            r.assignments = r.assignments.filter((a) => a.post !== post);
                          })
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <form
                    className="inline-flex gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const p = newPost.trim();
                      if (p && !roster.posts.includes(p)) edit((r) => void r.posts.push(p));
                      setNewPost('');
                    }}
                  >
                    <TextInput aria-label={tx('New place')} placeholder={tx('Add a place')} value={newPost} onChange={setNewPost} className="w-36" />
                    <button className="btn" type="submit">
                      {tx('Add')}
                    </button>
                  </form>
                </div>
              </div>
              <div>
                <span className="label">{tx('Sessions')}</span>
                <ul className="space-y-1.5">
                  {roster.sessions.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2">
                      <TextInput
                        aria-label={tx('Session name')}
                        value={s.label}
                        onChange={(v) => edit((r) => void (r.sessions.find((x) => x.id === s.id)!.label = v))}
                        className="w-32"
                      />
                      <input
                        type="time"
                        aria-label={tx('{label} starts', { label: s.label })}
                        className="field w-28"
                        value={formatClock(s.start)}
                        onChange={(e) => edit((r) => void (r.sessions.find((x) => x.id === s.id)!.start = toClock(e.target.value)))}
                      />
                      <span className="text-slate-400">–</span>
                      <input
                        type="time"
                        aria-label={tx('{label} ends', { label: s.label })}
                        className="field w-28"
                        value={formatClock(s.end)}
                        onChange={(e) => edit((r) => void (r.sessions.find((x) => x.id === s.id)!.end = toClock(e.target.value)))}
                      />
                      <IconButton
                        label={tx('Remove {label}', { label: s.label })}
                        danger
                        onClick={() =>
                          edit((r) => {
                            r.sessions = r.sessions.filter((x) => x.id !== s.id);
                            r.assignments = r.assignments.filter((a) => a.sessionId !== s.id);
                          })
                        }
                      >
                        <TrashIcon />
                      </IconButton>
                    </li>
                  ))}
                </ul>
                <button
                  className="btn mt-2"
                  onClick={() => edit((r) => void r.sessions.push({ id: newId('dses'), label: tx('Session'), start: 12 * 60, end: 12 * 60 + 30 }))}
                >
                  {tx('+ Session')}
                </button>
              </div>
            </div>
          </Card>

          <Card
            title={tx('Who is on duty')}
            actions={
              <>
                <button
                  className="btn btn-primary"
                  onClick={() => edit((r) => void (r.assignments = autoAssignDuties(project, r)))}
                  data-testid="duty-auto"
                >
                  {tx('Auto-fill')}
                </button>
                <button className="btn" onClick={() => edit((r) => void (r.assignments = []))}>
                  {tx('Clear')}
                </button>
              </>
            }
          >
            <p className="mb-3 text-xs text-slate-500">
              {tx('The number after each name is their duties per week on all rosters. Auto-fill keeps the cells you have set.')}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" data-testid="duty-grid">
                <thead>
                  <tr>
                    <th scope="col" className="px-2 py-1.5 text-left text-xs font-semibold text-slate-500">
                      {tx('Place')}
                    </th>
                    {roster.days.map((d) => (
                      <th key={d} scope="col" className="px-2 py-1.5 text-left text-xs font-semibold text-slate-500">
                        {DAY_LABELS[d]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roster.sessions.map((s) => [
                    <tr key={s.id}>
                      <th
                        colSpan={roster.days.length + 1}
                        scope="colgroup"
                        className="bg-teal-50 px-2 py-1 text-left text-xs font-semibold text-teal-800"
                      >
                        {sessionLabel(s)}
                      </th>
                    </tr>,
                    ...roster.posts.map((post) => (
                      <tr key={`${s.id}-${post}`} className="border-b border-slate-100">
                        <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-medium">
                          {post}
                        </th>
                        {roster.days.map((d) => (
                          <td key={d} className="px-1 py-1">
                            <Select
                              aria-label={`${post}, ${DAY_LABELS[d]}, ${s.label}`}
                              value={who.get(dutyKey({ day: d, sessionId: s.id, post })) ?? ''}
                              options={teacherOptions}
                              onChange={(v) => setCell(d, s.id, post, v)}
                              className="min-w-[9rem]"
                            />
                          </td>
                        ))}
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
            {clashes.length === 0 ? (
              <p className="mt-3 text-sm font-medium text-emerald-700" data-testid="duty-ok">
                {tx('✓ No clashes, every place covered.')}
              </p>
            ) : (
              <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-red-900" data-testid="duty-clashes">
                {clashes.slice(0, 20).map((c, i) => (
                  <li key={i}>{c.message}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <Select aria-label={tx('Print language')} value={lang} options={LANGS} onChange={setLang} className="w-28" />
              {table && <ExportButtons project={project} tables={[table]} label={roster.name} pdf={[dutyRosterSheet(project, roster, lang)]} />}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
