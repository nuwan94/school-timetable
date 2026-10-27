import { useMemo, useState } from 'react';
import { runChecks, type Checks } from '@/domain/checks';
import type { Allocation, Subject } from '@/domain/entities';
import { doublesIn, patternFrom, patternPeriods } from '@/domain/factories';
import { copyClassPeriods, findCellAllocation, setCellAllocation } from '@/domain/mutations';
import type { Project } from '@/domain/project';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty, LevelBadge, NumberInput, PageHeader, Select } from '@/ui/kit';

interface Cell {
  classId: string;
  subjectId: string;
}

const STATUS_STYLE: Record<Allocation['status'], string> = {
  appointed: 'bg-white',
  covering: 'bg-amber-50 ring-1 ring-inset ring-amber-300',
  uncovered: 'bg-red-50 ring-1 ring-inset ring-red-300',
};

const STATUS_LABEL: Record<Allocation['status'], string> = {
  appointed: 'Appointed',
  covering: 'Covering (not appointed for this subject)',
  uncovered: 'Uncovered / self-study (no teacher)',
};

const STATUS_SHORT: Record<Allocation['status'], string> = {
  appointed: 'Appointed',
  covering: 'Covering',
  uncovered: 'No teacher',
};

function teacherLabel(p: Project, checks: Checks, id: string) {
  const t = p.teachers.find((x) => x.id === id);
  const tt = checks.teachers.get(id);
  if (!t || !tt) return '?';
  const limit = tt.max ?? tt.capacity;
  return `${t.name}${t.shortCode ? ` (${t.shortCode})` : ''} — ${tt.periods}/${limit}`;
}

