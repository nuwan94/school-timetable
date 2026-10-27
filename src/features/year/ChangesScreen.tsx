import { produce } from 'immer';
import { useMemo, useState } from 'react';
import { diffVersion, examClassesLeave, longLeave, newAppointee, saveChangeVersion, teacherLeaves } from '@/domain/midyear';
import type { Project } from '@/domain/project';
import { approveActiveVersion, snapshotOf } from '@/domain/timetable';
import { downloadBlob } from '@/io/projectFile';
import { changeNotices } from '@/print/changeSheets';
import { dayName } from '@/print/labels';
import { sheetsToPdf } from '@/print/output';
import { SheetRenderer } from '@/print/SheetRenderer';
import type { Sheet } from '@/print/sheets';
import '@/print/sheet.css';
import type { GenerateResult } from '@/solver';
import { runSolver } from '@/solver/runner';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty, PageHeader, TextInput } from '@/ui/kit';

type Template = 'leaves' | 'appointee' | 'longLeave' | 'examClasses';

const TEMPLATES: { value: Template; label: string; help: string }[] = [
  {
    value: 'leaves',
    label: 'A teacher leaves or transfers',
    help: 'Their lessons and class-teacher roles go to another teacher, or stay uncovered.',
  },
  {
    value: 'appointee',
    label: 'A new teacher joins',
    help: 'Hand them lessons that are uncovered or taken from someone else.',
  },
  {
    value: 'longLeave',
    label: 'Long leave (maternity, study…)',
    help: 'The timetable stays; a named cover teacher is suggested first in daily relief.',
  },
  {
    value: 'examClasses',
    label: 'Exam classes leave',
    help: 'e.g. Grade 11 after the O/L: their periods free up and their teachers can do relief.',
  },
];

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Mid-year change wizard (PLAN.md §7): describe what happened, update the
 * approved timetable with as few moves as possible, review who is affected,
 * approve, and print a change notice for each affected teacher.
 */
