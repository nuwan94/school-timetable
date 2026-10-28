import { useMemo, useState } from 'react';
import { applyBlockPlan, pairKey, planBlock, type BlockPlan } from '@/domain/blockBuilder';
import { choicesOn } from '@/domain/students';
import { useProjectStore } from '@/store/projectStore';
import { Card, Chips, NumberInput, TextInput } from '@/ui/kit';
import { ClassPicker } from './ClassPicker';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Builds an option block from the students' subject choices: suggests the
 * lines, shows who cannot be fitted and what they could take instead, and
 * creates the block with every set's students listed.
 */
export function BlockBuilderCard() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[] | null>(null);
  const [maxSetSize, setMaxSetSize] = useState(22);
  const [lines, setLines] = useState<number | null>(null);
  const [periods, setPeriods] = useState(5);
  const [doubles, setDoubles] = useState(0);
  const [name, setName] = useState('');
  const [plan, setPlan] = useState<BlockPlan | null>(null);

  const code = (id: string) => {
    const s = project.subjects.find((x) => x.id === id);
    return s?.shortCode || s?.name || '?';
  };
  // Subjects the students in these classes chose that are not already class lessons for them.
  const chosen = useMemo(() => {
    const taught = new Set(project.allocations.filter((a) => a.groupIds.some((g) => classIds.includes(g))).map((a) => a.subjectId));
    const count = new Map<string, number>();
    for (const s of project.students)
      if (classIds.includes(s.classId)) for (const id of choicesOn(s)) if (!taught.has(id)) count.set(id, (count.get(id) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n }));
  }, [project, classIds]);
  const picked = subjectIds ?? chosen.map((c) => c.id);
  const students = project.students.filter((s) => classIds.includes(s.classId)).length;
  const stale = () => setPlan(null);

  return (
    <Card title="Build a block from student choices" className="border-teal-200">
      <p className="mb-3 text-sm text-slate-600">
        Pick the forms (from one Year or several — sets may span Years) and the option subjects. The builder works out how many sets each subject
        needs, puts them in lines so that as many students as possible get every subject they chose, and fills each set evenly.
      </p>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <ClassPicker
          value={classIds}
          onChange={(v) => {
            setClassIds(v);
            setSubjectIds(null);
            stale();
          }}
          label="Students from these forms"
        />
        <div className="space-y-3">
          <div>
            <span className="label">Option subjects ({students} students)</span>
            {chosen.length === 0 ? (
              <p className="text-sm text-slate-500">{classIds.length ? 'No option choices in these forms.' : 'Choose forms first.'}</p>
            ) : (
              <Chips
                size="sm"
                value={picked}
                options={chosen.map((c) => ({
                  value: c.id,
                  label: `${code(c.id)} · ${c.n}`,
                  title: project.subjects.find((s) => s.id === c.id)?.name,
                }))}
                onChange={(v) => {
                  setSubjectIds(v);
                  stale();
                }}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label>
              <span className="label">Max set size</span>
              <NumberInput value={maxSetSize} min={1} max={60} onChange={(v) => (setMaxSetSize(v ?? 22), stale())} />
            </label>
            <label>
              <span className="label">Lines</span>
              <NumberInput value={lines} nullable min={1} max={12} placeholder="Auto" onChange={(v) => (setLines(v), stale())} />
            </label>
            <label>
              <span className="label">Periods per line</span>
              <NumberInput value={periods} min={1} max={20} onChange={(v) => setPeriods(v ?? 1)} />
            </label>
            <label>
              <span className="label">of which doubles</span>
              <NumberInput value={doubles} min={0} max={Math.floor(periods / 2)} onChange={(v) => setDoubles(v ?? 0)} />
            </label>
          </div>
          <button
            className="btn btn-primary"
            disabled={!classIds.length || !picked.length}
            onClick={() => setPlan(planBlock(project, { classIds, subjectIds: picked, maxSetSize, lines }))}
            data-testid="suggest-lines"
          >
            Suggest lines
          </button>
        </div>
      </div>

      {plan && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4" data-testid="block-plan">
          <p className="text-sm">
            <strong>{plan.lines}</strong> lines, <strong>{plan.sets.length}</strong> sets.{' '}
            {plan.unsatisfied.length === 0 ? (
              <span className="font-medium text-emerald-700">Every student gets all their choices.</span>
            ) : (
              <span className="font-medium text-amber-800">{plan.unsatisfied.length} student(s) cannot have every choice — see below.</span>
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <tbody>
                {Array.from({ length: plan.lines }, (_, line) => (
                  <tr key={line}>
                    <th className="whitespace-nowrap py-1 pr-3 text-left text-xs font-semibold uppercase text-slate-500">Line {LETTERS[line]}</th>
                    <td className="py-1">
                      <div className="flex flex-wrap gap-1">
                        {plan.sets
                          .filter((s) => s.line === line)
                          .map((s, i) => (
                            <span
                              key={i}
                              className={`rounded-md border px-2 py-0.5 ${s.studentIds.length > maxSetSize ? 'border-red-300 bg-red-50' : 'border-teal-200 bg-teal-50'}`}
                            >
                              {code(s.subjectId)} <span className="text-xs text-slate-500">({s.studentIds.length})</span>
                            </span>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {plan.unsatisfied.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Students who cannot have every choice</h3>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto text-sm" data-testid="unsatisfied">
                {plan.unsatisfied.map((u) => {
                  const s = project.students.find((x) => x.id === u.studentId);
                  return (
                    <li key={u.studentId}>
                      <span className="font-medium">{s?.name}</span>: no room for {u.missing.map(code).join(', ')}
                      {u.alternatives.length > 0 && (
                        <span className="text-slate-500"> — could take {u.alternatives.map(code).join(' or ')} instead</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1 text-xs text-slate-500">Try another line, a larger set size, or ask these students to change a choice.</p>
            </div>
          )}

          <details>
            <summary className="cursor-pointer text-sm font-medium text-teal-800">Clash matrix — students taking both subjects</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="border-collapse text-xs tabular-nums" data-testid="clash-matrix">
                <thead>
                  <tr>
                    <th />
                    {picked.map((id) => (
                      <th key={id} className="px-1.5 py-1 font-semibold">
                        {code(id)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {picked.map((a) => (
                    <tr key={a}>
                      <th className="px-1.5 py-1 text-left font-semibold">{code(a)}</th>
                      {picked.map((b) => {
                        const n = a === b ? (plan.enrolment[a] ?? 0) : (plan.clashes[pairKey(a, b)] ?? 0);
                        const sameLine =
                          a !== b &&
                          plan.sets.some((x) => x.subjectId === a && plan.sets.some((y) => y.subjectId === b && y.line === x.line)) &&
                          !plan.sets.some((x) => x.subjectId === a && plan.sets.some((y) => y.subjectId === b && y.line !== x.line));
                        return (
                          <td
                            key={b}
                            className={`border border-slate-100 px-1.5 py-1 text-center ${a === b ? 'bg-slate-100 font-semibold' : n && sameLine ? 'bg-red-100 text-red-800' : n ? 'bg-teal-50' : 'text-slate-300'}`}
                            title={
                              a === b ? 'Students taking this subject' : sameLine && n ? 'Only on the same line: these students clash' : undefined
                            }
                          >
                            {n || '·'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className="flex flex-wrap items-end gap-2">
            <label className="w-72">
              <span className="label">Block name</span>
              <TextInput value={name} onChange={setName} placeholder="e.g. Year 10 IGCSE options" />
            </label>
            <button
              className="btn btn-primary"
              disabled={!name.trim()}
              data-testid="create-block-from-plan"
              onClick={() => {
                update((d) => {
                  applyBlockPlan(d, plan, { name: name.trim(), classIds, periods, doubles });
                });
                setPlan(null);
                setName('');
                setClassIds([]);
                setSubjectIds(null);
              }}
            >
              Create block with {plan.sets.length} sets
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
