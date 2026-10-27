import { produce } from 'immer';
import { useMemo, useState } from 'react';
import type { Project } from '@/domain/project';
import { mainSchedule, saveDraftVersion, lessonEntries } from '@/domain/timetable';
import { teachingSlots, type Weekday } from '@/domain/time';
import { scoreTimetable, type GenerateResult } from '@/solver';
import { runSolver } from '@/solver/runner';
import { useProjectStore } from '@/store/projectStore';
import { Card } from '@/ui/kit';

const DAY = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' } as const;

interface Answer {
  ok: boolean;
  result: GenerateResult;
  moved: number;
  teachers: string[];
  softNow: number;
  question: string;
}

/** Applies a "teacher free at these times" request to a project (pure). */
export function withTeacherFree(p: Project, teacherId: string, day: Weekday, slotIds: string[]): Project {
  const schedule = mainSchedule(p);
  const slots = schedule ? teachingSlots(schedule, day).filter((s) => slotIds.includes(s.id)) : [];
  return produce(p, (d) => {
    const t = d.teachers.find((x) => x.id === teacherId);
    if (t) for (const s of slots) t.unavailable.push({ day, start: s.start, end: s.start + s.duration });
  });
}

/**
 * What-if (PLAN.md §5.3): answers one request at a time — "can this teacher be
 * free then?" — with Yes/No and its cost, before anything is changed.
 */
export function WhatIf() {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const version = project.versions.find((v) => v.id === project.activeVersionId)!;
  const [teacherId, setTeacherId] = useState(project.teachers[0]?.id ?? '');
  const [day, setDay] = useState<Weekday>(project.institute.workingDays[0]!);
  const [slotIds, setSlotIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const periods = useMemo(() => {
    const s = mainSchedule(project);
    return s ? teachingSlots(s, day) : [];
  }, [project, day]);

  const ask = async () => {
    setBusy(true);
    setAnswer(null);
    const t = project.teachers.find((x) => x.id === teacherId)!;
    const changed = withTeacherFree(project, teacherId, day, slotIds);
    try {
      const result = await runSolver(changed, { seed: 1, optimiseMs: 1500, start: { placements: version.placements, mode: 'minimal' } }, () => {}).result;
      const before = new Map(version.placements.map((pl) => [`${pl.itemId}#${pl.occurrence}`, pl]));
      const movedKeys = new Set(
        result.placements
          .filter((pl) => {
            const was = before.get(`${pl.itemId}#${pl.occurrence}`);
            return !was || was.day !== pl.day || was.slotId !== pl.slotId;
          })
          .map((pl) => `${pl.itemId}#${pl.occurrence}`),
      );
      const teachers = new Set<string>();
      for (const e of lessonEntries(changed, result.placements)) if (movedKeys.has(`${e.itemId}#${e.occurrence}`)) e.teacherIds.forEach((x) => teachers.add(x));
      const labels = periods.filter((s) => slotIds.includes(s.id)).map((s) => s.label);
      setAnswer({
        ok: result.unplaced.length === 0 && result.check.violations.length === 0,
        result,
        moved: movedKeys.size,
        teachers: [...teachers].map((id) => project.teachers.find((x) => x.id === id)?.name ?? '?'),
        softNow: scoreTimetable(project, version.placements).total,
        question: `${t.name} free on ${DAY[day]} ${labels.join(', ')}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!answer) return;
    const changed = withTeacherFree(project, teacherId, day, slotIds);
    update((d) => {
      d.teachers = changed.teachers as typeof d.teachers;
      saveDraftVersion(d, answer.result.placements, `what-if: ${answer.question}`);
    });
    setAnswer(null);
    setSlotIds([]);
  };

  return (
    <Card title="What if…?">
      <p className="mb-3 text-sm text-slate-600">Check a request before agreeing to it. Nothing changes until you press Apply.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="label">Teacher</span>
          <select className="field w-52" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            {project.teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-2 text-sm">is free on</span>
        <label className="text-sm">
          <span className="label">Day</span>
          <select
            className="field w-36"
            value={day}
            onChange={(e) => {
              setDay(e.target.value as Weekday);
              setSlotIds([]);
            }}
          >
            {project.institute.workingDays.map((d) => (
              <option key={d} value={d}>
                {DAY[d]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-1" aria-label="Periods">
        {periods.map((s) => {
          const on = slotIds.includes(s.id);
          return (
            <button
              key={s.id}
              aria-pressed={on}
              className={`min-w-10 rounded-full border px-2.5 py-1 text-sm ${on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white'}`}
              onClick={() => setSlotIds(on ? slotIds.filter((x) => x !== s.id) : [...slotIds, s.id])}
            >
              {s.label}
            </button>
          );
        })}
        <button className="btn btn-primary ml-2" disabled={busy || !slotIds.length} onClick={() => void ask()} data-testid="whatif-ask">
          {busy ? 'Checking…' : 'Check'}
        </button>
      </div>
      {answer && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${answer.ok ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}
          data-testid="whatif-answer"
        >
          <p className="font-medium">
            {answer.ok ? 'Yes' : 'No'} — {answer.question}.
          </p>
          {answer.ok ? (
            <>
              <p className="mt-1">
                {answer.moved} lesson(s) move{answer.teachers.length ? `, affecting ${answer.teachers.join(', ')}` : ''}. Rule penalty {answer.softNow} →{' '}
                {answer.result.soft.total}.
              </p>
              <button className="btn btn-primary mt-2" onClick={apply} data-testid="whatif-apply">
                Apply (saves a new draft)
              </button>
            </>
          ) : (
            <p className="mt-1">
              {answer.result.unplaced.length} lesson(s) would have no place
              {answer.result.unplaced[0] ? `, e.g. ${answer.result.unplaced[0].label}: ${answer.result.unplaced[0].reason}` : ''}.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
