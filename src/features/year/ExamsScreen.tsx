import { useMemo, useState } from 'react';
import { newId } from '@/domain/common';
import { autoInvigilate, examClashes, examDates, examOverlay, invigilationLoad, makeExamSeries } from '@/domain/exams';
import type { ExamSeries } from '@/domain/schedule';
import { formatClock } from '@/domain/time';
import { downloadBlob } from '@/io/projectFile';
import { examTimetableSheet, invigilationSheet } from '@/print/examSheets';
import { sheetsToPdf } from '@/print/output';
import { SheetRenderer } from '@/print/SheetRenderer';
import type { Sheet } from '@/print/sheets';
import '@/print/sheet.css';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty, IconButton, PageHeader, TextInput, TrashIcon } from '@/ui/kit';

const toClock = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Term tests (PLAN.md §8.5): set the paper grid, assign invigilators fairly,
 * check for clashes, print the exam timetable and the invigilation roster.
 */
export function ExamsScreen() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [selected, setSelected] = useState<string | null>(project.exams[0]?.id ?? null);
  const series = project.exams.find((s) => s.id === selected) ?? project.exams[0];
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [print, setPrint] = useState<Sheet[] | null>(null);

  const dates = useMemo(() => (series ? examDates(project, series) : []), [project, series]);
  const clashes = useMemo(() => (series ? examClashes(project, series) : []), [project, series]);
  const load = useMemo(() => (series ? invigilationLoad(series) : new Map<string, number>()), [series]);

  const edit = (fn: (s: ExamSeries) => void) =>
    update((d) => {
      const s = d.exams.find((x) => x.id === series?.id);
      if (s) fn(s);
    });
  const create = () => {
    const now = new Date();
    const from = now.toISOString().slice(0, 10);
    now.setDate(now.getDate() + 13);
    const s = makeExamSeries({
      name: `Term test ${project.exams.length + 1}`,
      from,
      to: now.toISOString().slice(0, 10),
    });
    update((d) => void d.exams.push(s));
    setSelected(s.id);
  };

  const classes = [...project.classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const grades = [...project.grades].sort((a, b) => a.level - b.level).filter((g) => classes.some((c) => c.gradeId === g.id));
  const name = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? '?';
  const sessionOk = series?.sessions.some((x) => x.id === sessionId);

  if (!series)
    return (
      <div className="space-y-4">
        <PageHeader title="Term tests">Plan the paper timetable and invigilation for a term test. The weekly timetable is not changed.</PageHeader>
        <Empty>
          No term tests yet.{' '}
          <button className="text-teal-700 underline" onClick={create} data-testid="exam-new">
            Create one
          </button>
          .
        </Empty>
      </div>
    );

  const addPaper = () => {
    edit(
      (s) =>
        void s.papers.push({
          id: newId('pap'),
          subjectId,
          classIds,
          date,
          sessionId: sessionOk ? sessionId : s.sessions[0]!.id,
        }),
    );
    setClassIds([]);
  };
  const papersByDate = [...series.papers].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || series.sessions.findIndex((x) => x.id === a.sessionId) - series.sessions.findIndex((x) => x.id === b.sessionId),
  );
  const loads = [...load.values()];
  const lang = project.institute.printLanguage;

  return (
    <div className="space-y-4">
      <PageHeader title="Term tests">Plan the paper timetable and invigilation for a term test. The weekly timetable is not changed.</PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <select className="field w-60" value={series.id} onChange={(e) => setSelected(e.target.value)} aria-label="Term test">
          {project.exams.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={create} data-testid="exam-new">
          New term test
        </button>
        <button
          className="btn"
          onClick={() => {
            if (!confirm(`Delete ${series.name}?`)) return;
            update((d) => {
              d.exams = d.exams.filter((x) => x.id !== series.id);
              d.overlays = d.overlays.filter((o) => o.id !== `ovl_${series.id}`);
            });
            setSelected(null);
          }}
        >
          Delete
        </button>
      </div>

      <Card title="Dates and sessions">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="label">Name</span>
            <TextInput className="w-56" value={series.name} onChange={(v) => edit((s) => void (s.name = v))} aria-label="Term test name" />
          </label>
          <label className="text-sm">
            <span className="label">From</span>
            <input type="date" className="field w-40" value={series.from} onChange={(e) => edit((s) => void (s.from = e.target.value))} />
          </label>
          <label className="text-sm">
            <span className="label">To</span>
            <input
              type="date"
              className="field w-40"
              value={series.to}
              min={series.from}
              onChange={(e) => edit((s) => void (s.to = e.target.value))}
            />
          </label>
          <span className="pb-2 text-sm text-slate-600">{dates.length} school day(s)</span>
        </div>
        <ul className="mt-3 space-y-1">
          {series.sessions.map((ses, i) => (
            <li key={ses.id} className="flex flex-wrap items-center gap-2 text-sm">
              <TextInput
                className="w-32"
                value={ses.label}
                onChange={(v) => edit((s) => void (s.sessions[i]!.label = v))}
                aria-label="Session name"
              />
              <input
                type="time"
                className="field w-28"
                value={formatClock(ses.start)}
                onChange={(e) => edit((s) => void (s.sessions[i]!.start = toClock(e.target.value)))}
              />
              –
              <input
                type="time"
                className="field w-28"
                value={formatClock(ses.end)}
                onChange={(e) => edit((s) => void (s.sessions[i]!.end = toClock(e.target.value)))}
              />
              {series.sessions.length > 1 && !series.papers.some((pp) => pp.sessionId === ses.id) && (
                <IconButton
                  label={`Remove ${ses.label}`}
                  danger
                  onClick={() => edit((s) => void (s.sessions = s.sessions.filter((x) => x.id !== ses.id)))}
                >
                  <TrashIcon />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
        <button
          className="mt-2 text-sm text-teal-700 underline"
          onClick={() =>
            edit(
              (s) =>
                void s.sessions.push({
                  id: newId('ses'),
                  label: `Session ${s.sessions.length + 1}`,
                  start: 13 * 60,
                  end: 14 * 60,
                }),
            )
          }
        >
          Add session
        </button>
      </Card>

      <Card title="Add a paper">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="label">Subject</span>
            <select className="field w-52" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} data-testid="paper-subject">
              <option value="">Choose…</option>
              {project.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Date</span>
            <select className="field w-44" value={date} onChange={(e) => setDate(e.target.value)} data-testid="paper-date">
              <option value="">Choose…</option>
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}{' '}
                  {new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    timeZone: 'UTC',
                  })}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Session</span>
            <select className="field w-40" value={sessionOk ? sessionId : series.sessions[0]?.id} onChange={(e) => setSessionId(e.target.value)}>
              {series.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" disabled={!subjectId || !date || !classIds.length} onClick={addPaper} data-testid="paper-add">
            Add paper
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1" aria-label="Whole grade">
          {grades.map((g) => (
            <button
              key={g.id}
              className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100"
              onClick={() => setClassIds([...new Set([...classIds, ...classes.filter((c) => c.gradeId === g.id).map((c) => c.id)])])}
            >
              + {g.name}
            </button>
          ))}
          {classIds.length > 0 && (
            <button className="px-2 text-xs text-slate-600 underline" onClick={() => setClassIds([])}>
              clear
            </button>
          )}
        </div>
        <div className="mt-2 flex max-h-32 flex-wrap gap-1 overflow-y-auto" aria-label="Classes sitting">
          {classes.map((c) => {
            const on = classIds.includes(c.id);
            return (
              <button
                key={c.id}
                aria-pressed={on}
                className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white'}`}
                onClick={() => setClassIds(on ? classIds.filter((x) => x !== c.id) : [...classIds, c.id])}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </Card>

      <Card
        title={`Papers (${series.papers.length})`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              disabled={!series.papers.length}
              onClick={() => edit((s) => void (s.invigilation = autoInvigilate(project, series)))}
              data-testid="exam-invigilate"
            >
              Assign invigilators
            </button>
            <button
              className="btn"
              disabled={!series.papers.length}
              onClick={() =>
                update((d) => {
                  const s = d.exams.find((x) => x.id === series.id);
                  if (s) examOverlay(d, s);
                })
              }
              data-testid="exam-calendar"
            >
              {project.overlays.some((o) => o.id === `ovl_${series.id}`) ? 'Update calendar' : 'Add to calendar'}
            </button>
          </div>
        }
      >
        {series.papers.length === 0 ? (
          <p className="text-sm text-slate-600">No papers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="paper-table">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-1 pr-2">Date</th>
                  <th className="pr-2">Session</th>
                  <th className="pr-2">Subject</th>
                  <th className="pr-2">Classes · invigilators</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {papersByDate.map((pp) => (
                  <tr key={pp.id} className="align-top">
                    <td className="py-1 pr-2 whitespace-nowrap">{pp.date}</td>
                    <td className="pr-2">
                      {name(
                        series.sessions.map((x) => ({
                          id: x.id,
                          name: x.label,
                        })),
                        pp.sessionId,
                      )}
                    </td>
                    <td className="pr-2">{name(project.subjects, pp.subjectId)}</td>
                    <td className="pr-2 text-xs">
                      {pp.classIds.map((c) => {
                        const i = series.invigilation.find((x) => x.paperId === pp.id && x.classId === c);
                        return (
                          <span key={c} className="mr-2 inline-block">
                            <b>{name(project.classes, c)}</b> {i ? name(project.teachers, i.teacherId) : <span className="text-red-700">—</span>}
                          </span>
                        );
                      })}
                    </td>
                    <td>
                      <IconButton
                        label="Delete paper"
                        danger
                        onClick={() =>
                          edit((s) => {
                            s.papers = s.papers.filter((x) => x.id !== pp.id);
                            s.invigilation = s.invigilation.filter((x) => x.paperId !== pp.id);
                          })
                        }
                      >
                        <TrashIcon />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {loads.length > 0 && (
          <p className="mt-2 text-xs text-slate-600" data-testid="exam-load">
            Invigilation duties: {loads.length} teacher(s), {Math.min(...loads)}–{Math.max(...loads)} each.
          </p>
        )}
      </Card>

      {series.papers.length > 0 && (
        <Card title={clashes.length ? `Problems (${clashes.length})` : 'No problems'}>
          {clashes.length === 0 ? (
            <p className="text-sm text-emerald-800">No class sits two papers at once, and every invigilator is present and in one place.</p>
          ) : (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-900" data-testid="exam-clashes">
              {clashes.slice(0, 30).map((c, i) => (
                <li key={i}>{c.message}</li>
              ))}
              {clashes.length > 30 && <li>…and {clashes.length - 30} more</li>}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => setPrint([examTimetableSheet(project, series, lang)])} data-testid="exam-print">
              Exam timetable (PDF)
            </button>
            <button className="btn" onClick={() => setPrint([invigilationSheet(project, series, lang)])}>
              Invigilation roster (PDF)
            </button>
          </div>
        </Card>
      )}

      {print && (
        <SheetRenderer
          sheets={print}
          print={false}
          onReady={(nodes) =>
            void sheetsToPdf(nodes, () => {})
              .then((b) => downloadBlob(b, `${print[0]!.fileName}-${lang}.pdf`))
              .finally(() => setPrint(null))
          }
        />
      )}
    </div>
  );
}
