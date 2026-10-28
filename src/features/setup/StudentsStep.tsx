import { Fragment, useMemo, useState } from 'react';
import { refitStudent, unplacedChoices } from '@/domain/blockBuilder';
import { newId } from '@/domain/common';
import { House, Student } from '@/domain/entities';
import { applyStudentImport, parseStudents, removeStudent } from '@/domain/students';
import { WEEKDAYS, formatClock, parseClock, type Weekday } from '@/domain/time';
import { useProjectStore } from '@/store/projectStore';
import { confirmDialog } from '@/ui/dialogs';
import { Card, Empty, IconButton, PageHeader, Select, TextInput, TrashIcon } from '@/ui/kit';
import { SubjectPicker } from './TeachersStep';

const EXAMPLE = `Adm No\tName\tForm\tHouse\tSubjects
2401\tAmaya Perera\t10A\tKandy\tIPHY ICHE IBIO ICS
2402\tKavin Silva\t10B\tGalle\tIBUS IECO IACC IICT`;

function ImportCard({ onDone }: { onDone: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [text, setText] = useState('');
  const preview = useMemo(() => (text.trim() ? parseStudents(project, text) : null), [project, text]);
  const ready = preview?.rows.filter((r) => r.classId) ?? [];
  const unknown = [...new Set(preview?.rows.flatMap((r) => r.unknown) ?? [])];
  const existing = new Set(project.students.map((s) => s.admissionNo).filter(Boolean));
  const updates = ready.filter((r) => r.admissionNo && existing.has(r.admissionNo)).length;
  return (
    <Card title="Import students" className="mb-4">
      <p className="mb-2 text-sm text-slate-600">
        Copy the list from your admissions system or a spreadsheet and paste it here: admission no, name, form, house, then the subjects each student
        chose (codes, names or syllabus codes — one per column or several in one cell). A header row may name the columns in any order. Students
        already in the list (same admission no) are updated, not added twice.
      </p>
      <textarea
        aria-label="Student list"
        className="field h-40 w-full font-mono text-xs"
        placeholder={EXAMPLE}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {preview && (
        <div className="mt-2 space-y-1 text-sm" data-testid="import-preview">
          <p>
            <strong>{ready.length}</strong> student{ready.length === 1 ? '' : 's'} ready
            {updates ? ` (${updates} already listed, will be updated)` : ''}
            {preview.newHouses.length ? ` · new houses: ${preview.newHouses.join(', ')}` : ''}
          </p>
          {unknown.length > 0 && <p className="text-amber-800">Subject codes not found (ignored): {unknown.join(', ')}</p>}
          {preview.problems.slice(0, 6).map((p) => (
            <p key={p} className="text-red-700">
              {p}
            </p>
          ))}
          {preview.problems.length > 6 && <p className="text-red-700">…and {preview.problems.length - 6} more.</p>}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          className="btn btn-primary"
          disabled={!ready.length}
          onClick={() => {
            update((d) => {
              const before = new Set(d.students.map((s) => s.id));
              const listed = new Set(preview!.rows.map((r) => r.admissionNo).filter(Boolean));
              applyStudentImport(d, preview!);
              // Put new students into sets of existing blocks, and keep updated ones in step with their new form or choices.
              for (const s of d.students) if (!before.has(s.id) || listed.has(s.admissionNo)) refitStudent(d, s.id);
            });
            setText('');
            onDone();
          }}
        >
          Import {ready.length} student{ready.length === 1 ? '' : 's'}
        </button>
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </Card>
  );
}

function HousesCard() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  return (
    <Card
      title="Houses"
      actions={
        <button
          className="btn"
          onClick={() =>
            update((d) => {
              d.houses.push(House.parse({ id: newId('house'), name: `House ${d.houses.length + 1}` }));
            })
          }
        >
          + House
        </button>
      }
    >
      {project.houses.length === 0 ? (
        <Empty>No houses. They are created when you import students with a house column, or add them here.</Empty>
      ) : (
        <ul className="space-y-1">
          {project.houses.map((h) => (
            <li key={h.id} className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`${h.name} colour`}
                value={h.colour}
                onChange={(e) =>
                  update((d) => {
                    d.houses.find((x) => x.id === h.id)!.colour = e.target.value;
                  })
                }
                className="h-7 w-7 cursor-pointer rounded border border-slate-300"
              />
              <TextInput
                aria-label="House name"
                value={h.name}
                onChange={(v) =>
                  update((d) => {
                    d.houses.find((x) => x.id === h.id)!.name = v;
                  })
                }
                className="w-40"
              />
              <span className="text-xs text-slate-500">{project.students.filter((s) => s.houseId === h.id).length} students</span>
              <IconButton
                label={`Delete ${h.name}`}
                danger
                onClick={() =>
                  void confirmDialog(`Delete ${h.name} house?`, {
                    text: 'Students in it will have no house.',
                    confirmText: 'Delete',
                    danger: true,
                  }).then(
                    (ok) =>
                      ok &&
                      update((d) => {
                        d.houses = d.houses.filter((x) => x.id !== h.id);
                        for (const s of d.students) if (s.houseId === h.id) s.houseId = null;
                        for (const c of d.ccas) if (c.houseId === h.id) c.houseId = null;
                        for (const c of d.classes) if (c.houseId === h.id) c.houseId = null;
                      }),
                  )
                }
              >
                <TrashIcon />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const DAY_OPTIONS = [{ value: '', label: '—' }, ...WEEKDAYS.map((d) => ({ value: d, label: d[0]!.toUpperCase() + d.slice(1) }))];

function CcaCard() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState('');
  const edit = (id: string, fn: (c: (typeof project.ccas)[number]) => void) =>
    update((d) => {
      fn(d.ccas.find((x) => x.id === id)!);
    });
  const teacherOptions = [{ value: '', label: '—' }, ...project.teachers.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }))];
  const houseOptions = [{ value: '', label: 'All houses' }, ...project.houses.map((h) => ({ value: h.id, label: h.name }))];
  const time = (m: number | null) => (m === null ? '' : formatClock(m));
  return (
    <Card
      title="Co-curricular activities"
      actions={
        <button
          className="btn"
          onClick={() =>
            update((d) => {
              d.ccas.push({
                id: newId('cca'),
                name: 'New activity',
                day: null,
                start: null,
                end: null,
                place: '',
                houseId: null,
                teacherIds: [],
                studentIds: [],
              });
            })
          }
        >
          + Activity
        </button>
      }
    >
      {project.ccas.length === 0 ? (
        <Empty>Clubs, teams and house meetings. Their rosters print from Reports → International.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="py-1 pr-2">Activity</th>
                <th className="py-1 pr-2">Day</th>
                <th className="py-1 pr-2">From</th>
                <th className="py-1 pr-2">To</th>
                <th className="py-1 pr-2">Where</th>
                <th className="py-1 pr-2">House</th>
                <th className="py-1 pr-2">Teacher</th>
                <th className="py-1 pr-2">Students</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {project.ccas.map((c) => (
                <Fragment key={c.id}>
                  <tr>
                    <td className="py-1 pr-2">
                      <TextInput aria-label="Activity name" value={c.name} onChange={(v) => edit(c.id, (x) => (x.name = v))} className="w-44" />
                    </td>
                    <td className="py-1 pr-2">
                      <Select
                        aria-label="Day"
                        value={c.day ?? ''}
                        options={DAY_OPTIONS}
                        onChange={(v) => edit(c.id, (x) => (x.day = (v || null) as Weekday | null))}
                        className="w-24"
                      />
                    </td>
                    {(['start', 'end'] as const).map((k) => (
                      <td key={k} className="py-1 pr-2">
                        <input
                          type="time"
                          aria-label={k === 'start' ? 'Starts' : 'Ends'}
                          className="field w-28"
                          value={time(c[k])}
                          onChange={(e) => edit(c.id, (x) => (x[k] = e.target.value ? parseClock(e.target.value) : null))}
                        />
                      </td>
                    ))}
                    <td className="py-1 pr-2">
                      <TextInput aria-label="Where" value={c.place} onChange={(v) => edit(c.id, (x) => (x.place = v))} className="w-28" />
                    </td>
                    <td className="py-1 pr-2">
                      <Select
                        aria-label="House"
                        value={c.houseId ?? ''}
                        options={houseOptions}
                        onChange={(v) => edit(c.id, (x) => (x.houseId = v || null))}
                        className="w-28"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Select
                        aria-label="Teacher in charge"
                        value={c.teacherIds[0] ?? ''}
                        options={teacherOptions}
                        onChange={(v) =>
                          edit(c.id, (x) => (x.teacherIds = v ? [v, ...x.teacherIds.slice(1).filter((t) => t !== v)] : x.teacherIds.slice(1)))
                        }
                        className="w-40"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <button className="btn px-2 py-0.5 text-xs" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
                        {c.studentIds.length} {open === c.id ? '▲' : '▼'}
                      </button>
                    </td>
                    <td className="py-1 text-right">
                      <IconButton
                        label={`Delete ${c.name}`}
                        danger
                        onClick={() =>
                          update((d) => {
                            d.ccas = d.ccas.filter((x) => x.id !== c.id);
                          })
                        }
                      >
                        <TrashIcon />
                      </IconButton>
                    </td>
                  </tr>
                  {open === c.id && (
                    <tr>
                      <td colSpan={9} className="bg-slate-50 p-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                          <Select
                            aria-label="Form"
                            value={form}
                            options={[{ value: '', label: 'Choose a form…' }, ...project.classes.map((x) => ({ value: x.id, label: x.name }))]}
                            onChange={setForm}
                            className="w-44"
                          />
                          {form && (
                            <button
                              className="btn px-2 py-0.5 text-xs"
                              onClick={() =>
                                edit(c.id, (x) => {
                                  const ids = project.students.filter((s) => s.classId === form).map((s) => s.id);
                                  const all = ids.every((id) => x.studentIds.includes(id));
                                  x.studentIds = all ? x.studentIds.filter((id) => !ids.includes(id)) : [...new Set([...x.studentIds, ...ids])];
                                })
                              }
                            >
                              Whole form on/off
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {project.students
                            .filter((s) => (form ? s.classId === form : c.studentIds.includes(s.id)))
                            .map((s) => {
                              const on = c.studentIds.includes(s.id);
                              return (
                                <button
                                  key={s.id}
                                  aria-pressed={on}
                                  onClick={() =>
                                    edit(c.id, (x) => (x.studentIds = on ? x.studentIds.filter((id) => id !== s.id) : [...x.studentIds, s.id]))
                                  }
                                  className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white'}`}
                                >
                                  {s.name}
                                </button>
                              );
                            })}
                        </div>
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
  );
}

const PAGE = 60;

export function StudentsStep() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [importing, setImporting] = useState(project.students.length === 0);
  const [form, setForm] = useState('');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const formName = (id: string) => project.classes.find((c) => c.id === id)?.name ?? '';
  const list = project.students
    .filter((s) => (!form || s.classId === form) && (!query || `${s.name} ${s.admissionNo}`.toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => formName(a.classId).localeCompare(formName(b.classId), undefined, { numeric: true }) || a.name.localeCompare(b.name));
  const classOptions = project.classes.map((c) => ({ value: c.id, label: c.name }));
  const houseOptions = [{ value: '', label: '—' }, ...project.houses.map((h) => ({ value: h.id, label: h.name }))];
  const edit = (id: string, fn: (s: Student) => void, refit = false) =>
    update((d) => {
      fn(d.students.find((x) => x.id === id)! as Student);
      if (refit) refitStudent(d, id);
    });
  const subjectCode = (id: string) => {
    const s = project.subjects.find((x) => x.id === id);
    return s?.shortCode || s?.name || '?';
  };

  return (
    <>
      <PageHeader title="Students">
        For schools that timetable sets from students&apos; own subject choices. Import the list, then build option blocks from the choices; each set
        then lists its students, and the timetable is checked so that no student is in two places at once. Changing a student&apos;s choices moves
        only that student between sets.
      </PageHeader>

      {importing ? <ImportCard onDone={() => setImporting(false)} /> : null}

      <Card
        title={`Students (${project.students.length})`}
        className="mb-4"
        actions={
          <>
            {!importing && (
              <button className="btn" onClick={() => setImporting(true)}>
                Import / update from a list
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={!project.classes.length}
              onClick={() =>
                update((d) => {
                  d.students.push(Student.parse({ id: newId('stu'), name: 'New student', classId: form || d.classes[0]!.id }));
                })
              }
            >
              + Student
            </button>
          </>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <Select
            aria-label="Show form"
            value={form}
            options={[{ value: '', label: 'All forms' }, ...classOptions]}
            onChange={setForm}
            className="w-40"
          />
          <TextInput aria-label="Search students" placeholder="Search name or admission no" value={query} onChange={setQuery} className="w-64" />
        </div>
        {list.length === 0 ? (
          <Empty>{project.students.length ? 'No students match.' : 'No students yet. Paste your list above.'}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1 pr-2">Adm. no</th>
                  <th className="py-1 pr-2">Name</th>
                  <th className="py-1 pr-2">Form</th>
                  <th className="py-1 pr-2">House</th>
                  <th className="py-1 pr-2">Subject choices</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.slice(0, shown).map((s) => {
                  const missing = unplacedChoices(project, s.id);
                  return (
                    <tr key={s.id} className="align-top">
                      <td className="py-1 pr-2">
                        <TextInput
                          aria-label="Admission number"
                          value={s.admissionNo}
                          onChange={(v) => edit(s.id, (x) => (x.admissionNo = v))}
                          className="w-20"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <TextInput aria-label="Student name" value={s.name} onChange={(v) => edit(s.id, (x) => (x.name = v))} className="w-48" />
                      </td>
                      <td className="py-1 pr-2">
                        <Select
                          aria-label="Form"
                          value={s.classId}
                          options={classOptions}
                          onChange={(v) => edit(s.id, (x) => (x.classId = v), true)}
                          className="w-24"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Select
                          aria-label="House"
                          value={s.houseId ?? ''}
                          options={houseOptions}
                          onChange={(v) => edit(s.id, (x) => (x.houseId = v || null))}
                          className="w-28"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <SubjectPicker
                          value={s.choices.map((c) => c.subjectId)}
                          onChange={(ids) =>
                            edit(
                              s.id,
                              (x) =>
                                (x.choices = ids.map(
                                  (subjectId) => x.choices.find((c) => c.subjectId === subjectId) ?? { subjectId, from: null, to: null },
                                )),
                              true,
                            )
                          }
                        />
                        {missing.length > 0 && (
                          <p className="mt-1 text-xs text-red-700" data-testid="student-missing">
                            No set fits alongside the others: {missing.map(subjectCode).join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="py-1 text-right">
                        <IconButton
                          label={`Delete ${s.name}`}
                          danger
                          onClick={() =>
                            void confirmDialog(`Delete ${s.name}?`, {
                              text: 'They are taken out of every set and activity.',
                              confirmText: 'Delete',
                              danger: true,
                            }).then((ok) => ok && update((d) => removeStudent(d, s.id)))
                          }
                        >
                          <TrashIcon />
                        </IconButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {list.length > shown && (
              <button className="btn mt-2" onClick={() => setShown(shown + PAGE * 2)}>
                Show more ({list.length - shown} left)
              </button>
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <HousesCard />
        <CcaCard />
      </div>
    </>
  );
}
