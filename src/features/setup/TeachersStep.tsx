import { Fragment, useMemo, useState } from 'react';
import { CATEGORY_LABELS } from '@/domain/catalog';
import type { Medium } from '@/domain/common';
import type { EmploymentCategory, Teacher } from '@/domain/entities';
import { makeRole, makeTeacher } from '@/domain/factories';
import { WEEKDAYS, type Weekday } from '@/domain/time';
import { parseTeacherPaste } from '@/io/paste';
import { useProjectStore } from '@/store/projectStore';
import { Card, Chips, Empty, IconButton, NumberInput, PageHeader, Select, TextInput, TrashIcon } from '@/ui/kit';
import { useDelete } from './useDelete';

const MEDIA = [
  { value: 'si', label: 'S', title: 'Sinhala' },
  { value: 'ta', label: 'T', title: 'Tamil' },
  { value: 'en', label: 'E', title: 'English' },
] as const satisfies readonly { value: Medium; label: string; title: string }[];

const DAY_LETTER: Record<Weekday, string> = { mon: 'M', tue: 'Tu', wed: 'W', thu: 'Th', fri: 'F', sat: 'Sa', sun: 'Su' };
const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABELS) as EmploymentCategory[]).map((c) => ({ value: c, label: CATEGORY_LABELS[c] }));

