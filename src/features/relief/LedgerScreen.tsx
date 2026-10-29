import { useMemo, useState } from 'react';
import { ledgerRows } from '@/domain/relief';
import { useProjectStore } from '@/store/projectStore';
import { Card } from '@/ui/kit';
import { STRINGS } from './strings';
import { useLang } from '@/i18n';

/** Relief fairness: how many reliefs each teacher has taken this week and term. */
export function LedgerScreen() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const lang = useLang((s) => s.lang);
  const [date] = useState(() => new Date().toLocaleDateString('en-CA'));
  const S = STRINGS[lang];
  const rows = useMemo(() => ledgerRows(project, date), [project, date]);
  const max = Math.max(1, ...rows.map((r) => r.term));

  return (
    <div className="mx-auto max-w-3xl space-y-4" lang={lang}>
      <h1 className="text-xl font-bold">{S.ledger}</h1>
      <p className="text-sm text-slate-600">{S.ledgerNote}</p>
      <Card>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          {S.termStart}
          <input
            type="date"
            className="field min-h-10 w-44"
            value={project.institute.termStart ?? ''}
            onChange={(e) =>
              update((d) => {
                d.institute.termStart = e.target.value || null;
              })
            }
          />
        </label>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm" data-testid="ledger">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="py-1 pr-3">{S.teacher}</th>
                <th className="px-2 text-right">{S.week}</th>
                <th className="px-2 text-right">{S.term}</th>
                <th className="w-32 px-2" />
                <th className="px-2 text-right">{S.total}</th>
                <th className="pl-2 text-right">{S.absentDays}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.teacherId}>
                  <td className="py-1.5 pr-3">{r.name}</td>
                  <td className="px-2 text-right tabular-nums">{r.week}</td>
                  <td className="px-2 text-right tabular-nums">{r.term}</td>
                  <td className="px-2">
                    <div className="h-2 rounded bg-slate-100">
                      <div className="h-2 rounded bg-teal-600" style={{ width: `${(100 * r.term) / max}%` }} />
                    </div>
                  </td>
                  <td className="px-2 text-right tabular-nums">{r.total}</td>
                  <td className="pl-2 text-right tabular-nums">{r.absentDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
