import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/ui/Icon';
import type { Pack } from '@/domain/common';
import { PACK_LABELS } from '@/packs';
import { sampleSchool } from '@/packs/sample';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { useRecovery } from './useRecovery';

const PACK_HINTS: Record<Pack, string> = {
  simple: 'Small or rural school. Guided setup, few rules, handles teacher shortage.',
  'sl-gov': 'National / provincial school. NIE grades, media, O/L baskets, A/L streams, returns.',
  international: 'Cambridge / Pearson Edexcel. Student-level clashes, sets, contact hours. (Full screens in v1.1)',
};

const NEXT_STEPS = ['Classes and sections', 'Subjects', 'Rooms and labs', 'Teachers', 'Who teaches what', 'Generate'];

type Step = 'choose' | 'name' | 'type' | 'ready';
const FLOW: Step[] = ['name', 'type', 'ready'];

function Choice(props: { icon: IconName; tone: string; title: string; text: string; onClick: () => void; testId: string }) {
  return (
    <button
      data-testid={props.testId}
      onClick={props.onClick}
      className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${props.tone}`}>
        <Icon name={props.icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{props.title}</span>
        <span className="block text-sm text-slate-600">{props.text}</span>
      </span>
      <Icon name="arrowRight" className="h-5 w-5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-teal-700" />
    </button>
  );
}

/** "Get started" as a pop-up: new school (name → type → ready), open a file, the sample, or the last session. */
export function StartWizard({ onOpen }: { onOpen: () => void }) {
  const open = useUiStore((s) => s.wizardOpen);
  const setWizard = useUiStore((s) => s.setWizard);
  if (!open) return null;
  return <Wizard onOpen={onOpen} onClose={() => setWizard(false)} />;
}

function Wizard({ onOpen, onClose }: { onOpen: () => void; onClose: () => void }) {
  const newProject = useProjectStore((s) => s.newProject);
  const load = useProjectStore((s) => s.load);
  const go = useUiStore((s) => s.go);
  const { recovery, recover } = useRecovery();
  const [step, setStep] = useState<Step>('choose');
  const [name, setName] = useState('');
  const [pack, setPack] = useState<Pack>('sl-gov');
  const dialog = useRef<HTMLDivElement>(null);
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  useEffect(() => {
    if (step === 'name') nameField.current?.focus();
    else dialog.current?.focus();
  }, [step]);

  /** Replacing an open project with unsaved changes needs a yes. */
  const okToReplace = () => {
    const { project, dirty } = useProjectStore.getState();
    return !project || !dirty || confirm('You have unsaved changes. Continue anyway? (An autosave copy is kept.)');
  };
  const finish = (action: () => void) => {
    if (!okToReplace()) return;
    action();
    onClose();
  };
  const create = () =>
    finish(() => {
      newProject(pack, name.trim());
      go('school');
    });

  const index = FLOW.indexOf(step);
  const back = () => setStep(index <= 0 ? 'choose' : FLOW[index - 1]!);
  const next = () => setStep(FLOW[index + 1]!);

  let body: ReactNode;
  if (step === 'choose')
    body = (
      <>
        <h2 id="wizard-title" className="text-2xl font-bold">
          Get started
        </h2>
        <p className="mt-1 text-slate-600">How would you like to begin?</p>
        <div className="mt-5 space-y-3">
          {recovery && (
            <Choice
              testId="wizard-recover"
              icon="history"
              tone="bg-amber-100 text-amber-700"
              title="Continue where you left off"
              text={`${recovery.schoolName || 'Untitled school'} — autosaved ${new Date(recovery.savedAt).toLocaleString()}${
                recovery.unsaved ? ' (had unsaved changes)' : ''
              }`}
              onClick={() => okToReplace() && recover() && onClose()}
            />
          )}
          <Choice
            testId="wizard-new"
            icon="plus"
            tone="bg-teal-100 text-teal-700"
            title="Set up a new school"
            text="A few questions, then the guided setup."
            onClick={() => setStep('name')}
          />
          <Choice
            testId="wizard-open"
            icon="folder"
            tone="bg-sky-100 text-sky-700"
            title="Open a saved file"
            text="A .ttb project saved earlier."
            onClick={() => {
              onClose();
              onOpen();
            }}
          />
          <Choice
            testId="wizard-sample"
            icon="sparkle"
            tone="bg-violet-100 text-violet-700"
            title="Try a sample school"
            text="Grades 6–11, 18 classes, ready to generate."
            onClick={() => finish(() => load(sampleSchool(), { fileName: null, handle: null, dirty: true }))}
          />
        </div>
      </>
    );
  else if (step === 'name')
    body = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <h2 id="wizard-title" className="text-2xl font-bold">
          What is your school called?
        </h2>
        <p className="mt-1 text-slate-600">It goes on every printed sheet. You can change it later.</p>
        <input
          ref={nameField}
          id="school-name"
          className="field mt-5 w-full px-3 py-2.5 text-base"
          value={name}
          placeholder="e.g. Sri Sumangala Vidyalaya"
          onChange={(e) => setName(e.target.value)}
        />
      </form>
    );
  else if (step === 'type')
    body = (
      <>
        <h2 id="wizard-title" className="text-2xl font-bold">
          What kind of school?
        </h2>
        <p className="mt-1 text-slate-600">This picks sensible grades, subjects and rules to start from.</p>
        <fieldset className="mt-5 space-y-2">
          <legend className="sr-only">School type</legend>
          {(Object.keys(PACK_LABELS) as Pack[]).map((p) => (
            <label
              key={p}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition ${
                pack === p ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600' : 'border-slate-200 hover:border-teal-300'
              }`}
            >
              <input type="radio" name="pack" checked={pack === p} onChange={() => setPack(p)} className="mt-1 accent-teal-700" />
              <span>
                <span className="block font-medium">{PACK_LABELS[p]}</span>
                <span className="block text-sm text-slate-600">{PACK_HINTS[p]}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </>
    );
  else
    body = (
      <>
        <h2 id="wizard-title" className="text-2xl font-bold">
          Ready to set up
        </h2>
        <div className="mt-4 rounded-xl bg-teal-50 p-4">
          <p className="text-lg font-semibold text-teal-900">{name.trim() || 'Untitled school'}</p>
          <p className="text-sm text-teal-800">{PACK_LABELS[pack]}</p>
        </div>
        <p className="mt-5 text-sm font-medium text-slate-700">Next, the guided setup walks you through:</p>
        <ol className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {NEXT_STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2 text-sm text-slate-600">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-slate-500">Everything is saved on this device as you go.</p>
      </>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        tabIndex={-1}
        data-testid="start-wizard"
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl outline-none sm:rounded-3xl"
      >
        <div className="h-1.5 bg-gradient-to-r from-teal-600 via-emerald-500 to-amber-400" />
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-4 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
        <div className="overflow-y-auto px-6 pb-4 pt-6">
          {index >= 0 && (
            <div className="mb-4 flex items-center gap-2" aria-label={`Step ${index + 1} of ${FLOW.length}`}>
              {FLOW.map((s, i) => (
                <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-teal-600' : 'bg-slate-200'}`} />
              ))}
            </div>
          )}
          {body}
        </div>
        {index >= 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-4">
            <button className="btn" onClick={back}>
              <Icon name="arrowLeft" className="h-4 w-4" /> Back
            </button>
            {step === 'ready' ? (
              <button className="btn btn-primary px-4 py-2" data-testid="wizard-create" onClick={create}>
                <Icon name="check" className="h-4 w-4" /> Create school
              </button>
            ) : (
              <button className="btn btn-primary px-4 py-2" data-testid="wizard-next" onClick={next}>
                Next <Icon name="arrowRight" className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
