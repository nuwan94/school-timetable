import { useState } from 'react';
import { newId } from '@/domain/common';
import type { CalendarOverlay } from '@/domain/time';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty, IconButton, PageHeader, TextInput, TrashIcon } from '@/ui/kit';

type Kind = CalendarOverlay['kind'];

export const OVERLAY_KINDS: { value: Kind; label: string }[] = [
  { value: 'termTest', label: 'Term test' },
  { value: 'mock', label: 'Mock exam' },
  { value: 'examSeries', label: 'National exam (O/L, A/L, Grade 5)' },
  { value: 'examCentre', label: 'School is an exam centre' },
  { value: 'markingCamp', label: 'Marking camp' },
  { value: 'sportsMeet', label: 'Sports meet / event' },
  { value: 'holiday', label: 'Holiday / school closed' },
  { value: 'other', label: 'Other' },
];

const today = () => new Date().toISOString().slice(0, 10);

function Chips({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { id: string; name: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="label">
        {label} ({value.length})
      </p>
      <div className="mt-1 flex max-h-32 flex-wrap gap-1 overflow-y-auto" aria-label={label}>
        {items.map((it) => {
          const on = value.includes(it.id);
          return (
            <button
              key={it.id}
              aria-pressed={on}
              className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white'}`}
              onClick={() => onChange(on ? value.filter((x) => x !== it.id) : [...value, it.id])}
            >
              {it.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * School calendar (PLAN.md §8.4): dated events laid over the weekly
 * timetable. Daily relief reads them — classes away free their teachers,
 * absent teachers need cover, holidays close the day.
 */
export function CalendarScreen() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [open, setOpen] = useState<string | null>(null);
  const list = [...project.overlays].sort((a, b) => a.from.localeCompare(b.from));
  const now = today();

  const add = () => {
    const id = newId('ovl');
    update((d) => {
      d.overlays.push({
        id,
        name: 'New event',
        shortCode: '',
        local: {},
        active: true,
        kind: 'other',
        from: now,
        to: now,
        blockedRoomIds: [],
        removedGroupIds: [],
        absentTeacherIds: [],
        note: '',
      });
    });
    setOpen(id);
  };
  const edit = (id: string, fn: (o: CalendarOverlay) => void) =>
    update((d) => {
      const o = d.overlays.find((x) => x.id === id);
      if (o) fn(o);
    });

  const sortedClasses = [...project.classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return (
    <div className="space-y-4">
      <PageHeader title="Calendar">
        Exams, sports meets, holidays and other dated events. The weekly timetable stays the same; on these dates daily relief knows which classes are
        away, which teachers are out, and which rooms are taken.
      </PageHeader>
      <div>
        <button className="btn btn-primary" onClick={add} data-testid="overlay-add">
          Add event
        </button>
      </div>
      {list.length === 0 ? (
        <Empty>No events yet.</Empty>
      ) : (
        <ul className="space-y-2" data-testid="overlay-list">
          {list.map((o) => {
            const past = o.to < now;
            const on = o.from <= now && now <= o.to;
            return (
              <li key={o.id}>
                <Card className={past ? 'opacity-60' : ''}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id}>
                      <span className="font-medium">{o.name}</span>
                      <span className="ml-2 text-sm text-slate-600">
                        {o.from === o.to ? o.from : `${o.from} – ${o.to}`} · {OVERLAY_KINDS.find((k) => k.value === o.kind)?.label}
                      </span>
                      {on && <span className="ml-2 rounded bg-emerald-100 px-1.5 text-xs text-emerald-800">today</span>}
                      <span className="block text-xs text-slate-500">
                        {[
                          o.removedGroupIds.length && `${o.removedGroupIds.length} class(es) away`,
                          o.absentTeacherIds.length && `${o.absentTeacherIds.length} teacher(s) out`,
                          o.blockedRoomIds.length && `${o.blockedRoomIds.length} room(s) taken`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                    <IconButton
                      label={`Delete ${o.name}`}
                      danger
                      onClick={() => update((d) => void (d.overlays = d.overlays.filter((x) => x.id !== o.id)))}
                    >
                      <TrashIcon />
                    </IconButton>
                  </div>
                  {open === o.id && (
                    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="text-sm">
                          <span className="label">Name</span>
                          <TextInput
                            className="w-56"
                            value={o.name}
                            onChange={(v) => edit(o.id, (x) => void (x.name = v || ' '))}
                            aria-label="Event name"
                          />
                        </label>
                        <label className="text-sm">
                          <span className="label">Kind</span>
                          <select className="field w-60" value={o.kind} onChange={(e) => edit(o.id, (x) => void (x.kind = e.target.value as Kind))}>
                            {OVERLAY_KINDS.map((k) => (
                              <option key={k.value} value={k.value}>
                                {k.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm">
                          <span className="label">From</span>
                          <input
                            type="date"
                            className="field w-40"
                            value={o.from}
                            onChange={(e) =>
                              edit(o.id, (x) => {
                                x.from = e.target.value;
                                if (x.to < x.from) x.to = x.from;
                              })
                            }
                          />
                        </label>
                        <label className="text-sm">
                          <span className="label">To</span>
                          <input
                            type="date"
                            className="field w-40"
                            value={o.to}
                            min={o.from}
                            onChange={(e) => edit(o.id, (x) => void (x.to = e.target.value))}
                          />
                        </label>
                      </div>
                      {o.kind !== 'holiday' && (
                        <>
                          <Chips
                            label="Classes away / sitting exams"
                            items={sortedClasses}
                            value={o.removedGroupIds}
                            onChange={(v) => edit(o.id, (x) => void (x.removedGroupIds = v))}
                          />
                          <Chips
                            label="Teachers out (e.g. marking camp)"
                            items={project.teachers.filter((t) => t.active)}
                            value={o.absentTeacherIds}
                            onChange={(v) => edit(o.id, (x) => void (x.absentTeacherIds = v))}
                          />
                          <Chips
                            label="Rooms taken"
                            items={project.rooms}
                            value={o.blockedRoomIds}
                            onChange={(v) => edit(o.id, (x) => void (x.blockedRoomIds = v))}
                          />
                        </>
                      )}
                      <label className="block text-sm">
                        <span className="label">Note</span>
                        <TextInput className="w-full" value={o.note} onChange={(v) => edit(o.id, (x) => void (x.note = v))} />
                      </label>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
