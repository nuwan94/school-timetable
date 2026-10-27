import { useState } from 'react';
import { MEDIUM_LABELS } from '@/domain/catalog';
import type { SchoolClass } from '@/domain/entities';
import { makeClass, makeSection } from '@/domain/factories';
import { quickAddClasses } from '@/domain/mutations';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty, IconButton, NumberInput, PageHeader, Select, TextInput, TrashIcon } from '@/ui/kit';
import { TaughtTogether } from './TaughtTogether';
import { useDelete } from './useDelete';

const MEDIUM_OPTIONS = (Object.keys(MEDIUM_LABELS) as SchoolClass['medium'][]).map((m) => ({ value: m, label: MEDIUM_LABELS[m] }));

function QuickAdd() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [sectionId, setSectionId] = useState(project.sections[0]?.id ?? '');
  const [from, setFrom] = useState<number | null>(6);
  const [to, setTo] = useState<number | null>(11);
  const [letters, setLetters] = useState('A, B, C');
  const [medium, setMedium] = useState<SchoolClass['medium']>('si');
  const [result, setResult] = useState<string | null>(null);
  const section = project.sections.find((s) => s.id === sectionId) ?? project.sections[0];
  const parsedLetters = letters
    .split(/[,\s]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!section) return null;
  return (
    <Card title="Quick add">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="qa-section">
            Section
          </label>
          <Select
            id="qa-section"
            value={section.id}
            options={project.sections.map((s) => ({ value: s.id, label: s.name || '(unnamed)' }))}
            onChange={setSectionId}
          />
        </div>
        <div>
          <label className="label" htmlFor="qa-from">
            {project.institute.gradeLabel}s from
          </label>
          <NumberInput id="qa-from" value={from} min={0} max={14} nullable onChange={setFrom} className="w-20" />
        </div>
        <div>
          <label className="label" htmlFor="qa-to">
            to
          </label>
          <NumberInput id="qa-to" value={to} min={0} max={14} nullable onChange={setTo} className="w-20" />
        </div>
        <div>
          <label className="label" htmlFor="qa-letters">
            Classes in each
          </label>
          <TextInput id="qa-letters" value={letters} onChange={setLetters} className="w-36" placeholder="A, B, C" />
        </div>
        <div>
          <label className="label" htmlFor="qa-medium">
            Medium
          </label>
          <Select id="qa-medium" value={medium} options={MEDIUM_OPTIONS} onChange={setMedium} />
        </div>
        <button
          className="btn btn-primary"
          disabled={from === null || to === null || from > to || parsedLetters.length === 0}
          onClick={() => {
            let created = 0;
            update((d) => {
              created = quickAddClasses(d, { sectionId: section.id, fromLevel: from!, toLevel: to!, letters: parsedLetters, medium });
            });
            setResult(created ? `Added ${created} class(es).` : 'Those classes already exist.');
          }}
        >
          Add classes
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {from !== null && to !== null && from <= to && parsedLetters.length > 0
          ? `Creates ${(to - from + 1) * parsedLetters.length} classes: ${from}${parsedLetters[0]} … ${to}${parsedLetters[parsedLetters.length - 1]}. Existing classes are skipped.`
          : 'Enter a grade range and class letters.'}
        {result && <span className="ml-2 font-medium text-teal-800">{result}</span>}
      </p>
    </Card>
  );
}

