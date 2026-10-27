import { useProjectStore } from '@/store/projectStore';

/** Pick classes, grouped by grade, with a whole-grade toggle per row. */
export function ClassPicker({ value, onChange, label = 'Classes' }: { value: string[]; onChange: (ids: string[]) => void; label?: string }) {
  const project = useProjectStore((s) => s.project)!;
  const grades = [...project.grades].sort((a, b) => a.level - b.level);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="space-y-1">
        {grades.map((g) => {
          const classes = project.classes.filter((c) => c.gradeId === g.id);
          if (classes.length === 0) return null;
          const all = classes.every((c) => value.includes(c.id));
          return (
            <div key={g.id} className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                aria-pressed={all}
                onClick={() =>
                  onChange(all ? value.filter((v) => !classes.some((c) => c.id === v)) : [...new Set([...value, ...classes.map((c) => c.id)])])
                }
                className={`w-24 rounded border px-1.5 py-0.5 text-left text-xs ${all ? 'border-teal-700 bg-teal-50 font-semibold' : 'border-slate-300 bg-white'}`}
                title={`Select all of ${g.name}`}
              >
                {g.name}
              </button>
              {classes.map((c) => {
                const on = value.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(c.id)}
                    className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

export function classNames(project: { classes: { id: string; name: string }[] }, ids: string[]): string {
  return ids.map((id) => project.classes.find((c) => c.id === id)?.name ?? '?').join(', ');
}
