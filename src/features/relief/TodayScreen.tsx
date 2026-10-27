import { useCallback, useMemo, useState } from 'react';
import type { Draft } from 'immer';
import { newId } from '@/domain/common';
import type { Project } from '@/domain/project';
import {
  addDays,
  alternatives,
  autoAssign,
  candidates,
  coverNeeds,
  dayContext,
  makeAssignment,
  needKey,
  setAssignment,
  staleAssignments,
  type CoverNeed,
  type DayContext,
} from '@/domain/relief';
import type { Absence } from '@/domain/schedule';
import { mainSchedule } from '@/domain/timetable';
import { formatClock, teachingSlots } from '@/domain/time';
import { downloadBlob } from '@/io/projectFile';
import { dayName, LABELS, type Lang } from '@/print/labels';
import { sheetsToPdf, sheetToPng, type RenderedSheet } from '@/print/output';
import { reliefLines, reliefRegister, reliefSlips } from '@/print/reliefSheets';
import '@/print/sheet.css';
import { SheetRenderer } from '@/print/SheetRenderer';
import type { Sheet } from '@/print/sheets';
import { useProjectStore } from '@/store/projectStore';
import { Card, Empty } from '@/ui/kit';
import { loadUiLang, saveUiLang, STRINGS } from './strings';

const todayIso = () => new Date().toLocaleDateString('en-CA');

const LANG_BUTTONS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'si', label: 'සිං' },
  { value: 'ta', label: 'தமி' },
];

type Job = { kind: 'pdf' | 'png' | 'print'; sheets: Sheet[]; name: string };

/** Removes relief choices whose lesson no longer needs cover (absence removed or shortened). */
function pruneRelief(d: Draft<Project>, date: string) {
  const p = d as Project;
  const stale = new Set(staleAssignments(p.relief, date, coverNeeds(p, dayContext(p, date))).map((r) => r.id));
  if (stale.size) d.relief = d.relief.filter((r) => !stale.has(r.id));
}

