import { useState } from 'react';
import { STANDARD_ROOM_TYPES } from '@/domain/catalog';
import type { Room } from '@/domain/entities';
import { makeRoom, makeRoomType } from '@/domain/factories';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty, IconButton, NumberInput, PageHeader, Select, TextInput, TrashIcon } from '@/ui/kit';
import { useDelete } from './useDelete';
import { tx } from '@/i18n';

export function RoomsStep() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const remove = useDelete();
  const [newType, setNewType] = useState('');
  const typeOptions = [{ value: '', label: tx('— none —') }, ...project.roomTypes.map((t) => ({ value: t.id, label: t.name }))];
  const missingTypes = STANDARD_ROOM_TYPES.filter((n) => !project.roomTypes.some((t) => t.name === n));

  const edit = (id: string, fn: (r: Room) => void) =>
    update((d) => {
      fn(d.rooms.find((r) => r.id === id)! as Room);
    });

  const addType = () => {
    const name = newType.trim();
    if (!name || project.roomTypes.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    update((d) => {
      d.roomTypes.push(makeRoomType(name));
    });
    setNewType('');
  };

  return (
    <>
      <PageHeader title={tx('Special rooms (optional)')}>
        {tx('Only list labs and shared spaces. Ordinary classrooms are each class\'s home room and need no entry. A room that can host more than one lesson at a time (playground, hall) gets "At once" above 1.')}
      </PageHeader>

      <div className="space-y-4">
        <Card title={tx('Room types')}>
          <div className="flex flex-wrap items-center gap-2">
            {project.roomTypes.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white py-0.5 pl-3 pr-1 text-sm">
                {t.name}
                <IconButton label={tx('Delete room type {name}', { name: t.name })} danger onClick={() => remove('roomType', t.id, t.name)}>
                  <TrashIcon />
                </IconButton>
              </span>
            ))}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addType();
              }}
            >
              <TextInput aria-label={tx('New room type')} value={newType} onChange={setNewType} placeholder={tx('New type…')} className="w-40" />
              <button className="btn" type="submit">
                {tx('Add')}
              </button>
            </form>
            {missingTypes.length > 0 && (
              <button
                className="btn"
                onClick={() =>
                  update((d) => {
                    for (const n of missingTypes) d.roomTypes.push(makeRoomType(n));
                  })
                }
              >
                {tx('+ Common types')}
              </button>
            )}
          </div>
        </Card>

        <Card
          title={tx('Rooms')}
          actions={
            <button
              className="btn btn-primary"
              onClick={() =>
                update((d) => {
                  d.rooms.push(makeRoom({ name: tx('Room {x}', { x: d.rooms.length + 1 }) }));
                })
              }
            >
              {tx('+ Room')}
            </button>
          }
        >
          {project.rooms.length === 0 ? (
            <Empty>{tx('No special rooms. That\'s fine — skip this step if you don\'t need lab scheduling.')}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="py-1 pr-2">{tx('Room')}</th>
                    <th className="py-1 pr-2">{tx('Type')}</th>
                    <th className="py-1 pr-2">{tx('Seats')}</th>
                    <th className="py-1 pr-2">{tx('At once')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {project.rooms.map((r) => (
                    <tr key={r.id}>
                      <td className="py-1 pr-2">
                        <TextInput aria-label={tx('Room name')} value={r.name} onChange={(v) => edit(r.id, (x) => (x.name = v))} className="w-44" />
                      </td>
                      <td className="py-1 pr-2">
                        <Select aria-label={tx('Room type')} value={r.roomTypeId ?? ''} options={typeOptions} onChange={(v) => edit(r.id, (x) => (x.roomTypeId = v || null))} className="w-40" />
                      </td>
                      <td className="py-1 pr-2">
                        <NumberInput aria-label={tx('Seats')} value={r.seats} min={0} onChange={(v) => edit(r.id, (x) => (x.seats = v ?? 0))} className="w-20" />
                      </td>
                      <td className="py-1 pr-2">
                        <NumberInput aria-label={tx('Lessons at once')} value={r.concurrent} min={1} max={10} onChange={(v) => edit(r.id, (x) => (x.concurrent = v ?? 1))} className="w-20" />
                      </td>
                      <td className="py-1 text-right">
                        <IconButton label={tx('Delete {name}', { name: r.name })} danger onClick={() => remove('room', r.id, r.name)}>
                          <TrashIcon />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
