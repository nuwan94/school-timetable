import { useEffect, useMemo, useState } from 'react';
import type { Placement } from '@/domain/schedule';
import { approveActiveVersion, classGrid, lessonEntries, setActivePlacements, teacherGrid, type LessonEntry } from '@/domain/timetable';
import { formatClock, type Weekday } from '@/domain/time';
import { checkTimetable } from '@/solver/checker';
import { applySteps, EditSession, removePlacement, toggleLock, type Level, type Step, type Verdict } from '@/solver/editor';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty, PageHeader } from '@/ui/kit';
import { dayShort, tx } from '@/i18n';
import { Rich } from '@/i18n/Rich';


const TARGET: Record<Level, string> = {
  ok: 'bg-emerald-100 ring-1 ring-inset ring-emerald-500',
  soft: 'bg-amber-100 ring-1 ring-inset ring-amber-500',
  clash: 'bg-red-100 ring-1 ring-inset ring-red-500',
  invalid: 'bg-slate-100',
};

/** Undo/redo survives switching screens (not reloads). Reset when another project opens. */
const history = { projectId: '', past: [] as Placement[][], future: [] as Placement[][] };

export function EditScreen({ onGenerate, onPrint }: { onGenerate: () => void; onPrint: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const version = project.versions.find((v) => v.id === project.activeVersionId);
  const [who, setWho] = useState<string>(() => (project.classes[0] ? `c:${project.classes[0].id}` : ''));
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [effective, setEffective] = useState('');
  const [, bump] = useState(0);
  if (history.projectId !== project.id) Object.assign(history, { projectId: project.id, past: [], future: [] });

  const placements = useMemo(() => version?.placements ?? [], [version]);
  const session = useMemo(() => new EditSession(project, placements), [project, placements]);
  const entries = useMemo(() => lessonEntries(project, placements), [project, placements]);
  const check = useMemo(() => checkTimetable(project, placements), [project, placements]);
  const active = dragging ?? selected;
  const targets = useMemo(() => (active ? session.targets(active) : new Map<string, Verdict>()), [active, session]);

  useEffect(() => {
    if (selected && !session.units.has(selected)) setSelected(null);
  }, [selected, session]);

  if (!version)
    return (
      <div>
        <PageHeader title={tx('Edit timetable')} />
        <Empty>
          <Rich
            text={tx('No timetable yet. <link>Generate one first</link>.')}
            tags={{ link: (c) => <button className="text-teal-700 underline" onClick={onGenerate}>{c}</button> }}
          />
        </Empty>
      </div>
    );

  const commit = (next: Placement[]) => {
    history.past.push(placements);
    if (history.past.length > 100) history.past.shift();
    history.future = [];
    update((d) => setActivePlacements(d, next));
  };
  const undo = () => {
    const prev = history.past.pop();
    if (!prev) return;
    history.future.push(placements);
    update((d) => setActivePlacements(d, prev));
    bump((n) => n + 1);
  };
  const redo = () => {
    const next = history.future.pop();
    if (!next) return;
    history.past.push(placements);
    update((d) => setActivePlacements(d, next));
    bump((n) => n + 1);
  };
  const moveTo = (key: string, day: Weekday, slotId: string) => {
    const v = session.verdict(key, day, slotId);
    if (v.level === 'invalid') return;
    commit(applySteps(session, placements, [{ key, day, slotId }]));
  };
  const apply = (steps: Step[]) => commit(applySteps(session, placements, steps));

  const isClass = who.startsWith('c:');
  const id = who.slice(2);
  const grid = isClass ? classGrid(project, entries, id) : teacherGrid(project, entries, id);
  const tray = session
    .unplaced()
    .filter((u) => (isClass ? u.classIds.includes(id) : u.teacherIds.includes(id)));
  const allUnplaced = session.unplaced().length;
  const sel = selected ? session.units.get(selected) : undefined;
  const selPlacement = selected ? session.placementOf(selected) : undefined;
  const nameOf = (cid: string) => project.classes.find((c) => c.id === cid)?.name ?? '?';

  return (
    <div className="space-y-4">
      <PageHeader title={tx('Edit timetable')}>
        <Rich
          text={tx(
            'Drag a lesson to a new period, or click a lesson and then click where it should go. While you move a lesson, periods turn <green>green</green> (fine), <amber>amber</amber> (allowed, but breaks a preference) or <red>red</red> (clash). Clashes are allowed while you work.',
          )}
          tags={{
            green: (c) => <span className="rounded bg-emerald-100 px-1">{c}</span>,
            amber: (c) => <span className="rounded bg-amber-100 px-1">{c}</span>,
            red: (c) => <span className="rounded bg-red-100 px-1">{c}</span>,
          }}
        />
      </PageHeader>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium">{version.name}</span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${version.status === 'approved' ? 'bg-teal-100 text-teal-900' : 'bg-slate-100 text-slate-700'}`}>
            {version.status === 'approved' ? tx('approved') : tx('draft')}
          </span>
          <span
            className={`rounded px-2 py-0.5 text-sm font-medium ${check.violations.length ? 'bg-red-100 text-red-900' : 'bg-emerald-50 text-emerald-900'}`}
            data-testid="clash-count"
          >
            {check.violations.length === 0 ? tx('No clashes') : check.violations.length === 1 ? tx('1 clash') : tx('{n} clashes', { n: check.violations.length })}
          </span>
          <span className="text-sm text-slate-600" data-testid="unplaced-count">
            {tx('{allUnplaced} not placed', { allUnplaced })}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn" onClick={undo} disabled={!history.past.length} title={tx('Undo')}>
              {tx('↶ Undo')}
            </button>
            <button className="btn" onClick={redo} disabled={!history.future.length} title={tx('Redo')}>
              {tx('↷ Redo')}
            </button>
            {version.status === 'draft' && (
              <button
                className="btn btn-primary"
                disabled={check.violations.length > 0}
                title={check.violations.length ? tx('Fix the clashes first') : tx('Mark this timetable as final')}
                onClick={() => setApproving(true)}
                data-testid="approve"
              >
                {tx('Approve…')}
              </button>
            )}
            {version.status === 'approved' && (
              <button className="btn btn-primary" onClick={onPrint}>
                {tx('Print & share →')}
              </button>
            )}
          </div>
        </div>
        {version.status === 'approved' && (
          <p className="mt-2 text-xs text-slate-600">{tx('Approved. Any change makes a new draft, so the printed timetable stays as it was.')}</p>
        )}
        {approving && (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-teal-300 bg-teal-50 p-3">
            <label className="text-sm">
              <span className="label">{tx('Effective from (optional)')}</span>
              <input type="date" className="field w-44" value={effective} onChange={(e) => setEffective(e.target.value)} />
            </label>
            {allUnplaced > 0 && <p className="text-sm text-amber-800">{tx('{allUnplaced} lesson(s) are still not placed.', { allUnplaced })}</p>}
            <button
              className="btn btn-primary"
              onClick={() => {
                update((d) => approveActiveVersion(d, effective || null));
                setApproving(false);
              }}
            >
              {tx('Approve')}
            </button>
            <button className="btn" onClick={() => setApproving(false)}>
              {tx('Cancel')}
            </button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card
          title={tx('Week')}
          actions={
            <select className="field w-56" value={who} onChange={(e) => setWho(e.target.value)} aria-label={tx('Edit timetable of')}>
              <optgroup label={tx('Classes')}>
                {project.classes.map((c) => (
                  <option key={c.id} value={`c:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={tx('Teachers')}>
                {project.teachers.map((t) => (
                  <option key={t.id} value={`t:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            </select>
          }
        >
          {!grid ? (
            <Empty>{tx('Nothing to show.')}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm" data-testid="edit-grid">
                <thead>
                  <tr>
                    <th className="w-20 border border-slate-200 bg-slate-50" />
                    {grid.days.map((d) => (
                      <th key={d} className="border border-slate-200 bg-slate-50 px-2 py-1">
                        {dayShort(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row, r) => {
                    const first = row.slots.find((s) => !!s);
                    if (row.kind !== 'period')
                      return (
                        <tr key={r}>
                          <td colSpan={grid.days.length + 1} className="border border-slate-200 bg-slate-50 py-0.5 text-center text-xs text-slate-500">
                            {row.label}
                          </td>
                        </tr>
                      );
                    return (
                      <tr key={r}>
                        <td className="border border-slate-200 bg-slate-50 px-2 py-1 align-top">
                          <span className="block font-medium">{row.label}</span>
                          <span className="block text-xs text-slate-500">{first && formatClock(first.start)}</span>
                        </td>
                        {grid.days.map((day, i) => {
                          const slot = row.slots[i];
                          if (!slot || slot.kind !== 'period') return <td key={day} className="border border-slate-200 bg-slate-100" />;
                          const lessons = grid.cells.get(`${day}|${slot.id}`) ?? [];
                          const v = targets.get(`${day}|${slot.id}`);
                          const clash = lessons.length > 1;
                          return (
                            <td
                              key={day}
                              className={`h-14 border border-slate-200 p-0.5 align-top ${v ? TARGET[v.level] : ''} ${clash ? 'bg-red-50' : ''}`}
                              title={v && v.reasons.length ? v.reasons.join('; ') : undefined}
                              data-cell={`${day}|${slot.id}`}
                              data-level={v?.level}
                              onDragOver={(e) => {
                                if (v && v.level !== 'invalid') e.preventDefault();
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const key = e.dataTransfer.getData('text/plain');
                                setDragging(null);
                                if (key) moveTo(key, day, slot.id);
                              }}
                              onClick={() => {
                                if (selected && v && v.level !== 'invalid' && !lessons.some((l) => `${l.itemId}#${l.occurrence}` === selected)) {
                                  moveTo(selected, day, slot.id);
                                }
                              }}
                            >
                              {lessons.map((l) => (
                                <Chip
                                  key={`${l.itemId}#${l.occurrence}`}
                                  lesson={l}
                                  isClass={isClass}
                                  teacherId={isClass ? null : id}
                                  nameOf={nameOf}
                                  clash={clash}
                                  selected={selected === `${l.itemId}#${l.occurrence}`}
                                  onSelect={(k) => setSelected((s) => (s === k ? null : k))}
                                  onDrag={setDragging}
                                />
                              ))}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title={sel ? sel.label : tx('Lesson')}>
            {!sel ? (
              <p className="text-sm text-slate-500">{tx('Click a lesson to see where else it can go.')}</p>
            ) : (
              <div className="space-y-3 text-sm" data-testid="lesson-panel">
                <p className="text-slate-600">
                  {selPlacement ? tx('Now: {where}', { where: session.where(selPlacement) }) : tx('Not placed yet — click a green period to place it.')}
                  {sel.teacherIds.length > 0 && ` · ${sel.teacherIds.map((t) => session.model.names.get(t)).join(', ')}`}
                </p>
                {selPlacement && (
                  <div className="flex flex-wrap gap-2">
                    <button className="btn" onClick={() => commit(toggleLock(placements, sel.key))} data-testid="lock">
                      {selPlacement.locked ? tx('🔓 Unlock') : tx('🔒 Lock here')}
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        commit(removePlacement(placements, sel.key));
                      }}
                    >
                      {tx('Take off timetable')}
                    </button>
                  </div>
                )}
                {selPlacement?.locked ? (
                  <p className="text-xs text-slate-500">{tx('Locked lessons stay put when you generate again.')}</p>
                ) : (
                  <Suggestions session={session} lessonKey={sel.key} onApply={apply} />
                )}
              </div>
            )}
          </Card>

          <Card title={tray.length !== allUnplaced ? tx('Not placed ({n} of {total})', { n: tray.length, total: allUnplaced }) : tx('Not placed ({n})', { n: tray.length })}>
            {tray.length === 0 ? (
              <p className="text-sm text-slate-500">{tx('Every lesson here is on the timetable.')}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5" data-testid="tray">
                {tray.map((u) => (
                  <li
                    key={u.key}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', u.key);
                      setDragging(u.key);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onClick={() => setSelected((s) => (s === u.key ? null : u.key))}
                    className={`cursor-grab rounded border px-2 py-1 text-xs ${selected === u.key ? 'border-teal-600 bg-teal-50' : 'border-amber-300 bg-amber-50'}`}
                  >
                    {u.label}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={tx('Clashes ({violations})', { violations: check.violations.length })}>
            {check.violations.length === 0 ? (
              <p className="text-sm text-emerald-800">{tx('No clashes. The timetable can be approved.')}</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm text-red-900" data-testid="conflicts">
                {check.violations.map((v, i) => (
                  <li key={i}>{v.message}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Chip({
  lesson,
  isClass,
  teacherId,
  nameOf,
  clash,
  selected,
  onSelect,
  onDrag,
}: {
  lesson: LessonEntry;
  isClass: boolean;
  teacherId: string | null;
  nameOf: (id: string) => string;
  clash: boolean;
  selected: boolean;
  onSelect: (key: string) => void;
  onDrag: (key: string | null) => void;
}) {
  const key = `${lesson.itemId}#${lesson.occurrence}`;
  const own = teacherId ? (lesson.parts.find((p) => p.teacherIds.includes(teacherId)) ?? lesson.parts[0]) : lesson.parts[0];
  return (
    <div
      draggable={!lesson.locked}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', key);
        e.dataTransfer.effectAllowed = 'move';
        onDrag(key);
      }}
      onDragEnd={() => onDrag(null)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(key);
      }}
      data-lesson={key}
      className={`mb-0.5 cursor-pointer rounded px-1 py-0.5 ${lesson.locked ? 'cursor-default' : 'cursor-grab'} ${
        selected ? 'bg-teal-600 text-white' : clash ? 'bg-red-200 ring-1 ring-red-500' : lesson.uncovered ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-white ring-1 ring-slate-300'
      }`}
    >
      <span className="font-semibold">{isClass ? lesson.title : (own?.subject ?? lesson.title)}</span>
      {lesson.locked && <span className="ml-1 text-[10px]">🔒</span>}
      {lesson.slotIds.length > 1 && <span className="ml-1 text-[10px] opacity-70">{tx('double')}</span>}
      <span className="block text-[11px] opacity-80">
        {isClass
          ? lesson.parts.length > 1
            ? lesson.parts.map((p) => p.subject).join(' · ')
            : lesson.uncovered
              ? tx('no teacher')
              : lesson.parts[0]?.teacher
          : lesson.classIds.map(nameOf).join('+')}
      </span>
    </div>
  );
}

function Suggestions({ session, lessonKey, onApply }: { session: EditSession; lessonKey: string; onApply: (steps: Step[]) => void }) {
  const list = useMemo(() => session.suggestions(lessonKey), [session, lessonKey]);
  if (!list.length) return <p className="text-xs text-slate-500">{tx('No clash-free move found. You can still drag it; the clash will be listed.')}</p>;
  return (
    <div>
      <p className="label">{tx('Clash-free options')}</p>
      <ul className="mt-1 max-h-80 space-y-1.5 overflow-y-auto" data-testid="suggestions">
        {list.map((s, i) => (
          <li key={i} className="rounded border border-slate-200 p-2">
            <div className="flex items-start justify-between gap-2">
              <span>
                <span className="mr-1 rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-600">{s.kind}</span>
                {s.description}
              </span>
              <button className="btn shrink-0 px-2 py-0.5 text-xs" onClick={() => onApply(s.steps)}>
                {tx('Apply')}
              </button>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{tx('Affects:')} {s.teachers.join(', ') || tx('no teacher')}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
