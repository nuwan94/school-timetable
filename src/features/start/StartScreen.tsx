import logo from '@/assets/logo.svg';
import { useUiStore } from '@/store/uiStore';
import { Icon, type IconName } from '@/ui/Icon';
import { InstallButton } from '@/ui/Install';
import { useRecovery } from './useRecovery';
import { dayShort, msg, tx, dateLabel } from '@/i18n';

const FEATURES: { icon: IconName; title: string; text: string; tone: string }[] = [
  {
    icon: 'grid',
    get title() { return tx('Clash-free in seconds'); },
    get text() { return tx('No teacher, class or room is ever double-booked. The optimiser then spreads subjects and balances each day.'); },
    tone: 'bg-teal-100 text-teal-700',
  },
  {
    icon: 'swap',
    get title() { return tx('Daily relief'); },
    get text() { return tx('Mark who is absent and get fair cover suggestions, a relief sheet and slips to hand out.'); },
    tone: 'bg-amber-100 text-amber-700',
  },
  {
    icon: 'print',
    get title() { return tx('Print-ready sheets'); },
    get text() { return tx('Class, teacher, room and staff-room sheets as PDF or PNG, in English, Sinhala or Tamil.'); },
    tone: 'bg-sky-100 text-sky-700',
  },
  {
    icon: 'calendar',
    get title() { return tx('Term tests'); },
    get text() { return tx('Paper grid by date and session, fair invigilation duties and clash checks.'); },
    tone: 'bg-violet-100 text-violet-700',
  },
  {
    icon: 'pen',
    get title() { return tx('Mid-year changes'); },
    get text() { return tx('A teacher leaves or joins: the timetable changes as little as possible and notices go to those affected.'); },
    tone: 'bg-rose-100 text-rose-700',
  },
  {
    icon: 'lock',
    get title() { return tx('Private and offline'); },
    get text() { return tx('No account and nothing uploaded. Save .ttb files, or run the whole app from a pendrive.'); },
    tone: 'bg-emerald-100 text-emerald-700',
  },
];

/** A small week grid for the hero (decorative). */
const PREVIEW: [string, string][][] = [
  [
    ['Maths', 'a'],
    ['Sci', 'b'],
    ['Eng', 'c'],
    ['Maths', 'a'],
    ['Sin', 'd'],
  ],
  [
    ['Sci', 'b'],
    ['Maths', 'a'],
    ['Sin', 'd'],
    ['Hist', 'e'],
    ['Eng', 'c'],
  ],
  [
    ['Eng', 'c'],
    ['Sin', 'd'],
    ['Maths', 'a'],
    ['Sci', 'b'],
    [msg('Relief'), 'x'],
  ],
  [
    ['Hist', 'e'],
    ['Eng', 'c'],
    ['Sci', 'b'],
    ['Sin', 'd'],
    ['Maths', 'a'],
  ],
  [
    ['ICT', 'e'],
    ['Art', 'b'],
    ['Rel', 'd'],
    ['Eng', 'c'],
    ['Sci', 'b'],
  ],
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
        <span className="text-sm font-bold text-teal-800">{tx('Grade 10 A · Week')}</span>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">{tx('0 clashes')}</span>
      </div>
      <div className="mt-3 grid grid-cols-[auto_repeat(5,1fr)] gap-1.5 text-center text-[11px] font-semibold sm:text-xs">
        <span />
        {['mon', 'tue', 'wed', 'thu', 'fri'].map(dayShort).map((d) => (
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
          {tx(s)}
        </span>
      ))}
    </>
  );
}