export function ClassesStep() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const remove = useDelete();
  const simple = project.simpleMode;
  const scheduleOptions = project.bellSchedules.map((b) => ({ value: b.id, label: b.name }));
  const teacherOptions = [{ value: '', label: '— none —' }, ...project.teachers.map((t) => ({ value: t.id, label: t.name }))];
  const roomOptions = [{ value: '', label: '—' }, ...project.rooms.map((r) => ({ value: r.id, label: r.name }))];

  const editClass = (id: string, fn: (c: SchoolClass) => void) =>
    update((d) => {
      fn(d.classes.find((c) => c.id === id)! as SchoolClass);
    });

  return (
    <>
      <PageHeader title="Sections, grades and classes">
        Sections group grades that share a bell schedule (e.g. Primary, Secondary). Use Quick add to create many classes at once,
        then fill in the class teacher later.
      </PageHeader>

      <div className="space-y-4">
        <Card
          title="Sections"
          actions={
            <button
              className="btn"
              onClick={() =>
                update((d) => {
                  d.sections.push(makeSection({ name: `Section ${d.sections.length + 1}`, bellScheduleId: d.bellSchedules[0]!.id, order: d.sections.length }));
                })
              }
            >
              + Section
            </button>
          }
        >
          <div className="space-y-2">
            {project.sections.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2">
                <TextInput
                  aria-label="Section name"
                  value={s.name}
                  onChange={(v) =>
                    update((d) => {
                      d.sections.find((x) => x.id === s.id)!.name = v;
                    })
                  }
                  className="w-48"
                />
                <span className="text-sm text-slate-500">uses</span>
                <Select
                  aria-label="Bell schedule"
                  value={s.bellScheduleId}
                  options={scheduleOptions}
                  onChange={(v) =>
                    update((d) => {
                      d.sections.find((x) => x.id === s.id)!.bellScheduleId = v;
                    })
                  }
                  className="w-48"
                />
                <IconButton label={`Delete section ${s.name}`} danger onClick={() => remove('section', s.id, s.name)}>
                  <TrashIcon />
                </IconButton>
              </div>
            ))}
          </div>
        </Card>

        <QuickAdd />

        {project.grades.length === 0 && <Empty>No classes yet. Use Quick add above.</Empty>}

        {[...project.grades]
          .sort((a, b) => a.level - b.level)
          .map((g) => {
            const classes = project.classes.filter((c) => c.gradeId === g.id);
            return (
              <Card
                key={g.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <TextInput
                      aria-label="Grade name"
                      value={g.name}
                      onChange={(v) =>
                        update((d) => {
                          d.grades.find((x) => x.id === g.id)!.name = v;
                        })
                      }
                      className="w-36 font-semibold"
                    />
                    {project.sections.length > 1 && (
                      <Select
                        aria-label="Section"
                        value={g.sectionId}
                        options={project.sections.map((s) => ({ value: s.id, label: s.name }))}
                        onChange={(v) =>
                          update((d) => {
                            d.grades.find((x) => x.id === g.id)!.sectionId = v;
                          })
                        }
                        className="w-40 text-sm font-normal"
                      />
                    )}
                  </span>
                }
                actions={
                  <>
                    <button
                      className="btn"
                      onClick={() =>
                        update((d) => {
                          const next = String.fromCharCode(65 + classes.length);
                          d.classes.push(makeClass({ name: `${g.level}${next}`, gradeId: g.id, medium: classes[0]?.medium ?? 'si' }));
                        })
                      }
                    >
                      + Class
                    </button>
                    <IconButton label={`Delete ${g.name}`} danger onClick={() => remove('grade', g.id, g.name)}>
                      <TrashIcon />
                    </IconButton>
                  </>
                }
              >
                {classes.length === 0 ? (
                  <Empty>No classes in this grade.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-slate-500">
                          <th className="py-1 pr-2">Class</th>
                          <th className="py-1 pr-2">Medium</th>
                          {!simple && <th className="py-1 pr-2">Stream</th>}
                          <th className="py-1 pr-2">Class teacher</th>
                          {!simple && <th className="py-1 pr-2">Home room</th>}
                          <th className="py-1 pr-2">Students</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {classes.map((c) => (
                          <tr key={c.id}>
                            <td className="py-1 pr-2">
                              <TextInput aria-label="Class name" value={c.name} onChange={(v) => editClass(c.id, (x) => (x.name = v))} className="w-20" />
                            </td>
                            <td className="py-1 pr-2">
                              <Select aria-label="Medium" value={c.medium} options={MEDIUM_OPTIONS} onChange={(v) => editClass(c.id, (x) => (x.medium = v))} />
                            </td>
                            {!simple && (
                              <td className="py-1 pr-2">
                                <TextInput
                                  aria-label="Stream"
                                  value={c.stream}
                                  placeholder="e.g. Science"
                                  onChange={(v) => editClass(c.id, (x) => (x.stream = v))}
                                  className="w-28"
                                />
                              </td>
                            )}
                            <td className="py-1 pr-2">
                              <Select
                                aria-label="Class teacher"
                                value={c.classTeacherId ?? ''}
                                options={teacherOptions}
                                onChange={(v) => editClass(c.id, (x) => (x.classTeacherId = v || null))}
                                className="w-44"
                              />
                            </td>
                            {!simple && (
                              <td className="py-1 pr-2">
                                <Select
                                  aria-label="Home room"
                                  value={c.homeRoomId ?? ''}
                                  options={roomOptions}
                                  onChange={(v) => editClass(c.id, (x) => (x.homeRoomId = v || null))}
                                  className="w-32"
                                />
                              </td>
                            )}
                            <td className="py-1 pr-2">
                              <NumberInput
                                aria-label="Students"
                                value={c.studentCount}
                                min={0}
                                onChange={(v) => editClass(c.id, (x) => (x.studentCount = v ?? 0))}
                                className="w-20"
                              />
                            </td>
                            <td className="py-1 text-right">
                              <IconButton label={`Delete ${c.name}`} danger onClick={() => remove('class', c.id, c.name)}>
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
            );
          })}

        {project.classes.length >= 2 && <TaughtTogether />}
      </div>
    </>
  );
}