function CellEditor({ cell, checks, onClose }: { cell: Cell; checks: Checks; onClose: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const cls = project.classes.find((c) => c.id === cell.classId);
  const subject = project.subjects.find((s) => s.id === cell.subjectId);
  const alloc = findCellAllocation(project, cell.classId, cell.subjectId);
  if (!cls || !subject) return null;

  const periods = alloc ? patternPeriods(alloc.pattern) : 0;
  const doubles = alloc ? doublesIn(alloc.pattern) : 0;
  const teacherId = alloc?.teacherIds[0] ?? '';
  const set = (change: Parameters<typeof setCellAllocation>[3]) => update((d) => setCellAllocation(d, cell.classId, cell.subjectId, change));

  // Qualified teachers first (and medium-matching first among them), then everyone else.
  const fitsMedium = (media: string[]) => cls.medium === 'bilingual' || media.length === 0 || media.includes(cls.medium);
  const qualified = project.teachers
    .filter((t) => t.subjectIds.includes(subject.id))
    .sort((a, b) => Number(fitsMedium(b.media)) - Number(fitsMedium(a.media)) || a.name.localeCompare(b.name));
  const others = project.teachers.filter((t) => !t.subjectIds.includes(subject.id)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="sticky bottom-0 z-20 -mx-3 mt-4 border-t-2 border-teal-700 bg-white px-3 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] md:mx-0 md:rounded-t-lg">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-2">
          <p className="text-xs uppercase text-slate-500">Editing</p>
          <p className="font-semibold">
            {cls.name} · <span style={{ color: subject.colour }}>{subject.name}</span>
          </p>
        </div>
        <label>
          <span className="label">Periods/week</span>
          <NumberInput autoFocus value={periods} min={0} max={20} onChange={(v) => set({ pattern: patternFrom(v ?? 0, doubles), periods: v ?? 0 })} className="w-20" />
        </label>
        <label>
          <span className="label">of which doubles</span>
          <NumberInput value={doubles} min={0} max={Math.floor(periods / 2)} onChange={(v) => periods > 0 && set({ pattern: patternFrom(periods, v ?? 0) })} className="w-20" />
        </label>
        <label className="min-w-64 flex-1">
          <span className="label">Teacher</span>
          <select
            className="field w-full"
            value={teacherId}
            disabled={periods === 0}
            onChange={(e) => set({ teacherId: e.target.value || null })}
          >
            <option value="">— no teacher (uncovered) —</option>
            {qualified.length > 0 && (
              <optgroup label={`Teaches ${subject.name}`}>
                {qualified.map((t) => (
                  <option key={t.id} value={t.id}>
                    {teacherLabel(project, checks, t.id)}
                    {fitsMedium(t.media) ? '' : ' · other medium'}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Other teachers (will be marked covering)">
                {others.map((t) => (
                  <option key={t.id} value={t.id}>
                    {teacherLabel(project, checks, t.id)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {alloc && (
          <label>
            <span className="label">Status</span>
            <Select
              value={alloc.status}
              options={(Object.keys(STATUS_SHORT) as Allocation['status'][]).map((s) => ({ value: s, label: STATUS_SHORT[s] }))}
              onChange={(status) => set({ status })}
              title={STATUS_LABEL[alloc.status]}
              className="w-40"
            />
          </label>
        )}
        <div className="flex gap-2">
          {alloc && (
            <button className="btn" onClick={() => set({ periods: 0 })}>
              Clear
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function MatrixCell({ alloc, subject, project, selected, onSelect }: { alloc?: Allocation; subject: Subject; project: Project; selected: boolean; onSelect: () => void }) {
  const teacher = alloc?.teacherIds[0] ? project.teachers.find((t) => t.id === alloc.teacherIds[0]) : undefined;
  const periods = alloc ? patternPeriods(alloc.pattern) : 0;
  const doubles = alloc ? doublesIn(alloc.pattern) : 0;
  return (
    <td className="border border-slate-200 p-0">
      <button
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${subject.name}: ${periods ? `${periods} periods${teacher ? `, ${teacher.name}` : ', no teacher'}` : 'not taught'}`}
        title={alloc ? STATUS_LABEL[alloc.status] : 'Click to add'}
        className={`flex h-12 w-full min-w-[58px] flex-col items-center justify-center px-1 text-center leading-tight ${
          alloc ? STATUS_STYLE[alloc.status] : 'text-slate-300 hover:bg-slate-50'
        } ${selected ? 'outline outline-2 -outline-offset-2 outline-teal-600' : ''}`}
      >
        {alloc ? (
          <>
            <span className="text-sm font-semibold tabular-nums">
              {periods}
              {doubles > 0 && <sup className="ml-0.5 text-[9px] font-normal text-slate-500">{doubles}D</sup>}
            </span>
            <span className="max-w-[64px] truncate text-[11px] text-slate-600">{teacher ? teacher.shortCode || teacher.name : '—'}</span>
          </>
        ) : (
          '+'
        )}
      </button>
    </td>
  );
}

export function AllocationsStep() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const checks = useMemo(() => runChecks(project), [project]);
  const grades = [...project.grades].sort((a, b) => a.level - b.level);
  const [gradeId, setGradeId] = useState<string>(grades[0]?.id ?? '');
  const [selected, setSelected] = useState<Cell | null>(null);
  const [showAllSubjects, setShowAllSubjects] = useState(true);
  const [loadSort, setLoadSort] = useState<'name' | 'load'>('load');

  const grade = grades.find((g) => g.id === gradeId) ?? grades[0];
  const classes = project.classes.filter((c) => c.gradeId === grade?.id);
  const usedSubjects = new Set(project.allocations.filter((a) => a.groupIds.some((g) => classes.some((c) => c.id === g))).map((a) => a.subjectId));
  const subjects = showAllSubjects ? project.subjects : project.subjects.filter((s) => usedSubjects.has(s.id));

  if (project.classes.length === 0 || project.subjects.length === 0) {
    return (
      <>
        <PageHeader title="Who teaches what" />
        <Empty>Add classes and subjects first.</Empty>
      </>
    );
  }

  const teacherRows = [...checks.teachers.values()]
    .map((t) => ({ ...t, teacher: project.teachers.find((x) => x.id === t.teacherId)! }))
    .sort((a, b) => (loadSort === 'name' ? a.teacher.name.localeCompare(b.teacher.name) : b.periods - a.periods));
  const selectedTeacher = selected ? findCellAllocation(project, selected.classId, selected.subjectId)?.teacherIds[0] : undefined;
  const errors = checks.issues.filter((i) => i.severity === 'error').length;
  const warnings = checks.issues.filter((i) => i.severity === 'warning').length;

  return (
    <>
      <PageHeader title="Who teaches what">
        Each cell is one subject for one class: periods per week and the teacher. Fill one class, then copy its periods to the
        rest of the grade and just pick teachers. Totals update as you type.
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Grade">
          {grades.map((g) => {
            const gc = project.classes.filter((c) => c.gradeId === g.id);
            const full = gc.length > 0 && gc.every((c) => checks.classes.get(c.id)?.level === 'ok');
            return (
              <button
                key={g.id}
                role="tab"
                aria-selected={g.id === grade?.id}
                onClick={() => {
                  setGradeId(g.id);
                  setSelected(null);
                }}
                className={`rounded-md border px-2.5 py-1 text-sm ${
                  g.id === grade?.id ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'
                }`}
              >
                {g.name}
                {full && ' ✓'}
              </button>
            );
          })}
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={!showAllSubjects} onChange={(e) => setShowAllSubjects(!e.target.checked)} />
          Only subjects in use
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm" data-testid="allocation-matrix">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs uppercase text-slate-500">Class</th>
                {subjects.map((s) => (
                  <th key={s.id} className="border border-slate-200 bg-slate-50 px-1 py-1 text-xs font-semibold" title={s.name}>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: s.colour }} />
                    {s.shortCode || s.name}
                  </th>
                ))}
                <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-xs uppercase text-slate-500">Total</th>
                <th className="border border-slate-200 bg-slate-50 px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => {
                const total = checks.classes.get(c.id)!;
                return (
                  <tr key={c.id}>
                    <th scope="row" className="sticky left-0 z-10 border border-slate-200 bg-white px-2 text-left font-semibold">
                      {c.name}
                    </th>
                    {subjects.map((s) => (
                      <MatrixCell
                        key={s.id}
                        alloc={findCellAllocation(project, c.id, s.id)}
                        subject={s}
                        project={project}
                        selected={selected?.classId === c.id && selected.subjectId === s.id}
                        onSelect={() => setSelected({ classId: c.id, subjectId: s.id })}
                      />
                    ))}
                    <td className="border border-slate-200 px-2 text-center">
                      <LevelBadge level={total.level}>
                        {total.periods}/{total.capacity}
                      </LevelBadge>
                    </td>
                    <td className="whitespace-nowrap border border-slate-200 px-2">
                      {classes.length > 1 && total.periods > 0 && (
                        <button
                          className="text-xs text-teal-800 underline"
                          title={`Copy ${c.name}'s periods per subject to the other classes in ${grade?.name} (teachers are kept)`}
                          onClick={() => {
                            if (confirm(`Copy ${c.name}'s periods to ${classes.filter((x) => x.id !== c.id).map((x) => x.name).join(', ')}? Teachers already chosen are kept.`))
                              update((d) => copyClassPeriods(d, c.id, classes.map((x) => x.id)));
                          }}
                        >
                          Copy to grade
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
          <span>
            <span className="mr-1 inline-block h-3 w-3 border border-slate-300 bg-white align-middle" /> appointed
          </span>
          <span>
            <span className="mr-1 inline-block h-3 w-3 bg-amber-50 ring-1 ring-amber-300 align-middle" /> covering (outside appointment)
          </span>
          <span>
            <span className="mr-1 inline-block h-3 w-3 bg-red-50 ring-1 ring-red-300 align-middle" /> no teacher
          </span>
          <span>2D = two double periods</span>
        </p>
      </div>

      {selected && <CellEditor cell={selected} checks={checks} onClose={() => setSelected(null)} />}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title="Teacher loads"
          actions={
            <Select
              aria-label="Sort teachers"
              value={loadSort}
              options={[
                { value: 'load', label: 'Most periods first' },
                { value: 'name', label: 'By name' },
              ]}
              onChange={setLoadSort}
              className="w-44 text-xs"
            />
          }
        >
          {teacherRows.length === 0 ? (
            <Empty>No teachers yet.</Empty>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-auto text-sm" data-testid="teacher-loads">
              {teacherRows.map((t) => {
                const limit = Math.min(t.max ?? Infinity, t.capacity);
                const pct = Math.min(100, (t.periods / Math.max(1, limit)) * 100);
                return (
                  <li key={t.teacherId} className={`flex items-center gap-3 py-1.5 ${t.teacherId === selectedTeacher ? 'bg-teal-50' : ''}`}>
                    <span className="w-40 truncate">{t.teacher.name}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded bg-slate-100" aria-hidden>
                      <span
                        className={`block h-full ${t.level === 'over' ? 'bg-red-500' : t.level === 'under' ? 'bg-amber-400' : 'bg-teal-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <LevelBadge level={t.level}>
                      {t.periods}/{limit}
                      {t.min !== null && ` (min ${t.min})`}
                    </LevelBadge>
                    {t.covering > 0 && <span className="text-xs text-amber-800" title="Periods outside appointment">{t.covering} cov.</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={`Checks${errors + warnings ? ` · ${errors} problem(s), ${warnings} warning(s)` : ''}`}>
          <p className="mb-2 text-sm text-slate-600" data-testid="supply-demand">
            Classes need <strong className="tabular-nums">{checks.demand}</strong> teacher-periods; staff can give up to{' '}
            <strong className="tabular-nums">{checks.supply}</strong>.
            {checks.uncoveredPeriods > 0 && ` ${checks.uncoveredPeriods} period(s) still have no teacher.`}
          </p>
          {checks.issues.length === 0 ? (
            <p className="text-sm text-emerald-800">No problems found.</p>
          ) : (
            <ul className="max-h-96 space-y-1.5 overflow-auto text-sm">
              {checks.issues.map((i, n) => (
                <li
                  key={n}
                  className={`rounded border-l-4 px-2 py-1 ${
                    i.severity === 'error' ? 'border-red-500 bg-red-50' : i.severity === 'warning' ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-slate-50'
                  }`}
                >
                  {i.message}
                  {i.fix && <span className="block text-xs text-slate-700">Suggestion: {i.fix}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