export function ChangesScreen({ onPrint }: { onPrint: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const approved = project.versions.find((v) => v.status === 'approved');
  const active = project.versions.find((v) => v.id === project.activeVersionId);
  const pending = active?.status === 'draft' && active.baseSnapshot.length > 0 ? active : null;

  const [template, setTemplate] = useState<Template>('leaves');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [otherId, setOtherId] = useState('');
  const [name, setName] = useState('');
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [allocationIds, setAllocationIds] = useState<string[]>([]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notices, setNotices] = useState<Sheet[] | null>(null);

  const teachers = project.teachers.filter((t) => t.active);
  const subjectName = (id: string) => project.subjects.find((s) => s.id === id)?.name ?? '?';
  const className = (id: string) => project.classes.find((c) => c.id === id)?.name ?? project.studentGroups.find((g) => g.id === id)?.name ?? '?';
  const teacherName = (id: string) => project.teachers.find((t) => t.id === id)?.name ?? '?';
  const handover = project.allocations.filter((a) => a.status === 'uncovered' || (otherId && a.teacherIds.includes(otherId)));

  const diff = useMemo(() => (pending ? diffVersion(project, pending) : null), [project, pending]);

  if (!approved && !pending)
    return (
      <div>
        <PageHeader title="Mid-year changes" />
        <Empty>Approve a timetable first (in Edit). Changes start from the approved timetable so you can see exactly what moves.</Empty>
      </div>
    );

  const ready =
    template === 'leaves'
      ? !!teacherId
      : template === 'appointee'
        ? !!name.trim() && allocationIds.length > 0
        : template === 'longLeave'
          ? !!teacherId && !!to && to >= from
          : classIds.length > 0 && !!to && to >= from;

  const change = (d: Project) =>
    produce(d, (x) => {
      if (template === 'leaves') teacherLeaves(x, teacherId, otherId || null);
      if (template === 'appointee') newAppointee(x, { name: name.trim(), subjectIds }, allocationIds);
      if (template === 'longLeave')
        longLeave(x, {
          teacherId,
          from,
          to,
          coverTeacherId: otherId || null,
          reason,
        });
      if (template === 'examClasses')
        examClassesLeave(x, {
          classIds,
          from,
          to,
          name: reason || 'Exam classes leave',
        });
    });

  const describe = () =>
    template === 'leaves'
      ? `${teacherName(teacherId)} leaves${otherId ? ` → ${teacherName(otherId)}` : ''}`
      : template === 'appointee'
        ? `${name.trim()} joins`
        : template === 'longLeave'
          ? `${teacherName(teacherId)} on leave ${from} – ${to}`
          : `${classIds.map(className).join(', ')} leave from ${from}`;

  const apply = async () => {
    setMessage(null);
    setResult(null);
    const changed = change(project);
    const copyData = (d: Project, c: Project) => {
      d.teachers = c.teachers;
      d.allocations = c.allocations;
      d.optionBlocks = c.optionBlocks;
      d.classes = c.classes;
      d.absences = c.absences;
      d.overlays = c.overlays;
    };
    if (template === 'longLeave' || template === 'examClasses') {
      // Dated changes: the weekly timetable stays; relief and the calendar handle the dates.
      update((d) => copyData(d as Project, changed));
      setMessage(
        template === 'longLeave'
          ? `Saved. From ${from} to ${to}, Today — relief lists ${teacherName(teacherId)}'s lessons${otherId ? ` and suggests ${teacherName(otherId)} first` : ''}.`
          : `Saved. From ${from}, these classes drop out of daily relief and their teachers count as free.`,
      );
      return;
    }
    const base = approved!;
    setBusy(true);
    try {
      const r = await runSolver(
        changed,
        {
          seed: 1,
          optimiseMs: 2500,
          start: { placements: base.placements, mode: 'minimal' },
        },
        () => {},
      ).result;
      const snapshot = snapshotOf(project, base);
      update((d) => {
        copyData(d as Project, changed);
        saveChangeVersion(d, {
          name: describe(),
          effectiveFrom: from,
          placements: r.placements,
          baseId: base.id,
          baseSnapshot: snapshot,
        });
      });
      setResult(r);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const downloadNotices = () => setNotices(changeNotices(project, pending ?? active!, project.institute.printLanguage));

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const when = (s: { day: Parameters<typeof dayName>[1]; slotIds: string[] } | null) => {
    if (!s) return '—';
    const labels = s.slotIds.map((id) => project.bellSchedules.flatMap((b) => b.slots).find((x) => x.id === id)?.label ?? '?');
    return `${dayName('en', s.day, true)} ${[...new Set(labels)].join('–')}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Mid-year changes">
        When staff or classes change during the year, update the approved timetable with as few moves as possible and tell only the people affected.
      </PageHeader>

      {!pending && (
        <Card title="1. What changed?">
          <fieldset className="grid gap-2 sm:grid-cols-2" aria-label="Kind of change">
            {TEMPLATES.map((t) => (
              <label
                key={t.value}
                className={`flex cursor-pointer gap-2 rounded-md border p-2 text-sm ${template === t.value ? 'border-teal-600 bg-teal-50' : 'border-slate-200'}`}
              >
                <input
                  type="radio"
                  name="change-kind"
                  className="mt-0.5"
                  checked={template === t.value}
                  onChange={() => {
                    setTemplate(t.value);
                    setOtherId('');
                    setMessage(null);
                  }}
                />
                <span>
                  <span className="font-medium">{t.label}</span>
                  <span className="block text-xs text-slate-600">{t.help}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            {(template === 'leaves' || template === 'longLeave') && (
              <label className="text-sm">
                <span className="label">Teacher</span>
                <select className="field w-56" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} data-testid="change-teacher">
                  <option value="">Choose…</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(template === 'leaves' || template === 'longLeave') && (
              <label className="text-sm">
                <span className="label">{template === 'leaves' ? 'Lessons go to' : 'Cover teacher'}</span>
                <select className="field w-56" value={otherId} onChange={(e) => setOtherId(e.target.value)} data-testid="change-other">
                  <option value="">{template === 'leaves' ? 'Nobody yet (uncovered)' : 'None — daily relief'}</option>
                  {teachers
                    .filter((t) => t.id !== teacherId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {template === 'appointee' && (
              <>
                <label className="text-sm">
                  <span className="label">Name</span>
                  <TextInput className="w-56" value={name} onChange={setName} data-testid="change-name" />
                </label>
                <label className="text-sm">
                  <span className="label">Takes lessons from</span>
                  <select className="field w-56" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
                    <option value="">Uncovered lessons only</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="text-sm">
              <span className="label">{template === 'leaves' || template === 'appointee' ? 'Effective from' : 'From'}</span>
              <input type="date" className="field w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            {(template === 'longLeave' || template === 'examClasses') && (
              <>
                <label className="text-sm">
                  <span className="label">To</span>
                  <input type="date" className="field w-40" value={to} onChange={(e) => setTo(e.target.value)} data-testid="change-to" />
                </label>
                <label className="text-sm">
                  <span className="label">{template === 'longLeave' ? 'Reason' : 'Name'}</span>
                  <TextInput
                    className="w-48"
                    value={reason}
                    onChange={setReason}
                    placeholder={template === 'longLeave' ? 'Maternity leave' : 'G.C.E. O/L exam'}
                  />
                </label>
              </>
            )}
          </div>

          {template === 'appointee' && (
            <div className="mt-3 space-y-3">
              <div>
                <p className="label">Subjects they teach</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {project.subjects.map((s) => (
                    <button
                      key={s.id}
                      aria-pressed={subjectIds.includes(s.id)}
                      className={`rounded-full border px-2.5 py-1 text-sm ${subjectIds.includes(s.id) ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white'}`}
                      onClick={() => toggle(subjectIds, setSubjectIds, s.id)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="label">Lessons to hand over ({allocationIds.length})</p>
                {handover.length === 0 ? (
                  <p className="text-sm text-slate-600">No uncovered lessons. Choose a teacher to take lessons from.</p>
                ) : (
                  <ul className="mt-1 grid max-h-64 gap-0.5 overflow-y-auto text-sm sm:grid-cols-2" data-testid="handover">
                    {handover.map((a) => (
                      <li key={a.id}>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={allocationIds.includes(a.id)}
                            onChange={() => toggle(allocationIds, setAllocationIds, a.id)}
                          />
                          {a.groupIds.map(className).join('+')} · {subjectName(a.subjectId)} · {a.pattern.reduce((n, x) => n + x.length * x.count, 0)}
                          p{a.status === 'uncovered' ? <span className="text-xs text-red-700">uncovered</span> : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {template === 'examClasses' && (
            <div className="mt-3 flex flex-wrap gap-1" aria-label="Classes leaving">
              {project.classes.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={classIds.includes(c.id)}
                  className={`rounded-full border px-2.5 py-1 text-sm ${classIds.includes(c.id) ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white'}`}
                  onClick={() => toggle(classIds, setClassIds, c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void apply()} data-testid="change-apply">
              {busy ? 'Updating the timetable…' : template === 'longLeave' || template === 'examClasses' ? 'Save' : 'Update with least change'}
            </button>
            {message && (
              <p className="text-sm text-slate-700" role="status" data-testid="change-message">
                {message}
              </p>
            )}
          </div>
        </Card>
      )}

      {pending && diff && (
        <Card
          title={`2. Review: ${pending.name}`}
          actions={
            <button
              className="text-xs text-slate-600 underline"
              onClick={() =>
                update((d) => {
                  d.versions = d.versions.filter((v) => v.id !== pending.id);
                  d.activeVersionId = approved?.id ?? null;
                })
              }
            >
              Discard draft
            </button>
          }
        >
          {result && result.unplaced.length > 0 && (
            <p className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
              {result.unplaced.length} lesson(s) found no place, e.g. {result.unplaced[0]!.label}: {result.unplaced[0]!.reason}. Fix them in Edit
              before approving.
            </p>
          )}
          <p className="text-sm" data-testid="diff-summary">
            <b>{diff.changes.length}</b> lesson(s) change · <b>{diff.teachers.size}</b> teacher(s) and <b>{diff.classes.size}</b> class(es) affected
            {pending.effectiveFrom ? ` · from ${pending.effectiveFrom}` : ''}.
          </p>
          {diff.teachers.size > 0 && <p className="mt-1 text-sm text-slate-600">Teachers: {[...diff.teachers.keys()].map(teacherName).join(', ')}</p>}
          {diff.changes.length > 0 && (
            <div className="mt-3 max-h-80 overflow-auto">
              <table className="w-full text-sm" data-testid="diff-table">
                <thead className="sticky top-0 bg-white text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-1 pr-2">Class</th>
                    <th className="pr-2">Subject</th>
                    <th className="pr-2">Before</th>
                    <th className="pr-2">Now</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {diff.changes.map((c) => (
                    <tr key={c.key}>
                      <td className="py-1 pr-2">{c.classIds.map(className).join('+')}</td>
                      <td className="pr-2">{subjectName(c.subjectId)}</td>
                      <td className="pr-2 text-slate-500">
                        {when(c.before)} {c.before ? `· ${c.before.teacherIds.map(teacherName).join(', ') || '—'}` : ''}
                      </td>
                      <td className="pr-2">
                        {when(c.after)} {c.after ? `· ${c.after.teacherIds.map(teacherName).join(', ') || '—'}` : ''}
                      </td>
                      <td className="text-xs text-slate-600">{c.what.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              onClick={() => update((d) => approveActiveVersion(d, pending.effectiveFrom))}
              data-testid="change-approve"
            >
              Approve from {pending.effectiveFrom ?? 'now'}
            </button>
            <button className="btn" onClick={downloadNotices} disabled={!diff.teachers.size}>
              Change notices (PDF, draft)
            </button>
          </div>
        </Card>
      )}

      {!pending && active?.status === 'approved' && active.baseSnapshot.length > 0 && (
        <Card title={`Approved: ${active.name}`}>
          <p className="text-sm">Give each affected teacher their change notice, and reprint only the sheets that changed.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={downloadNotices} data-testid="change-notices">
              Download change notices
            </button>
            <button className="btn" onClick={onPrint}>
              Print changed sheets →
            </button>
          </div>
        </Card>
      )}

      {notices && (
        <SheetRenderer
          sheets={notices}
          print={false}
          onReady={(nodes) =>
            void sheetsToPdf(nodes, () => {})
              .then((b) => downloadBlob(b, `change-notices-${project.institute.printLanguage}-${today()}.pdf`))
              .finally(() => setNotices(null))
          }
        />
      )}
    </div>
  );
}
