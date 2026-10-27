import type { Grid } from '@/domain/timetable';
import { formatClock } from '@/domain/time';

const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' } as const;

/** Read-only week grid. `mode` decides what each cell shows besides the subject. */
export function TimetableGrid({ grid, mode, nameOf }: { grid: Grid; mode: 'class' | 'teacher'; nameOf: (classId: string) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm" data-testid="timetable-grid">
        <thead>
          <tr>
            <th className="w-24 border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs font-medium text-slate-500" />
            {grid.days.map((d) => (
              <th key={d} className="border border-slate-200 bg-slate-50 px-2 py-1 font-semibold">
                {DAY_LABEL[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row, r) => {
            const first = row.slots.find((s) => !!s);
            if (row.kind !== 'period')
              return (
                <tr key={r}>
                  <td className="border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">{first && formatClock(first.start)}</td>
                  <td colSpan={grid.days.length} className="border border-slate-200 bg-slate-50 px-2 py-0.5 text-center text-xs text-slate-500">
                    {row.label}
                  </td>
                </tr>
              );
            return (
              <tr key={r}>
                <td className="border border-slate-200 bg-slate-50 px-2 py-1 align-top">
                  <span className="block font-medium">{row.label}</span>
                  <span className="block text-xs text-slate-500">{first && formatClock(first.start)}</span>
                </td>
                {grid.days.map((day, i) => {
                  const slot = row.slots[i];
                  if (!slot || slot.kind !== 'period') return <td key={day} className="border border-slate-200 bg-slate-100" />;
                  const lessons = grid.cells.get(`${day}|${slot.id}`) ?? [];
                  if (!lessons.length)
                    return (
                      <td key={day} className="border border-slate-200 px-2 py-1 align-top text-xs italic text-slate-400">
                        {mode === 'class' ? 'Self-study' : ''}
                      </td>
                    );
                  return (
                    <td key={day} className="border border-slate-200 px-2 py-1 align-top">
                      {lessons.map((l) => (
                        <div key={`${l.itemId}#${l.occurrence}`} className={l.uncovered ? 'rounded bg-amber-50 px-1 ring-1 ring-amber-300' : ''}>
                          <span className="font-semibold">{l.title}</span>
                          {l.slotIds.length > 1 && <span className="ml-1 text-[10px] text-slate-500">double</span>}
                          {mode === 'class' ? (
                            <span className="block text-xs text-slate-600">
                              {l.parts.length > 1
                                ? l.parts.map((p) => `${p.subject} ${p.teacher}`).join(' · ')
                                : l.uncovered
                                  ? 'uncovered'
                                  : [l.parts[0]?.teacher, l.parts[0]?.room].filter(Boolean).join(' · ')}
                            </span>
                          ) : (
                            <span className="block text-xs text-slate-600">
                              {l.classIds.map(nameOf).join('+')}
                              {l.roomIds.length === 1 ? ` · ${l.parts.find((p) => p.room)?.room ?? ''}` : ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
