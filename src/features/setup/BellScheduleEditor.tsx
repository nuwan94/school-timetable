import { useState } from 'react';
import type { Draft } from 'immer';
import { newId } from '@/domain/common';
import {
  formatClock,
  formatDuration,
  parseClock,
  relayoutSlots,
  SlotKind,
  type BellSchedule,
  type BellSlot,
  type Weekday,
} from '@/domain/time';
import { DownIcon, IconButton, NumberInput, Select, TextInput, TrashIcon, UpIcon } from '@/ui/kit';
import { useProjectStore } from '@/store/projectStore';
import { useDelete } from './useDelete';
import { dayLong, tx } from '@/i18n';

const KIND_OPTIONS = [
  { value: 'period', get label() { return tx('Period'); } },
  { value: 'break', get label() { return tx('Break / interval'); } },
  { value: 'assembly', get label() { return tx('Assembly'); } },
  { value: 'formTime', get label() { return tx('Form time'); } },
  { value: 'registration', get label() { return tx('Registration'); } },
] as const satisfies readonly { value: SlotKind; label: string }[];


type Tab = 'base' | Weekday;

/**
 * Edits one bell schedule. Slots are always contiguous: you edit the day's
 * start time and each slot's duration, and start/end times follow.
 */
export function BellScheduleEditor({ schedule, workingDays }: { schedule: BellSchedule; workingDays: Weekday[] }) {
  const update = useProjectStore((s) => s.update);
  const remove = useDelete();
  const [tab, setTab] = useState<Tab>('base');
  const overrideDays = Object.keys(schedule.dayOverrides) as Weekday[];
  const activeTab: Tab = tab !== 'base' && !schedule.dayOverrides[tab] ? 'base' : tab;
  const slots = activeTab === 'base' ? schedule.slots : schedule.dayOverrides[activeTab]!;

  /** Edit the slot list shown in the active tab, re-laying out start times. */
  const editSlots = (fn: (slots: Draft<BellSlot>[]) => Draft<BellSlot>[] | void, start?: number) =>
    update((d) => {
      const b = d.bellSchedules.find((x) => x.id === schedule.id)!;
      const list = activeTab === 'base' ? b.slots : b.dayOverrides[activeTab]!;
      const result = fn(list) ?? list;
      const laid = relayoutSlots(result, start ?? result[0]?.start ?? 450);
      if (activeTab === 'base') b.slots = laid;
      else b.dayOverrides[activeTab] = laid;
    });

  const renumber = (list: Draft<BellSlot>[]) => {
    let n = 0;
    for (const s of list) if (s.kind === 'period' && /^P\d+$/.test(s.label)) s.label = `P${++n}`;
    return list;
  };

  const periods = slots.filter((s) => s.kind === 'period');
  const end = slots.length ? slots[slots.length - 1]!.start + slots[slots.length - 1]!.duration : 0;
  const freeDays = workingDays.filter((d) => !overrideDays.includes(d));

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor={`bell-name-${schedule.id}`}>
            {tx('Schedule name')}
          </label>
          <TextInput
            id={`bell-name-${schedule.id}`}
            value={schedule.name}
            onChange={(v) =>
              update((d) => {
                d.bellSchedules.find((x) => x.id === schedule.id)!.name = v;
              })
            }
          />
        </div>
        <div>
          <label className="label" htmlFor={`bell-start-${schedule.id}`}>
            {tx('Day starts')}
          </label>
          <input
            id={`bell-start-${schedule.id}`}
            type="time"
            className="field w-32"
            value={slots[0] ? formatClock(slots[0].start) : '07:30'}
            onChange={(e) => {
              try {
                const start = parseClock(e.target.value);
                editSlots(() => undefined, start);
              } catch {
                /* partial input while typing */
              }
            }}
          />
        </div>
        <p className="pb-2 text-sm text-slate-600">
          {tx('{periods} periods · ends {formatClock} · {formatDuration} teaching', { periods: periods.length, formatClock: formatClock(end), formatDuration: formatDuration(periods.reduce((s, p) => s + p.duration, 0)) })}
        </p>
        <button className="btn ml-auto" onClick={() => remove('bellSchedule', schedule.id, schedule.name)}>
          {tx('Delete schedule')}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 border-b border-slate-200" role="tablist">
        {(['base', ...overrideDays] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={activeTab === t}
            className={`-mb-px rounded-t-md border px-3 py-1.5 text-sm ${
              activeTab === t ? 'border-slate-200 border-b-white bg-white font-medium' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'base' ? (overrideDays.length ? tx('Other days') : tx('Every day')) : dayLong(t)}
          </button>
        ))}
        {freeDays.length > 0 && (
          <select
            className="ml-auto mb-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            value=""
            aria-label={tx('Customise a day')}
            onChange={(e) => {
              const day = e.target.value as Weekday;
              if (!day) return;
              update((d) => {
                const b = d.bellSchedules.find((x) => x.id === schedule.id)!;
                b.dayOverrides[day] = b.slots.map((s) => ({ ...s, id: newId('slot') }));
              });
              setTab(day);
            }}
          >
            <option value="">{tx('+ Different times on…')}</option>
            {freeDays.map((d) => (
              <option key={d} value={d}>
                {dayLong(d)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500">
              <th className="py-1 pr-2 font-semibold">{tx('Type')}</th>
              <th className="py-1 pr-2 font-semibold">{tx('Label')}</th>
              <th className="py-1 pr-2 font-semibold">{tx('Minutes')}</th>
              <th className="py-1 pr-2 font-semibold">{tx('Time')}</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {slots.map((s, i) => (
              <tr key={s.id} className={s.kind === 'period' ? '' : 'bg-slate-50'}>
                <td className="py-1 pr-2">
                  <Select
                    aria-label={tx('Slot type')}
                    value={s.kind}
                    options={KIND_OPTIONS}
                    onChange={(kind) => editSlots((list) => void (list[i]!.kind = kind))}
                    className="w-40"
                  />
                </td>
                <td className="py-1 pr-2">
                  <TextInput aria-label={tx('Slot label')} value={s.label} onChange={(v) => editSlots((list) => void (list[i]!.label = v))} className="w-32" />
                </td>
                <td className="py-1 pr-2">
                  <NumberInput
                    aria-label={tx('Minutes')}
                    value={s.duration}
                    min={5}
                    max={240}
                    onChange={(v) => v !== null && editSlots((list) => void (list[i]!.duration = v))}
                    className="w-20"
                  />
                </td>
                <td className="whitespace-nowrap py-1 pr-2 tabular-nums text-slate-600">
                  {formatClock(s.start)}–{formatClock(s.start + s.duration)}
                </td>
                <td className="whitespace-nowrap py-1 text-right">
                  <IconButton label={tx('Move up')} onClick={() => i > 0 && editSlots((l) => renumber([...l.slice(0, i - 1), l[i]!, l[i - 1]!, ...l.slice(i + 1)]))}>
                    <UpIcon />
                  </IconButton>
                  <IconButton
                    label={tx('Move down')}
                    onClick={() => i < slots.length - 1 && editSlots((l) => renumber([...l.slice(0, i), l[i + 1]!, l[i]!, ...l.slice(i + 2)]))}
                  >
                    <DownIcon />
                  </IconButton>
                  <IconButton label={tx('Remove slot')} danger onClick={() => editSlots((l) => renumber(l.filter((_, j) => j !== i)))}>
                    <TrashIcon />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          className="btn"
          onClick={() =>
            editSlots((l) => {
              const last = [...l].reverse().find((x) => x.kind === 'period');
              const n = l.filter((x) => x.kind === 'period').length + 1;
              l.push({ id: newId('slot'), kind: 'period', label: `P${n}`, start: 0, duration: last?.duration ?? 40 });
            })
          }
        >
          {tx('+ Period')}
        </button>
        <button
          className="btn"
          onClick={() => editSlots((l) => void l.push({ id: newId('slot'), kind: 'break', label: tx('Interval'), start: 0, duration: 20 }))}
        >
          {tx('+ Break')}
        </button>
        {activeTab !== 'base' && (
          <button
            className="btn ml-auto"
            onClick={() => {
              update((d) => {
                delete d.bellSchedules.find((x) => x.id === schedule.id)!.dayOverrides[activeTab];
              });
              setTab('base');
            }}
          >
            {tx('Use normal times on {x}', { x: dayLong(activeTab) })}
          </button>
        )}
      </div>
    </div>
  );
}
