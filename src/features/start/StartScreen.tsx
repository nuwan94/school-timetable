import { useEffect, useState, type ReactNode } from 'react';
import logo from '@/assets/logo.svg';
import type { Pack } from '@/domain/common';
import { PACK_LABELS } from '@/packs';
import { sampleSchool } from '@/packs/sample';
import type { Snapshot } from '@/store/autosave';
import { useProjectStore } from '@/store/projectStore';
import { autosave } from '@/store/useAutosave';

const PACK_HINTS: Record<Pack, string> = {
  simple: 'Small or rural school. Guided setup, few rules, handles teacher shortage.',
  'sl-gov': 'National / provincial school. NIE grades, media, O/L baskets, A/L streams, returns.',
  international: 'Cambridge / Pearson Edexcel. Student-level clashes, sets, contact hours. (Full screens in v1.1)',
};

/** 24px stroke icons (paths only), drawn in currentColor. */
const ICONS: Record<string, string> = {
  grid: 'M4 5h16v14H4zM4 10h16M9 5v14M14 5v14',
  swap: 'M7 7h11l-3-3M17 17H6l3 3',
  print: 'M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z',
  pen: 'M5 19h4L19 9l-4-4L5 15zM13 7l4 4',
  calendar: 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4M9 14h2',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5zM12 15v2',
};

function Icon({ name, className = 'h-6 w-6' }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  );
}

const FEATURES: { icon: string; title: string; text: string; tone: string }[] = [
  {
    icon: 'grid',
    title: 'Clash-free in seconds',
    text: 'No teacher, class or room is ever double-booked. The optimiser then spreads subjects and balances each day.',
    tone: 'bg-teal-100 text-teal-700',
  },
  {
    icon: 'swap',
    title: 'Daily relief',
    text: 'Mark who is absent and get fair cover suggestions, a relief sheet and slips to hand out.',
    tone: 'bg-amber-100 text-amber-700',
  },
  {
    icon: 'print',
    title: 'Print-ready sheets',
    text: 'Class, teacher, room and staff-room sheets as PDF or PNG, in English, Sinhala or Tamil.',
    tone: 'bg-sky-100 text-sky-700',
  },
  {
    icon: 'calendar',
    title: 'Term tests',
    text: 'Paper grid by date and session, fair invigilation duties and clash checks.',
    tone: 'bg-violet-100 text-violet-700',
  },
  {
    icon: 'pen',
    title: 'Mid-year changes',
    text: 'A teacher leaves or joins: the timetable changes as little as possible and notices go to those affected.',
    tone: 'bg-rose-100 text-rose-700',
  },
  {
    icon: 'lock',
    title: 'Private and offline',
    text: 'No account and nothing uploaded. Save .ttb files, or run the whole app from a pendrive.',
    tone: 'bg-emerald-100 text-emerald-700',
  },
];

/** A small week grid for the hero (decorative). */
const PREVIEW: [string, string][][] = [
  [['Maths', 'a'], ['Sci', 'b'], ['Eng', 'c'], ['Maths', 'a'], ['Sin', 'd']],
  [['Sci', 'b'], ['Maths', 'a'], ['Sin', 'd'], ['Hist', 'e'], ['Eng', 'c']],
  [['Eng', 'c'], ['Sin', 'd'], ['Maths', 'a'], ['Sci', 'b'], ['Relief', 'x']],
  [['Hist', 'e'], ['Eng', 'c'], ['Sci', 'b'], ['Sin', 'd'], ['Maths', 'a']],
  [['ICT', 'e'], ['Art', 'b'], ['Rel', 'd'], ['Eng', 'c'], ['Sci', 'b']],
];
const CELL: Record<string, string> = {
  a: 'bg-teal-100 text-teal-900',
  b: 'bg-sky-100 text-sky-900',
  c: 'bg-amber-100 text-amber-900',
  d: 'bg-violet-100 text-violet-900',
  e: 'bg-slate-100 text-slate-700',
  x: 'bg-amber-400 text-amber-950 ring-2 ring-amber-300 animate-pulse',
};

function TimetablePreview() {
  return (
    <div aria-hidden className="rotate-2 rounded-2xl bg-white p-4 shadow-2xl shadow-teal-950/30 ring-1 ring-white/50 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-teal-800">Grade 10 A · Week</span>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">0 clashes</span>
      </div>
      <div className="mt-3 grid grid-cols-[auto_repeat(5,1fr)] gap-1.5 text-center text-[11px] font-semibold sm:text-xs">
        <span />
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
          <span key={d} className="text-slate-500">
            {d}
          </span>
        ))}
        {PREVIEW.map((row, i) => (
          <Row key={i} n={i + 1} row={row} />
        ))}
      </div>
    </div>
  );
}