export function StartScreen() {
  const setWizard = useUiStore((s) => s.setWizard);
  const { recovery, recover, dismiss } = useRecovery();
  const trySample = () => setWizard(true, 'example');

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
            <div className="hidden items-center gap-3 sm:flex">
              <img src={logo} alt="" className="h-12 w-12 rounded-xl ring-2 ring-white/30" />
              <span className="text-lg font-semibold tracking-wide text-teal-50">{tx('School Timetable')}</span>
            </div>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              {tx('Clash-free school timetables,')}{' '}
              <span className="bg-gradient-to-r from-amber-200 to-yellow-300 bg-clip-text text-transparent">{tx('made simple.')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-teal-50/90">
              {tx('Generate, print and share in minutes. Daily relief, term tests and mid-year changes for Sri Lankan schools. Free, private and works offline.')}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                className="rounded-xl bg-amber-400 px-5 py-3 font-semibold text-amber-950 shadow-lg shadow-amber-900/20 transition hover:-translate-y-0.5 hover:bg-amber-300"
                onClick={() => setWizard(true)}
                data-testid="hero-get-started"
              >
                {tx('Get started →')}
              </button>
              <button
                className="rounded-xl bg-white/15 px-5 py-3 font-semibold text-white ring-1 ring-white/40 backdrop-blur transition hover:bg-white/25"
                onClick={trySample}
              >
                {tx('Try an example school')}
              </button>
            </div>
            <div className="mt-8 flex flex-wrap gap-2 text-sm">
              {['English', 'සිංහල', 'தமிழ்'].map((l) => (
                <span key={l} className="rounded-full bg-white/10 px-3 py-1 font-medium ring-1 ring-white/25">
                  {l}
                </span>
              ))}
              <span className="rounded-full bg-white/10 px-3 py-1 font-medium ring-1 ring-white/25">{tx('No sign-up')}</span>
            </div>
          </div>
          <div className="mx-auto hidden w-full max-w-md sm:block">
            <TimetablePreview />
          </div>
        </div>
      </section>

      {recovery && (
        <div className="px-4">
          <div
            className="mx-auto mt-6 flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4"
            data-testid="recovery-banner"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Icon name="history" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 basis-56">
              <p className="font-semibold text-amber-900">{tx('Continue where you left off?')}</p>
              <p className="text-sm text-amber-800">
                {recovery.schoolName || tx('Untitled school')} {tx('— autosaved {toLocaleString}', { toLocaleString: dateLabel(new Date(recovery.savedAt), { time: true }) })}
                {recovery.unsaved ? tx(' (had unsaved changes)') : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={recover}>
                {tx('Recover')}
              </button>
              <button className="btn" onClick={dismiss}>
                {tx('Dismiss')}
              </button>
            </div>
          </div>
        </div>
      )}

      <section id="features" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-12">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">{tx('Everything the timetable teacher does, in one place')}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">{tx('From the first draft in January to the last relief slip in December.')}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${f.tone}`}>
                <Icon name={f.icon} />
              </span>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 pb-14">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 to-emerald-600 px-6 py-10 text-center text-white shadow-xl sm:px-10">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-300/30 blur-3xl" />
          <h2 className="relative text-2xl font-bold sm:text-3xl">{tx('Ready for next term?')}</h2>
          <p className="relative mx-auto mt-2 max-w-xl text-teal-50/90">
            {tx('Set up your school in a few minutes, or open the sample and press Generate.')}
          </p>
          <div className="relative mt-6 flex flex-wrap justify-center gap-3">
            <button
              className="rounded-xl bg-amber-400 px-5 py-3 font-semibold text-amber-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-amber-300"
              onClick={() => setWizard(true)}
            >
              {tx('Get started →')}
            </button>
            <InstallButton className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-5 py-3 font-semibold text-white ring-1 ring-white/40 transition hover:bg-white/25" />
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-600">
          <span className="flex items-center gap-2">
            <Icon name="lock" className="h-4 w-4 text-emerald-600" />
            {tx('Everything stays on this device. Nothing is uploaded.')}
          </span>
          <InstallButton className="inline-flex items-center gap-1.5 font-medium text-teal-700 hover:underline" />
        </div>
      </footer>
    </div>
  );
}
