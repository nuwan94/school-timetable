import { useMemo, useState } from 'react';
import { newId } from '@/domain/common';
import { RULE_CATALOG, type RuleInfo } from '@/domain/ruleCatalog';
import type { RuleConfig, Strength } from '@/domain/schedule';
import { scoreTimetable } from '@/solver';
import { useProjectStore } from '@/store/projectStore';
import { Card, NumberInput, PageHeader } from '@/ui/kit';
import { tx } from '@/i18n';
import { Rich } from '@/i18n/Rich';

const STRENGTHS: { value: Strength; label: string }[] = [
  { value: 'low', get label() { return tx('Low'); } },
  { value: 'medium', get label() { return tx('Medium'); } },
  { value: 'high', get label() { return tx('High'); } },
  { value: 'veryHigh', get label() { return tx('Very high'); } },
  { value: 'hard', get label() { return tx('Must (hard)'); } },
];

/** Rules editor (PLAN.md §4.2) with a live report on the current timetable. */
export function RulesScreen({ onGenerate }: { onGenerate: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const version = project.versions.find((v) => v.id === project.activeVersionId);
  const report = useMemo(() => (version ? scoreTimetable(project, version.placements) : null), [project, version]);
  const [open, setOpen] = useState<string | null>(null);

  const config = (code: string) => project.rules.find((r) => r.code === code);
  const edit = (info: RuleInfo, fn: (r: RuleConfig) => void) =>
    update((d) => {
      let r = d.rules.find((x) => x.code === info.code);
      if (!r) {
        r = {
          id: newId('rule'),
          code: info.code,
          enabled: true,
          strength: 'medium',
          scope: { sectionIds: [], gradeLevels: [], classIds: [], subjectIds: [], teacherIds: [] },
          params: {},
        };
        d.rules.push(r);
        r = d.rules[d.rules.length - 1]!;
      }
      fn(r);
    });

  return (
    <div className="space-y-4">
      <PageHeader title={tx('Rules')}>
        <Rich
          text={tx(
            'What makes a good timetable for your school. <b>Must</b> rules are never broken; the others are preferences — Generate tries hardest on the strongest ones. Changes apply the next time you press Generate or Improve.',
          )}
        />
      </PageHeader>

      {report && (
        <Card
          title={
            <span>
              {tx('How the current timetable does')}{' '}
              <span className="text-sm font-normal text-slate-500" data-testid="soft-total">
                {tx('(penalty {total})', { total: report.total })}
              </span>
            </span>
          }
          actions={
            <button className="btn" onClick={onGenerate}>
              {tx('Improve in Generate →')}
            </button>
          }
        >
          {report.byRule.length === 0 ? (
            <p className="text-sm text-emerald-800">{tx('Every preference is met.')}</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="label">{tx('By rule')}</p>
                <ul className="mt-1 space-y-1 text-sm" data-testid="report-rules">
                  {report.byRule.map((r) => (
                    <li key={r.code}>
                      <button className="flex w-full justify-between gap-2 text-left hover:underline" onClick={() => setOpen(open === r.code ? null : r.code)}>
                        <span>
                          <b>{r.code}</b> {RULE_CATALOG.find((x) => x.code === r.code)?.title}
                        </span>
                        <span className="tabular-nums text-slate-600">
                          {r.count}× · {r.penalty}
                        </span>
                      </button>
                      {open === r.code && (
                        <ul className="ml-4 mt-1 list-disc text-xs text-slate-600">
                          {r.examples.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                          {r.count > r.examples.length && <li>{tx('…and {x} more', { x: r.count - r.examples.length })}</li>}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="label">{tx('Teachers most affected')}</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {report.byTeacher.slice(0, 10).map((t) => (
                    <li key={t.teacherId} className="flex justify-between">
                      <span>{t.name}</span>
                      <span className="tabular-nums text-slate-600">
                        {t.count}× · {t.penalty}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card>
        <ul className="divide-y divide-slate-100" data-testid="rule-list">
          {RULE_CATALOG.map((info) => {
            const r = config(info.code);
            const on = !!r?.enabled;
            const hits = report?.byRule.find((x) => x.code === info.code);
            return (
              <li key={info.code} className="py-3" data-rule={info.code}>
                <div className="flex flex-wrap items-start gap-3">
                  <label className="flex min-w-0 flex-1 items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={on}
                      disabled={!!info.fixed}
                      onChange={(e) => edit(info, (x) => void (x.enabled = e.target.checked))}
                    />
                    <span className="min-w-0">
                      <span className="font-medium">
                        <span className="mr-1.5 text-xs text-slate-500">{info.code}</span>
                        {info.title}
                      </span>
                      <span className="block text-sm text-slate-600">{info.help}</span>
                      {info.fixed && <span className="block text-xs italic text-slate-500">{info.fixed}</span>}
                      {on && hits && (
                        <span className="block text-xs text-amber-800">
                          {tx('Not met {count}× in the current timetable', { count: hits.count })}
                        </span>
                      )}
                    </span>
                  </label>
                  {!info.fixed && on && r && (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-xs">
                        <span className="label">{tx('Strength')}</span>
                        <select
                          className="field w-36"
                          value={r.strength}
                          aria-label={tx('{code} strength', { code: info.code })}
                          onChange={(e) => edit(info, (x) => void (x.strength = e.target.value as Strength))}
                        >
                          {STRENGTHS.filter((s) => s.value !== 'hard' || info.canBeHard).map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {info.params.map((pm) => (
                        <label key={pm.key} className="text-xs">
                          <span className="label">{pm.label}</span>
                          <NumberInput
                            className="w-24"
                            min={pm.min}
                            max={pm.max}
                            nullable
                            value={typeof r.params[pm.key] === 'number' ? (r.params[pm.key] as number) : null}
                            placeholder={String(pm.default)}
                            onChange={(v) =>
                              edit(info, (x) => {
                                if (v === null) delete x.params[pm.key];
                                else x.params[pm.key] = v;
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
