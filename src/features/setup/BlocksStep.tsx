import { useState } from 'react';
import {
  addBlock,
  addLine,
  addSet,
  LINE_PRESETS,
  presetSubjects,
  removeBlock,
  removeLine,
  removeSet,
  setBlockClasses,
  updateLine,
  updateSet,
} from '@/domain/blocks';
import { runChecks } from '@/domain/checks';
import type { Medium } from '@/domain/common';
import type { OptionBlock } from '@/domain/entities';
import { doublesIn, patternPeriods } from '@/domain/factories';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty, IconButton, LevelBadge, NumberInput, PageHeader, Select, TextInput, TrashIcon } from '@/ui/kit';
import { ClassPicker, classNames } from './ClassPicker';
import { confirmDialog } from '@/ui/dialogs';

const MEDIUM_OPTIONS = [
  { value: '', label: '—' },
  { value: 'si', label: 'Sinhala' },
  { value: 'ta', label: 'Tamil' },
  { value: 'en', label: 'English' },
] as const;

function NewBlock() {
  const update = useProjectStore((s) => s.update);
  const [name, setName] = useState('');
  const [classIds, setClassIds] = useState<string[]>([]);
  return (
    <Card title="New option block">
      <div className="grid gap-3 md:grid-cols-[16rem_1fr]">
        <div>
          <label className="label" htmlFor="nb-name">
            Name
          </label>
          <TextInput id="nb-name" value={name} onChange={setName} placeholder="e.g. Grade 8 Religion" />
          <button
            className="btn btn-primary mt-3"
            disabled={!name.trim() || classIds.length === 0}
            onClick={() => {
              update((d) => {
                addBlock(d, { name: name.trim(), classIds });
              });
              setName('');
              setClassIds([]);
            }}
          >
            Create block
          </button>
        </div>
        <ClassPicker value={classIds} onChange={setClassIds} label="Students from these classes" />
      </div>
    </Card>
  );
}

