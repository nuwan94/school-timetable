import { findBrokenReferences } from '@/domain/project';
import { formatClock, formatDuration, teachingSlots, weeklyTeachingMinutes } from '@/domain/time';
import { PACK_LABELS } from '@/packs';
import { useProjectStore } from '@/store/projectStore';

/** P0 placeholder: basic institute details and a read-only bell schedule. Setup screens arrive in P1. */
export function ProjectOverview() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const { institute } = project;
  const bell = project.bellSchedules[0];
  const problems = findBrokenReferences(project);

  const field = (key: 'name' | 'academicYear' | 'term', label: string, placeholder: string) => (
    <div>
      <label className="label" htmlFor={`inst-${key}`}>
        {label}
      </label>
      <input
        id={`inst-${key}`}
        className="field"
        value={institute[key]}
        placeholder={placeholder}
        onChange={(e) =>
          update((d) => {
            d.institute[key] = e.target.value;
          })
        }
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Institute</h2>
          <span className="text-xs text-slate-500">{PACK_LABELS[project.pack]}</span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {field('name', 'School name', 'School name')}
          {field('academicYear', 'Academic year', '2027')}
          {field('term', 'Term', 'T1')}
        </div>
      </section>

      {bell && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Bell schedule — {bell.name}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {teachingSlots(bell, 'mon').length} periods/day ·{' '}
            {formatDuration(weeklyTeachingMinutes(bell, institute.workingDays))} teaching per week · editing comes in
            P1
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1 pr-4">Slot</th>
                  <th className="py-1 pr-4">Start</th>
                  <th className="py-1 pr-4">End</th>
                  <th className="py-1">Minutes</th>
                </tr>
              </thead>
              <tbody>
                {bell.slots.map((s) => (
                  <tr key={s.id} className={s.kind === 'period' ? '' : 'text-slate-500'}>
                    <td className="py-1 pr-4">{s.label}</td>
                    <td className="py-1 pr-4 tabular-nums">{formatClock(s.start)}</td>
                    <td className="py-1 pr-4 tabular-nums">{formatClock(s.start + s.duration)}</td>
                    <td className="py-1 tabular-nums">{s.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Rules preset</h2>
        <p className="mt-1 text-sm text-slate-600">
          {project.rules.filter((r) => r.enabled).length} rules enabled. Rule screens arrive in P5.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {project.rules.map((r) => (
            <span
              key={r.id}
              className={`rounded px-1.5 py-0.5 text-xs ${
                r.enabled ? 'bg-teal-100 text-teal-900' : 'bg-slate-100 text-slate-400 line-through'
              }`}
              title={`${r.strength} ${JSON.stringify(r.params)}`}
            >
              {r.code}
            </span>
          ))}
        </div>
      </section>

      {problems.length > 0 && (
        <section className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-medium">Data problems</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