function RolesCard() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const remove = useDelete();
  return (
    <Card
      title="Roles and teaching-load norms"
      actions={
        <button
          className="btn"
          onClick={() =>
            update((d) => {
              d.roles.push(makeRole({ name: 'New role', norm: { unit: 'periods', min: null, max: null } }));
            })
          }
        >
          + Role
        </button>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Periods per week. {project.pack === 'sl-gov' && 'Enter the minimum from the current Ministry circular — the app does not assume a figure. '}
        Leave blank for no limit.
      </p>
      <div className="space-y-2">
        {project.roles.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2">
            <TextInput
              aria-label="Role name"
              value={r.name}
              onChange={(v) =>
                update((d) => {
                  d.roles.find((x) => x.id === r.id)!.name = v;
                })
              }
              className="w-48"
            />
            <span className="text-sm text-slate-500">min</span>
            <NumberInput
              aria-label={`${r.name} minimum periods`}
              value={r.norm.min}
              nullable
              min={0}
              max={60}
              onChange={(v) =>
                update((d) => {
                  d.roles.find((x) => x.id === r.id)!.norm.min = v;
                })
              }
              className="w-20"
            />
            <span className="text-sm text-slate-500">max</span>
            <NumberInput
              aria-label={`${r.name} maximum periods`}
              value={r.norm.max}
              nullable
              min={0}
              max={60}
              onChange={(v) =>
                update((d) => {
                  d.roles.find((x) => x.id === r.id)!.norm.max = v;
                })
              }
              className="w-20"
            />
            <span className="text-xs text-slate-500">{project.teachers.filter((t) => t.roleId === r.id).length} teacher(s)</span>
            <IconButton label={`Delete role ${r.name}`} danger onClick={() => remove('role', r.id, r.name)}>
              <TrashIcon />
            </IconButton>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PasteCard({ onDone }: { onDone: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [text, setText] = useState('');
  const rows = useMemo(() => parseTeacherPaste(text, project.subjects), [text, project.subjects]);
  const existing = new Set(project.teachers.map((t) => t.name.trim().toLowerCase()));
  const defaultRole = project.roles.find((r) => r.name === 'Teacher')?.id ?? null;

  return (
    <Card title="Paste teachers from Excel">
      <p className="mb-2 text-sm text-slate-600">
        Copy rows with columns <strong>Name · Short code · Subjects · Media</strong> and paste below. Subjects can be codes or
        names separated by commas (e.g. <code>MAT, SCI</code>). Media: Sinhala / Tamil / English.
      </p>
      <textarea
        aria-label="Pasted rows"
        className="field h-32 w-full font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'K. Perera\tKP\tMAT, SCI\tSinhala\nA. Rajan\tAR\tTAM\tTamil'}
      />
      {rows.length > 0 && (
        <div className="mt-2 max-h-56 overflow-auto rounded border border-slate-200">
          <table className="w-full text-xs">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-2 py-1">{r.name}</td>
                  <td className="px-2 py-1">{r.shortCode}</td>
                  <td className="px-2 py-1">{r.subjectIds.map((id) => project.subjects.find((s) => s.id === id)?.shortCode).join(', ')}</td>
                  <td className="px-2 py-1">{r.media.join(', ')}</td>
                  <td className="px-2 py-1 text-amber-800">
                    {existing.has(r.name.toLowerCase()) && 'already exists · '}
                    {r.unknown.length > 0 && `unknown subject: ${r.unknown.join(', ')}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          className="btn btn-primary"
          disabled={rows.length === 0}
          onClick={() => {
            update((d) => {
              for (const r of rows) {
                if (existing.has(r.name.toLowerCase())) continue;
                d.teachers.push(makeTeacher({ name: r.name, shortCode: r.shortCode, subjectIds: r.subjectIds, media: r.media, roleId: defaultRole }));
              }
            });
            setText('');
            onDone();
          }}
        >
          Add {rows.filter((r) => !existing.has(r.name.toLowerCase())).length} teacher(s)
        </button>
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </Card>
  );
}

/** Selected subjects as removable chips plus a compact "+ add" dropdown — stays one line high with many subjects. */
export function SubjectPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const subjects = useProjectStore((s) => s.project!.subjects);
  const rest = subjects.filter((s) => !value.includes(s.id));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((id) => {
        const s = subjects.find((x) => x.id === id);
        if (!s) return null;
        return (
          <button
            key={id}
            type="button"
            title={`${s.name} — click to remove`}
            onClick={() => onChange(value.filter((v) => v !== id))}
            className="rounded-full border border-teal-700 bg-teal-700 px-1.5 py-0.5 text-xs text-white hover:bg-teal-800"
          >
            {s.shortCode || s.name} ×
          </button>
        );
      })}
      {rest.length > 0 && (
        <select
          aria-label="Add subject"
          className="rounded-full border border-dashed border-slate-400 bg-white px-1.5 py-0.5 text-xs text-slate-600"
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
        >
          <option value="">+ add</option>
          {rest.map((s) => (
            <option key={s.id} value={s.id}>
              {s.shortCode ? `${s.shortCode} — ${s.name}` : s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function TeacherDetails({ t }: { t: Teacher }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const edit = (fn: (x: Teacher) => void) =>
    update((d) => {
      fn(d.teachers.find((x) => x.id === t.id)! as Teacher);
    });
  const service = project.pack === 'sl-gov' && !project.simpleMode;
  const field = (label: string, node: React.ReactNode) => (
    <label className="block">
      <span className="label">{label}</span>
      {node}
    </label>
  );
  return (
    <div className="grid gap-3 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
      {field('Title', <TextInput value={t.title} placeholder="Mr / Mrs / Rev." onChange={(v) => edit((x) => (x.title = v))} />)}
      {field('Department', <TextInput value={t.department} onChange={(v) => edit((x) => (x.department = v))} />)}
      {(t.category === 'attached' || t.category === 'visiting') &&
        field('Other school', <TextInput value={t.hostSchool} onChange={(v) => edit((x) => (x.hostSchool = v))} />)}
      {project.pack === 'international' &&
        field(
          'Contract hours a week',
          <NumberInput
            value={t.contractMinutes === null ? null : t.contractMinutes / 60}
            nullable
            min={1}
            max={60}
            placeholder="Expatriate contracts"
            onChange={(v) => edit((x) => (x.contractMinutes = v === null ? null : Math.round(v * 60)))}
          />,
        )}
      {(t.category === 'visiting' || t.hourlyRate !== null) &&
        field(
          'Hourly rate (claims)',
          <NumberInput value={t.hourlyRate} nullable min={0} max={1_000_000} onChange={(v) => edit((x) => (x.hourlyRate = v))} />,
        )}
      {field(
        'Max periods/week (override)',
        <NumberInput
          value={t.normOverride?.max ?? null}
          nullable
          min={0}
          max={60}
          onChange={(v) =>
            edit((x) => {
              x.normOverride = v === null && !x.normOverride?.min ? null : { unit: 'periods', min: x.normOverride?.min ?? null, max: v };
            })
          }
        />,
      )}
      {service && (
        <>
          {field('Service grade', <TextInput value={t.serviceGrade} placeholder="SLTS 2-II" onChange={(v) => edit((x) => (x.serviceGrade = v))} />)}
          {field('Appointment type', <TextInput value={t.appointmentType} placeholder="Graduate / Trained" onChange={(v) => edit((x) => (x.appointmentType = v))} />)}
          {field(
            'Appointment subject',
            <Select
              value={t.appointmentSubjectId ?? ''}
              options={[{ value: '', label: '—' }, ...project.subjects.map((s) => ({ value: s.id, label: s.name }))]}
              onChange={(v) => edit((x) => (x.appointmentSubjectId = v || null))}
            />,
          )}
          {field(
            'Appointment medium',
            <Select
              value={t.appointmentMedium ?? ''}
              options={[
                { value: '', label: '—' },
                { value: 'si', label: 'Sinhala' },
                { value: 'ta', label: 'Tamil' },
                { value: 'en', label: 'English' },
              ]}
              onChange={(v) => edit((x) => (x.appointmentMedium = (v || null) as Medium | null))}
            />,
          )}
          {field(
            'Appointed to this school',
            <input type="date" className="field w-full" value={t.appointedToSchoolOn ?? ''} onChange={(e) => edit((x) => (x.appointedToSchoolOn = e.target.value || null))} />,
          )}
          {field('NIC (stays on this device)', <TextInput value={t.nic} onChange={(v) => edit((x) => (x.nic = v))} />)}
        </>
      )}
    </div>
  );
}

export function TeachersStep() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const remove = useDelete();
  const [pasting, setPasting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const simple = project.simpleMode;
  const roleOptions = [{ value: '', label: '—' }, ...project.roles.map((r) => ({ value: r.id, label: r.name }))];
  const days = WEEKDAYS.filter((d) => project.institute.workingDays.includes(d));
  const q = filter.trim().toLowerCase();
  const teachers = q ? project.teachers.filter((t) => `${t.name} ${t.shortCode}`.toLowerCase().includes(q)) : project.teachers;

  const edit = (id: string, fn: (t: Teacher) => void) =>
    update((d) => {
      fn(d.teachers.find((t) => t.id === id)! as Teacher);
    });

  return (
    <>
      <PageHeader title="Teachers">
        Tick the subjects each teacher can teach and the media they teach in. For shared or part-time staff, tick only the days
        they are at this school.
      </PageHeader>

      <div className="space-y-4">
        <RolesCard />
        {pasting && <PasteCard onDone={() => setPasting(false)} />}
        <Card
          title={`Teachers (${project.teachers.length})`}
          actions={
            <>
              <TextInput aria-label="Find teacher" value={filter} onChange={setFilter} placeholder="Find…" className="w-36" />
              {!pasting && (
                <button className="btn" onClick={() => setPasting(true)}>
                  Paste from Excel
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={() =>
                  update((d) => {
                    d.teachers.push(makeTeacher({ name: 'New teacher', roleId: d.roles.find((r) => r.name === 'Teacher')?.id ?? null }));
                  })
                }
              >
                + Teacher
              </button>
            </>
          }
        >
          {project.subjects.length === 0 && <p className="mb-2 text-sm text-amber-800">Add subjects first so you can tick what each teacher teaches.</p>}
          {teachers.length === 0 ? (
            <Empty>{q ? 'No teacher matches.' : 'No teachers yet.'}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="py-1 pr-2">Name</th>
                    <th className="py-1 pr-2">Code</th>
                    <th className="py-1 pr-2">Role</th>
                    {!simple && <th className="py-1 pr-2">Type</th>}
                    <th className="py-1 pr-2">Subjects</th>
                    <th className="py-1 pr-2">Media</th>
                    <th className="py-1 pr-2">Days here</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t) => (
                    <Fragment key={t.id}>
                      <tr className="border-t border-slate-100 align-top">
                        <td className="py-1.5 pr-2">
                          <TextInput aria-label="Teacher name" value={t.name} onChange={(v) => edit(t.id, (x) => (x.name = v))} className="w-44" />
                        </td>
                        <td className="py-1.5 pr-2">
                          <TextInput aria-label="Short code" value={t.shortCode} maxLength={6} onChange={(v) => edit(t.id, (x) => (x.shortCode = v))} className="w-16" />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Select aria-label="Role" value={t.roleId ?? ''} options={roleOptions} onChange={(v) => edit(t.id, (x) => (x.roleId = v || null))} className="w-36" />
                        </td>
                        {!simple && (
                          <td className="py-1.5 pr-2">
                            <Select aria-label="Employment type" value={t.category} options={CATEGORY_OPTIONS} onChange={(v) => edit(t.id, (x) => (x.category = v))} className="w-36" />
                          </td>
                        )}
                        <td className="min-w-[200px] max-w-xs py-1.5 pr-2">
                          <SubjectPicker value={t.subjectIds} onChange={(v) => edit(t.id, (x) => (x.subjectIds = v))} />
                        </td>
                        <td className="min-w-[110px] py-1.5 pr-2">
                          <Chips size="sm" value={t.media} options={MEDIA} onChange={(v) => edit(t.id, (x) => (x.media = v))} />
                        </td>
                        <td className="min-w-[200px] py-1.5 pr-2">
                          <Chips
                            size="sm"
                            value={t.contractedDays.length ? t.contractedDays : days}
                            options={days.map((d) => ({ value: d, label: DAY_LETTER[d] }))}
                            onChange={(v) => {
                              if (v.length === 0) return;
                              edit(t.id, (x) => (x.contractedDays = v.length === days.length ? [] : WEEKDAYS.filter((w) => v.includes(w))));
                            }}
                          />
                        </td>
                        <td className="whitespace-nowrap py-1.5 text-right">
                          <button className="px-1 text-xs text-teal-800 underline" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>
                            {open === t.id ? 'Less' : 'More'}
                          </button>
                          <IconButton label={`Delete ${t.name}`} danger onClick={() => remove('teacher', t.id, t.name)}>
                            <TrashIcon />
                          </IconButton>
                        </td>
                      </tr>
                      {open === t.id && (
                        <tr>
                          <td colSpan={8}>
                            <TeacherDetails t={t} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