function Row({ n, row }: { n: number; row: [string, string][] }) {
  return (
    <>
      <span className="self-center pr-1 text-slate-400">{n}</span>
      {row.map(([s, c], j) => (
        <span key={j} className={`rounded-md px-1 py-2.5 ${CELL[c]}`}>
          {s}
        </span>
      ))}
    </>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>{children}</section>;
}

export function StartScreen({ onOpen }: { onOpen: () => void }) {
  const newProject = useProjectStore((s) => s.newProject);
  const load = useProjectStore((s) => s.load);
  const [pack, setPack] = useState<Pack>('sl-gov');
  const [name, setName] = useState('');
  const [recovery, setRecovery] = useState<Snapshot | null>(null);

  useEffect(() => {
    autosave
      .latest()
      .then((s) => setRecovery(s ?? null))
      .catch(() => setRecovery(null));
  }, []);

  const recover = () => {
    if (!recovery) return;
    try {
      load(autosave.restore(recovery), { fileName: recovery.fileName, handle: null, dirty: recovery.unsaved });
    } catch (e) {
      alert(`Could not recover: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const trySample = () => load(sampleSchool(), { fileName: null, handle: null, dirty: true });
  const toStart = () => {
    document.getElementById('get-started')?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => document.getElementById('school-name')?.focus({ preventScroll: true }), 400);
  };

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-teal-800 via-teal-700 to-emerald-600 text-white">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-400/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-amber-300/25 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:32px_32px]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:py-16 md:grid-cols-[1.1fr_1fr] lg:py-20">
          <div>
            <div className="flex items-center gap-3">
              <img src={logo} alt="" className="h-12 w-12 rounded-xl ring-2 ring-white/30" />
              <span className="text-lg font-semibold tracking-wide text-teal-50">School Timetable</span>
            </div>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Clash-free school timetables,{' '}
              <span className="bg-gradient-to-r from-amber-200 to-yellow-300 bg-clip-text text-transparent">made simple.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-teal-50/90">
              Generate, print and share in minutes. Daily relief, term tests and mid-year changes for Sri Lankan schools. Free, private
              and works offline.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                className="rounded-xl bg-amber-400 px-5 py-3 font-semibold text-amber-950 shadow-lg shadow-amber-900/20 transition hover:-translate-y-0.5 hover:bg-amber-300"
                onClick={trySample}
              >
                Try a sample school
              </button>
              <button
                className="rounded-xl bg-white/15 px-5 py-3 font-semibold text-white ring-1 ring-white/40 backdrop-blur transition hover:bg-white/25"
                onClick={toStart}
              >
                Start your school →
              </button>
            </div>
            <div className="mt-8 flex flex-wrap gap-2 text-sm">
              {['English', 'සිංහල', 'தமிழ்'].map((l) => (
                <span key={l} className="rounded-full bg-white/10 px-3 py-1 font-medium ring-1 ring-white/25">
                  {l}
                </span>
              ))}
              <span className="rounded-full bg-white/10 px-3 py-1 font-medium ring-1 ring-white/25">No sign-up</span>
            </div>
          </div>
          <div className="mx-auto hidden w-full max-w-md sm:block">
            <TimetablePreview />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">Everything the timetable teacher does, in one place</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">From the first draft in January to the last relief slip in December.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${f.tone}`}>
                <Icon name={f.icon} />
              </span>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="get-started" className="scroll-mt-16 bg-gradient-to-b from-slate-50 to-teal-50/60">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <h2 className="text-2xl font-bold sm:text-3xl">Get started</h2>

          {recovery && (
            <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-amber-900">Recover your last session?</p>
                <p className="mt-0.5 text-sm text-amber-800">
                  {recovery.schoolName || 'Untitled school'} — autosaved {new Date(recovery.savedAt).toLocaleString()}
                  {recovery.unsaved ? ' (had unsaved changes)' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={recover}>
                  Recover
                </button>
                <button className="btn" onClick={() => setRecovery(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-6 md:grid-cols-[1fr_16rem]">
            <Card>
              <h3 className="text-lg font-semibold">New project</h3>
              <label className="label mt-4" htmlFor="school-name">
                School name
              </label>
              <input
                id="school-name"
                className="field w-full"
                value={name}
                placeholder="e.g. Sri Sumangala Vidyalaya"
                onChange={(e) => setName(e.target.value)}
              />
              <fieldset className="mt-4">
                <legend className="label">School type</legend>
                <div className="space-y-2">
                  {(Object.keys(PACK_LABELS) as Pack[]).map((p) => (
                    <label
                      key={p}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                        pack === p ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600' : 'border-slate-200 hover:border-teal-300'
                      }`}
                    >
                      <input type="radio" name="pack" checked={pack === p} onChange={() => setPack(p)} className="accent-teal-700" />
                      <span>
                        <span className="block text-sm font-medium">{PACK_LABELS[p]}</span>
                        <span className="block text-xs text-slate-600">{PACK_HINTS[p]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="btn btn-primary mt-5 px-4 py-2" onClick={() => newProject(pack, name.trim())}>
                Create project
              </button>
            </Card>

            <div className="space-y-6">
              <Card>
                <h3 className="font-semibold">Existing project</h3>
                <p className="mt-2 text-sm text-slate-600">Open a .ttb file saved earlier.</p>
                <button className="btn mt-4" onClick={onOpen}>
                  Open file…
                </button>
              </Card>
              <Card className="border-amber-200 bg-amber-50/60">
                <h3 className="font-semibold">Just looking?</h3>
                <p className="mt-2 text-sm text-slate-600">A filled-in school (Grades 6–11, 18 classes) to try Generate on.</p>
                <button className="btn mt-4" onClick={trySample}>
                  Try a sample school
                </button>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-600">
          <span className="flex items-center gap-2">
            <Icon name="lock" className="h-4 w-4 text-emerald-600" />
            Everything stays on this device. Nothing is uploaded.
          </span>
          {!__SINGLE_FILE__ && (
            <a className="font-medium text-teal-700 hover:underline" href="./timetable-offline.html" download>
              Download the offline copy
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}