export function TodayScreen({ onGenerate }: { onGenerate: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [date, setDate] = useState(todayIso);
  const [lang, setLangState] = useState<Lang>(() => loadUiLang(project.institute.printLanguage));
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const S = STRINGS[lang];
  const setLang = (l: Lang) => {
    setLangState(l);
    saveUiLang(l);
  };

  const ctx = useMemo(() => dayContext(project, date), [project, date]);
  const needs = useMemo(() => coverNeeds(project, ctx), [project, ctx]);
  const assigned = useMemo(() => new Map(project.relief.filter((r) => r.date === date).map((r) => [needKey(r), r])), [project, date]);
  const coveredCount = needs.filter((n) => assigned.has(n.key)).length;
  const tName = (id: string | null) => project.teachers.find((t) => t.id === id)?.name ?? '?';
  const cName = (id: string) => project.classes.find((c) => c.id === id)?.name ?? '?';
  const periods = useMemo(() => {
    const s = mainSchedule(project);
    return s ? teachingSlots(s, ctx.day) : [];
  }, [project, ctx.day]);

  const editAbsences = (fn: (d: Draft<Project>) => void) =>
    update((d) => {
      fn(d);
      pruneRelief(d, date);
    });
  const markAway = (teacherId: string) =>
    editAbsences((d) => {
      d.absences.push({ id: newId('abs'), teacherId, from: date, to: date, slotIds: [], recurrence: null, reason: '', coverTeacherId: null });
    });

  const run = useCallback(
    async (j: Job, nodes: RenderedSheet[]) => {
      try {
        if (j.kind === 'pdf') downloadBlob(await sheetsToPdf(nodes), `${j.name}.pdf`);
        if (j.kind === 'png' && nodes[0]) downloadBlob(await sheetToPng(nodes[0].node), `${j.name}.png`);
        if (j.kind === 'print') {
          await document.fonts.ready;
          window.print();
        }
      } finally {
        setJob(null);
      }
    },
    [],
  );

  const teachers = project.teachers.filter((t) => t.active);
  const away = teachers.filter((t) => ctx.absent.has(t.id));
  const present = teachers.filter((t) => !ctx.absent.has(t.id) && t.name.toLowerCase().includes(query.trim().toLowerCase()));
  const byPeriod = new Map<number, CoverNeed[]>();
  for (const n of needs) byPeriod.set(n.start, [...(byPeriod.get(n.start) ?? []), n]);

  return (
    <div className="mx-auto max-w-3xl space-y-4" lang={lang}>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-bold">{S.title}</h1>
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5" role="group" aria-label="Language">
          {LANG_BUTTONS.map((b) => (
            <button
              key={b.value}
              className={`min-h-9 rounded px-2.5 text-sm ${lang === b.value ? 'bg-teal-700 text-white' : ''}`}
              aria-pressed={lang === b.value}
              onClick={() => setLang(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="btn min-h-11 min-w-11" aria-label={S.prevDay} onClick={() => setDate(addDays(date, -1))}>
          ‹
        </button>
        <input type="date" className="field min-h-11 flex-1" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
        <button className="btn min-h-11 min-w-11" aria-label={S.nextDay} onClick={() => setDate(addDays(date, 1))}>
          ›
        </button>
        <span className="hidden text-sm font-medium text-slate-600 sm:inline">{dayName(lang, ctx.day)}</span>
      </div>

      {!ctx.version ? (
        <Empty>
          {S.noTimetable}{' '}
          <button className="text-teal-700 underline" onClick={onGenerate}>
            {S.goGenerate}
          </button>
        </Empty>
      ) : ctx.closed ? (
        <p className="rounded-md border border-slate-300 bg-slate-50 p-4 text-center font-medium" data-testid="closed">
          {S.closed} — {ctx.closed}
        </p>
      ) : (
        <>
          <Card title={`${S.whoAway}${away.length ? ` (${away.length})` : ''}`}>
            <p className="mb-3 text-sm text-slate-600">{S.tapToMark}</p>
            {away.length > 0 && (
              <ul className="mb-3 space-y-2" data-testid="away-list">
                {away.map((t) => (
                  <AwayRow
                    key={t.id}
                    ctx={ctx}
                    teacherId={t.id}
                    name={t.name}
                    periods={periods}
                    open={open === t.id}
                    onToggle={() => setOpen(open === t.id ? null : t.id)}
                    lang={lang}
                    edit={editAbsences}
                  />
                ))}
              </ul>
            )}
            <input className="field mb-2 min-h-11 w-full" aria-label={S.search} placeholder={S.search} value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto" data-testid="teacher-chips">
              {present.map((t) => (
                <button key={t.id} className="min-h-11 rounded-full border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50" onClick={() => markAway(t.id)}>
                  {t.name}
                </button>
              ))}
            </div>
          </Card>

          <Card
            title={
              <span data-testid="cover-title">
                {S.toCover} · {coveredCount}/{needs.length} {S.covered}
              </span>
            }
            actions={
              needs.length > 0 && (
                <>
                  <button
                    className="btn btn-primary min-h-11"
                    data-testid="auto-assign"
                    onClick={() => update((d) => void (d.relief = autoAssign(d as Project, ctx, needs, d.relief as Project['relief'])))}
                  >
                    {S.autoAssign}
                  </button>
                  <button className="btn min-h-11" onClick={() => update((d) => void (d.relief = d.relief.filter((r) => r.date !== date)))}>
                    {S.clearAll}
                  </button>
                </>
              )
            }
          >
            {needs.length === 0 ? (
              <p className="text-sm text-slate-600">{S.nothingToCover}</p>
            ) : (
              <div className="space-y-4" data-testid="needs">
                {[...byPeriod].map(([start, list]) => (
                  <section key={start}>
                    <h3 className="mb-1.5 text-sm font-semibold text-slate-700">
                      {list[0]!.slotLabel} · {formatClock(start)}–{formatClock(list[0]!.end)}
                    </h3>
                    <ul className="space-y-2">
                      {list.map((n) => (
                        <NeedCard key={n.key} need={n} ctx={ctx} lang={lang} cName={cName} tName={tName} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </Card>

          {needs.length > 0 && (
            <Card title={S.share}>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  className="btn min-h-11"
                  disabled={!!job}
                  data-testid="register-pdf"
                  onClick={() => setJob({ kind: 'pdf', sheets: [reliefRegister(project, date, lang)], name: `relief-register-${date}` })}
                >
                  {S.registerPdf}
                </button>
                <button
                  className="btn min-h-11"
                  disabled={!!job}
                  data-testid="register-png"
                  onClick={() => setJob({ kind: 'png', sheets: [reliefRegister(project, date, lang)], name: `relief-${date}` })}
                >
                  {S.registerPng}
                </button>
                <button
                  className="btn min-h-11"
                  disabled={!!job || coveredCount === 0}
                  onClick={() => setJob({ kind: 'pdf', sheets: reliefSlips(project, date, lang), name: `relief-slips-${date}` })}
                >
                  {S.slipsPdf}
                </button>
                <button
                  className="btn min-h-11"
                  disabled={!!job}
                  onClick={() => setJob({ kind: 'print', sheets: [reliefRegister(project, date, lang)], name: '' })}
                >
                  {S.print}
                </button>
              </div>
              {job && <p className="mt-2 text-sm text-slate-600">{S.working}</p>}
              <ul className="mt-3 divide-y divide-slate-100 text-sm" data-testid="relief-summary">
                {reliefLines(project, date, lang).map((l) => (
                  <li key={l.need.key} className="flex flex-wrap gap-x-3 py-1">
                    <span className="w-28 shrink-0 text-slate-500">{l.period}</span>
                    <span className="font-medium">{l.className}</span>
                    <span>{l.subject}</span>
                    <span className={l.assignment ? 'text-teal-800' : 'text-amber-800'}>→ {l.relief}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {job && <SheetRenderer sheets={job.sheets} print={job.kind === 'print'} fit={job.kind === 'png'} onReady={(nodes) => void run(job, nodes)} />}
        </>
      )}
    </div>
  );
}

function AwayRow({
  ctx,
  teacherId,
  name,
  periods,
  open,
  onToggle,
  lang,
  edit,
}: {
  ctx: DayContext;
  teacherId: string;
  name: string;
  periods: { id: string; label: string; start: number }[];
  open: boolean;
  onToggle: () => void;
  lang: Lang;
  edit: (fn: (d: Draft<Project>) => void) => void;
}) {
  const S = STRINGS[lang];
  const project = useProjectStore((s) => s.project)!;
  const info = ctx.absent.get(teacherId)!;
  const own = info.sources.find((s) => s.kind !== 'overlay');
  const absence = own && 'absenceId' in own ? project.absences.find((a) => a.id === own.absenceId) : undefined;
  const fromOverlay = info.sources.some((s) => s.kind === 'overlay');
  const teaches = new Set(ctx.entries.filter((e) => e.teacherIds.includes(teacherId)).flatMap((e) => e.slotIds));
  const change = (fn: (a: Draft<Absence>) => void) =>
    edit((d) => {
      const a = d.absences.find((x) => x.id === absence?.id);
      if (a) fn(a);
    });

  return (
    <li className="rounded-md border border-amber-300 bg-amber-50">
      <button className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left" onClick={onToggle} aria-expanded={open}>
        <span className="font-medium">{name}</span>
        <span className="text-xs text-amber-900">
          {info.wholeDay ? S.wholeDay : info.slotIds.length + ' ' + LABELS[lang].periods}
          {fromOverlay && ` · ${S.fromCalendar}`}
          {absence?.recurrence && ` · ${S.repeats}`}
          {absence?.reason && ` · ${absence.reason}`}
        </span>
      </button>
      {open && absence && (
        <div className="space-y-3 border-t border-amber-200 px-3 py-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <button
              className={`min-h-10 rounded-full border px-3 ${!absence.slotIds.length ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white'}`}
              onClick={() => change((a) => void (a.slotIds = []))}
            >
              {S.wholeDay}
            </button>
            {periods.map((s) => {
              const on = absence.slotIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  className={`min-h-10 min-w-10 rounded-full border px-2 ${on ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white'} ${teaches.has(s.id) ? 'font-semibold' : 'text-slate-500'}`}
                  aria-pressed={on}
                  title={formatClock(s.start)}
                  onClick={() =>
                    change((a) => {
                      a.slotIds = on ? a.slotIds.filter((x) => x !== s.id) : [...a.slotIds, s.id];
                    })
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label>
              <span className="label">{S.until}</span>
              <input
                type="date"
                className="field min-h-10 w-full"
                value={absence.to}
                min={absence.from}
                disabled={!!absence.recurrence}
                onChange={(e) => e.target.value && change((a) => void (a.to = e.target.value))}
              />
            </label>
            <label>
              <span className="label">{S.repeat}</span>
              <select
                className="field min-h-10 w-full"
                value={absence.recurrence?.everyWeeks ?? 0}
                onChange={(e) => {
                  const every = Number(e.target.value);
                  change((a) => {
                    a.recurrence = every ? { day: ctx.day, everyWeeks: every, from: ctx.date, to: null } : null;
                    if (every) a.from = a.to = ctx.date;
                  });
                }}
              >
                <option value={0}>{S.never}</option>
                <option value={1}>{S.weekly}</option>
                <option value={2}>{S.fortnightly}</option>
              </select>
            </label>
            <label>
              <span className="label">{S.reason}</span>
              <input className="field min-h-10 w-full" value={absence.reason} onChange={(e) => change((a) => void (a.reason = e.target.value))} />
            </label>
          </div>
          <button className="btn min-h-10" onClick={() => edit((d) => void (d.absences = d.absences.filter((a) => a.id !== absence.id)))}>
            {S.notAway}
          </button>
        </div>
      )}
    </li>
  );
}

function NeedCard({ need, ctx, lang, cName, tName }: { need: CoverNeed; ctx: DayContext; lang: Lang; cName: (id: string) => string; tName: (id: string | null) => string }) {
  const S = STRINGS[lang];
  const L = LABELS[lang];
  const project = useProjectStore((s) => s.project)!;
  const update = useProjectStore((s) => s.update);
  const [more, setMore] = useState(false);
  const current = project.relief.find((r) => r.date === ctx.date && needKey(r) === need.key);
  const list = useMemo(() => (current && !more ? [] : candidates(project, ctx, need)), [project, ctx, need, current, more]);
  const alts = useMemo(() => (more ? alternatives(project, ctx, need) : []), [project, ctx, need, more]);
  const subject = project.subjects.find((s) => s.id === need.subjectId)?.name ?? '';
  const choose = (choice: Parameters<typeof makeAssignment>[2]) => {
    update((d) => void (d.relief = setAssignment(d.relief as Project['relief'], ctx.date, need.key, makeAssignment(ctx, need, choice))));
    setMore(false);
  };
  const describe = () => {
    if (!current) return '';
    if (current.kind === 'combine') return `${L.combineWith} ${cName(current.combineWithGroupId ?? '')}`;
    if (current.kind === 'supervised') return `${current.note === 'Ground' ? L.ground : L.library} · ${tName(current.reliefTeacherId)}`;
    if (current.kind === 'classTeacher') return `${tName(current.reliefTeacherId)} (${L.classTeacher})`;
    return tName(current.reliefTeacherId);
  };

  return (
    <li className={`rounded-md border p-2.5 ${current ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white'}`} data-need={need.key}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span>
          <b>{need.classIds.map(cName).join('+')}</b> {subject}
        </span>
        <span className="text-xs text-slate-500">
          {S.insteadOf} {tName(need.absentTeacherId)}
        </span>
      </div>
      {current && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="font-medium text-teal-900" data-testid="assigned">
            → {describe()}
          </span>
          <span className="flex gap-1">
            <button className="btn min-h-10 px-2 text-xs" onClick={() => setMore(!more)}>
              {S.change}
            </button>
            <button
              className="btn min-h-10 px-2 text-xs"
              aria-label={S.remove}
              onClick={() => update((d) => void (d.relief = setAssignment(d.relief as Project['relief'], ctx.date, need.key, null)))}
            >
              ✕
            </button>
          </span>
        </div>
      )}
      {(!current || more) && (
        <div className="mt-2">
          {list.length === 0 ? (
            <p className="text-sm text-amber-800">{S.noFree}</p>
          ) : (
            <>
              {more && <p className="label">{S.freeTeachers}</p>}
              <div className="flex flex-wrap gap-1.5" data-testid="candidates">
                {(more ? list : list.slice(0, 3)).map((c) => (
                  <button
                    key={c.teacherId}
                    className="min-h-11 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-left text-sm hover:border-teal-600"
                    onClick={() => choose({ kind: 'teacher', reliefTeacherId: c.teacherId })}
                  >
                    <span className="block font-medium">{c.name}</span>
                    <span className="block text-[11px] text-slate-500">
                      {c.week} {S.thisWeek}
                      {c.teachesClass && ` · ${S.teachesClass}`}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {more && alts.length > 0 && (
            <>
              <p className="label mt-3">{S.otherWays}</p>
              <div className="flex flex-wrap gap-1.5">
                {alts.map((a, i) => (
                  <button
                    key={i}
                    className="min-h-11 rounded-md border border-dashed border-slate-400 bg-white px-2.5 text-sm hover:border-teal-600"
                    onClick={() => choose({ kind: a.kind, reliefTeacherId: a.reliefTeacherId, combineWithGroupId: a.combineWithGroupId, note: a.note })}
                  >
                    {a.kind === 'combine'
                      ? `${L.combineWith} ${cName(a.combineWithGroupId ?? '')}`
                      : a.kind === 'supervised'
                        ? `${a.note === 'Ground' ? L.ground : L.library} · ${tName(a.reliefTeacherId)}`
                        : `${L.classTeacher}: ${tName(a.reliefTeacherId)}`}
                  </button>
                ))}
              </div>
            </>
          )}
          <button className="mt-2 text-xs text-teal-700 underline" onClick={() => setMore(!more)}>
            {more ? S.fewerOptions : S.moreOptions}
          </button>
        </div>
      )}
    </li>
  );
}
