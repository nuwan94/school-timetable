import { SL_SUBJECTS } from '@/domain/catalog';
import type { Subject } from '@/domain/entities';
import { makeRoomType, makeSubject } from '@/domain/factories';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty, IconButton, NumberInput, PageHeader, Select, TextInput, TrashIcon } from '@/ui/kit';
import { useDelete } from './useDelete';

const KIND = [
  { value: 'theory', label: 'Theory' },
  { value: 'practical', label: 'Practical' },
  { value: 'activity', label: 'Activity' },
  { value: 'selfStudy', label: 'Self-study' },
] as const;

const BOARD = [
  { value: 'national', label: 'National' },
  { value: 'cambridge', label: 'Cambridge' },
  { value: 'edexcel', label: 'Pearson Edexcel' },
  { value: 'other', label: 'Other' },
] as const;

const PRIORITY = [
  { value: 'core', label: 'Core' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
] as const;

export function SubjectsStep() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const remove = useDelete();
  const simple = project.simpleMode;
  const intl = project.pack === 'international';
  const roomTypeOptions = [{ value: '', label: '— any —' }, ...project.roomTypes.map((r) => ({ value: r.id, label: r.name }))];
  const existingCodes = new Set(project.subjects.map((s) => s.shortCode.toUpperCase()));
  const missingStandard = SL_SUBJECTS.filter((s) => !existingCodes.has(s.code));

  const edit = (id: string, fn: (s: Subject) => void) =>
    update((d) => {
      fn(d.subjects.find((s) => s.id === id)! as Subject);
    });

  const addStandard = () =>
    update((d) => {
      const codes = new Set(d.subjects.map((s) => s.shortCode.toUpperCase()));
      for (const c of SL_SUBJECTS) {
        if (codes.has(c.code)) continue;
        let roomTypeId: string | null = null;
        if (c.roomType) {
          let rt = d.roomTypes.find((r) => r.name === c.roomType);
          if (!rt) {
            d.roomTypes.push(makeRoomType(c.roomType));
            rt = d.roomTypes[d.roomTypes.length - 1]!;
          }
          roomTypeId = rt.id;
        }
        d.subjects.push(
          makeSubject({
            name: c.name,
            shortCode: c.code,
            local: { si: c.si, ta: c.ta },
            colour: c.colour,
            kind: c.kind ?? 'theory',
            priority: c.priority ?? 'normal',
            heavy: c.heavy ?? false,
            roomTypeId,
          }),
        );
      }
    });

  return (
    <>
      <PageHeader title="Subjects">
        Short codes appear in the dense printed grids. Priority decides which subjects lose periods first if there are not
        enough teachers (Low first).
        {intl && ' For IGCSE and A Level, give the board, level, syllabus code and guided learning hours (GLH) so the contact-hours report can check them.'}
      </PageHeader>

      <Card
        actions={
          <>
            {project.pack !== 'international' && missingStandard.length > 0 && (
              <button className="btn" onClick={addStandard} title={missingStandard.map((s) => s.name).join(', ')}>
                + Standard Sri Lankan subjects ({missingStandard.length})
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={() =>
                update((d) => {
                  d.subjects.push(makeSubject({ name: 'New subject' }));
                })
              }
            >
              + Subject
            </button>
          </>
        }
      >
        {project.subjects.length === 0 ? (
          <Empty>No subjects yet. Add the standard list or add your own.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full text-sm ${intl ? 'min-w-[1280px]' : 'min-w-[760px]'}`}>
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1 pr-2" />
                  <th className="py-1 pr-2">Subject</th>
                  <th className="py-1 pr-2">Code</th>
                  {!intl && <th className="py-1 pr-2">සිංහල</th>}
                  {!intl && <th className="py-1 pr-2">தமிழ்</th>}
                  {intl && (
                    <>
                      <th className="py-1 pr-2">Board</th>
                      <th className="py-1 pr-2">Level</th>
                      <th className="py-1 pr-2">Syllabus</th>
                      <th className="py-1 pr-2" title="Contact-time target, minutes a week">
                        Target min/wk
                      </th>
                      <th className="py-1 pr-2" title="Guided learning hours for the whole course">
                        GLH
                      </th>
                      <th className="py-1 pr-2" title="School years the course runs over">
                        Years
                      </th>
                    </>
                  )}
                  <th className="py-1 pr-2">Type</th>
                  <th className="py-1 pr-2">Priority</th>
                  {!simple && <th className="py-1 pr-2">Needs room</th>}
                  {!simple && <th className="py-1 pr-2" title="Prefer morning periods">Heavy</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {project.subjects.map((s) => (
                  <tr key={s.id}>
                    <td className="py-1 pr-2">
                      <input
                        type="color"
                        aria-label={`${s.name} colour`}
                        value={s.colour}
                        onChange={(e) => edit(s.id, (x) => (x.colour = e.target.value))}
                        className="h-7 w-7 cursor-pointer rounded border border-slate-300"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <TextInput aria-label="Subject name" value={s.name} onChange={(v) => edit(s.id, (x) => (x.name = v))} className="w-48" />
                    </td>
                    <td className="py-1 pr-2">
                      <TextInput
                        aria-label="Short code"
                        value={s.shortCode}
                        maxLength={6}
                        onChange={(v) => edit(s.id, (x) => (x.shortCode = v.toUpperCase()))}
                        className="w-20 uppercase"
                      />
                    </td>
                    {!intl && (
                      <td className="py-1 pr-2">
                        <TextInput aria-label="Sinhala name" lang="si" value={s.local.si ?? ''} onChange={(v) => edit(s.id, (x) => (x.local.si = v))} className="w-36" />
                      </td>
                    )}
                    {!intl && (
                      <td className="py-1 pr-2">
                        <TextInput aria-label="Tamil name" lang="ta" value={s.local.ta ?? ''} onChange={(v) => edit(s.id, (x) => (x.local.ta = v))} className="w-36" />
                      </td>
                    )}
                    {intl && (
                      <>
                        <td className="py-1 pr-2">
                          <Select aria-label="Board" value={s.board} options={BOARD} onChange={(v) => edit(s.id, (x) => (x.board = v))} className="w-32" />
                        </td>
                        <td className="py-1 pr-2">
                          <TextInput aria-label="Level" value={s.level} placeholder="IGCSE" onChange={(v) => edit(s.id, (x) => (x.level = v))} className="w-24" />
                        </td>
                        <td className="py-1 pr-2">
                          <TextInput aria-label="Syllabus code" value={s.syllabusCode} placeholder="0625" onChange={(v) => edit(s.id, (x) => (x.syllabusCode = v))} className="w-20" />
                        </td>
                        <td className="py-1 pr-2">
                          <NumberInput aria-label="Target minutes a week" value={s.targetMinutes} nullable min={1} max={3000} onChange={(v) => edit(s.id, (x) => (x.targetMinutes = v))} className="w-20" />
                        </td>
                        <td className="py-1 pr-2">
                          <NumberInput aria-label="Guided learning hours" value={s.glh} nullable min={1} max={2000} onChange={(v) => edit(s.id, (x) => (x.glh = v))} className="w-20" />
                        </td>
                        <td className="py-1 pr-2">
                          <NumberInput aria-label="Course years" value={s.courseYears} min={1} max={4} onChange={(v) => edit(s.id, (x) => (x.courseYears = v ?? 1))} className="w-16" />
                        </td>
                      </>
                    )}
                    <td className="py-1 pr-2">
                      <Select aria-label="Type" value={s.kind} options={KIND} onChange={(v) => edit(s.id, (x) => (x.kind = v))} className="w-28" />
                    </td>
                    <td className="py-1 pr-2">
                      <Select aria-label="Priority" value={s.priority} options={PRIORITY} onChange={(v) => edit(s.id, (x) => (x.priority = v))} className="w-24" />
                    </td>
                    {!simple && (
                      <td className="py-1 pr-2">
                        <Select
                          aria-label="Needs room type"
                          value={s.roomTypeId ?? ''}
                          options={roomTypeOptions}
                          onChange={(v) => edit(s.id, (x) => (x.roomTypeId = v || null))}
                          className="w-36"
                        />
                      </td>
                    )}
                    {!simple && (
                      <td className="py-1 pr-2 text-center">
                        <input type="checkbox" aria-label="Heavy subject" checked={s.heavy} onChange={(e) => edit(s.id, (x) => (x.heavy = e.target.checked))} />
                      </td>
                    )}
                    <td className="py-1 text-right">
                      <IconButton label={`Delete ${s.name}`} danger onClick={() => remove('subject', s.id, s.name)}>
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
    </>
  );
}