function LineEditor({ block, lineIndex }: { block: OptionBlock; lineIndex: number }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const line = block.lines[lineIndex]!;
  const periods = patternPeriods(line.pattern);
  const doubles = doublesIn(line.pattern);
  const blockStudents = block.classIds.reduce((s, c) => s + (project.classes.find((x) => x.id === c)?.studentCount ?? 0), 0);
  const groups = line.sets.map((s) => project.studentGroups.find((g) => g.id === s.groupId));
  const groupStudents = groups.reduce((s, g) => s + (g?.studentCount ?? 0), 0);
  const teacherCounts = new Map<string, number>();
  for (const s of line.sets) for (const t of s.teacherIds) teacherCounts.set(t, (teacherCounts.get(t) ?? 0) + 1);
  const roomOptions = [{ value: '', label: '—' }, ...project.rooms.map((r) => ({ value: r.id, label: r.name }))];
  const unusedSubject = project.subjects.find((s) => !line.sets.some((x) => x.subjectId === s.id)) ?? project.subjects[0];

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="label">Line</span>
          <TextInput value={line.label} onChange={(v) => update((d) => updateLine(d, block.id, line.id, { label: v }))} className="w-48" />
        </label>
        <label>
          <span className="label">Periods/week</span>
          <NumberInput
            value={periods}
            min={1}
            max={20}
            onChange={(v) => v && update((d) => updateLine(d, block.id, line.id, { periods: v }))}
            className="w-20"
          />
        </label>
        <label>
          <span className="label">Doubles</span>
          <NumberInput
            value={doubles}
            min={0}
            max={Math.floor(periods / 2)}
            onChange={(v) => update((d) => updateLine(d, block.id, line.id, { doubles: v ?? 0 }))}
            className="w-20"
          />
        </label>
        {blockStudents > 0 && (
          <span className="pb-2 text-sm">
            Students:{' '}
            <LevelBadge
              level={groupStudents === 0 ? 'none' : groupStudents === blockStudents ? 'ok' : groupStudents < blockStudents ? 'under' : 'over'}
            >
              {groupStudents}/{blockStudents}
            </LevelBadge>
          </span>
        )}
        <button
          className="btn ml-auto"
          onClick={async () =>
            (await confirmDialog(`Delete line "${line.label}"?`, { confirmText: 'Delete', danger: true })) &&
            update((d) => removeLine(d, block.id, line.id))
          }
        >
          Delete line
        </button>
      </div>

      {line.sets.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No groups yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="py-1 pr-2">Group</th>
                <th className="py-1 pr-2">Subject</th>
                <th className="py-1 pr-2">Teacher</th>
                {project.rooms.length > 0 && <th className="py-1 pr-2">Room</th>}
                <th className="py-1 pr-2">Students</th>
                <th className="py-1 pr-2">Medium</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {line.sets.map((s, i) => {
                const group = groups[i];
                const teacher = s.teacherIds[0] ?? '';
                const clash = teacher && (teacherCounts.get(teacher) ?? 0) > 1;
                const qualified = project.teachers.filter((t) => t.subjectIds.includes(s.subjectId));
                const others = project.teachers.filter((t) => !t.subjectIds.includes(s.subjectId));
                return (
                  <tr key={s.id}>
                    <td className="py-1 pr-2">
                      <TextInput
                        aria-label="Group name"
                        value={group?.name ?? ''}
                        onChange={(v) => update((d) => updateSet(d, block.id, line.id, s.id, { groupName: v }))}
                        className="w-40"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Select
                        aria-label="Subject"
                        value={s.subjectId}
                        options={project.subjects.map((x) => ({ value: x.id, label: x.shortCode ? `${x.shortCode} — ${x.name}` : x.name }))}
                        onChange={(v) => update((d) => updateSet(d, block.id, line.id, s.id, { subjectId: v }))}
                        className="w-48"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        aria-label="Teacher"
                        className={`field w-48 ${clash ? 'border-red-500 bg-red-50' : ''}`}
                        title={clash ? 'This teacher is in another group of the same line' : undefined}
                        value={teacher}
                        onChange={(e) => update((d) => updateSet(d, block.id, line.id, s.id, { teacherId: e.target.value || null }))}
                      >
                        <option value="">— no teacher —</option>
                        {qualified.length > 0 && (
                          <optgroup label="Teaches this subject">
                            {qualified.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {others.length > 0 && (
                          <optgroup label="Others">
                            {others.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </td>
                    {project.rooms.length > 0 && (
                      <td className="py-1 pr-2">
                        <Select
                          aria-label="Room"
                          value={s.roomId ?? ''}
                          options={roomOptions}
                          onChange={(v) => update((d) => updateSet(d, block.id, line.id, s.id, { roomId: v || null }))}
                          className="w-32"
                        />
                      </td>
                    )}
                    <td className="py-1 pr-2">
                      <NumberInput
                        aria-label="Students"
                        value={group?.studentCount ?? 0}
                        min={0}
                        onChange={(v) => update((d) => updateSet(d, block.id, line.id, s.id, { studentCount: v ?? 0 }))}
                        className="w-20"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Select
                        aria-label="Medium"
                        value={(group?.medium ?? '') as '' | Medium}
                        options={MEDIUM_OPTIONS}
                        onChange={(v) => update((d) => updateSet(d, block.id, line.id, s.id, { medium: (v || null) as Medium | null }))}
                        className="w-28"
                      />
                    </td>
                    <td className="py-1 text-right">
                      <IconButton
                        label={`Remove ${group?.name ?? 'group'}`}
                        danger
                        onClick={() => update((d) => removeSet(d, block.id, line.id, s.id))}
                      >
                        <TrashIcon />
                      </IconButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {unusedSubject && (
        <button className="btn mt-2" onClick={() => update((d) => void addSet(d, block.id, line.id, { subjectId: unusedSubject.id }))}>
          + Group
        </button>
      )}
    </div>
  );
}

function BlockCard({ block }: { block: OptionBlock }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [editingClasses, setEditingClasses] = useState(false);
  const presets = LINE_PRESETS.map((p) => ({ ...p, subjects: presetSubjects(project.subjects, p.codes) })).filter((p) => p.subjects.length > 0);

  const newLine = (presetLabel: string) => {
    update((d) => {
      const preset = presets.find((p) => p.label === presetLabel);
      const lineId = addLine(d, block.id, { label: preset?.label ?? `Line ${block.lines.length + 1}`, periods: preset ? 3 : 2 });
      for (const s of preset?.subjects ?? []) addSet(d, block.id, lineId, { subjectId: s.id });
    });
  };

  return (
    <Card
      title={
        <TextInput
          aria-label="Block name"
          value={block.name}
          onChange={(v) =>
            update((d) => {
              d.optionBlocks.find((b) => b.id === block.id)!.name = v;
            })
          }
          className="w-64 font-semibold"
        />
      }
      actions={
        <button
          className="btn"
          onClick={async () =>
            (await confirmDialog(`Delete block "${block.name}"?`, { text: 'Its groups are deleted too.', confirmText: 'Delete', danger: true })) &&
            update((d) => removeBlock(d, block.id))
          }
        >
          Delete block
        </button>
      }
    >
      <div className="mb-3 text-sm">
        <span className="text-slate-600">Classes: </span>
        <span className="font-medium">{classNames(project, block.classIds)}</span>{' '}
        <button className="text-xs text-teal-800 underline" onClick={() => setEditingClasses(!editingClasses)}>
          {editingClasses ? 'done' : 'change'}
        </button>
        {editingClasses && (
          <div className="mt-2 rounded-md bg-slate-50 p-2">
            <ClassPicker value={block.classIds} onChange={(ids) => ids.length > 0 && update((d) => setBlockClasses(d, block.id, ids))} />
          </div>
        )}
      </div>
      <div className="space-y-3">
        {block.lines.map((l, i) => (
          <LineEditor key={l.id} block={block} lineIndex={i} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn" onClick={() => newLine('')}>
          + Empty line
        </button>
        {presets.map((p) => (
          <button key={p.label} className="btn" onClick={() => newLine(p.label)} title={p.subjects.map((s) => s.name).join(', ')}>
            + {p.label} line
          </button>
        ))}
      </div>
    </Card>
  );
}

export function BlocksStep() {
  const project = useProjectStore((s) => s.project)!;
  const errors = runChecks(project).issues.filter(
    (i) => i.severity !== 'info' && project.optionBlocks.some((b) => i.message.startsWith(`${b.name} /`)),
  );
  return (
    <>
      <PageHeader title="Option blocks">
        Use a block when students split into groups that study different subjects at the same time — Religion, Aesthetics, Second National Language,
        O/L baskets, A/L subject lines, or a bilingual class split into English- and Sinhala-medium groups. Every group in a line is timetabled
        together, so each needs its own teacher.
      </PageHeader>
      <div className="space-y-4">
        {project.optionBlocks.length === 0 && <Empty>No option blocks yet. Most schools start with Religion and Aesthetics.</Empty>}
        {project.optionBlocks.map((b) => (
          <BlockCard key={b.id} block={b} />
        ))}
        {errors.length > 0 && (
          <Card title="Problems in blocks">
            <ul className="space-y-1 text-sm">
              {errors.map((e, i) => (
                <li
                  key={i}
                  className={`rounded border-l-4 px-2 py-1 ${e.severity === 'error' ? 'border-red-500 bg-red-50' : 'border-amber-400 bg-amber-50'}`}
                >
                  {e.message}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <NewBlock />
      </div>
    </>
  );
}
