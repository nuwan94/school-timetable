import { useEffect, useRef, useState, type ReactNode } from 'react';
import logo from '@/assets/logo.svg';
import { supportsFileHandles } from '@/io/projectFile';
import { sampleSchool } from '@/packs/sample';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore, type View } from '@/store/uiStore';
import { canInstall, installApp, useInstall } from '@/pwa';
import { Icon, type IconName } from './Icon';
import { InstallButton } from './Install';

const REPO = 'https://github.com/nuwan94/school-timetable';

const BUILD_VIEWS: readonly string[] = ['check', 'rules', 'generate', 'edit', 'print', 'today', 'ledger', 'changes', 'calendar', 'exams'];

/** Quick links in a project: where the timetable teacher goes most. */
const QUICK: { label: string; view: View; icon: IconName; match: (v: View) => boolean }[] = [
  { label: 'Setup', view: 'school', icon: 'school', match: (v) => !BUILD_VIEWS.includes(v) },
  { label: 'Generate', view: 'generate', icon: 'sparkle', match: (v) => v === 'generate' || v === 'check' || v === 'rules' },
  { label: 'Edit', view: 'edit', icon: 'pen', match: (v) => v === 'edit' },
  { label: 'Relief', view: 'today', icon: 'swap', match: (v) => v === 'today' || v === 'ledger' },
  { label: 'Print', view: 'print', icon: 'print', match: (v) => v === 'print' },
];

interface Props {
  open: () => void;
  save: (saveAs?: boolean) => void;
}

/** Closes on outside click and Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function MenuItem(props: { icon: IconName; onClick?: () => void; href?: string; download?: boolean; hint?: string; children: ReactNode }) {
  const cls = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-900';
  const inner = (
    <>
      <Icon name={props.icon} className="h-4 w-4 text-slate-500" />
      <span className="flex-1">{props.children}</span>
      {props.hint && <kbd className="text-[11px] text-slate-400">{props.hint}</kbd>}
    </>
  );
  return props.href ? (
    <a role="menuitem" className={cls} href={props.href} download={props.download} target={props.download ? undefined : '_blank'} rel="noreferrer">
      {inner}
    </a>
  ) : (
    <button role="menuitem" className={cls} onClick={props.onClick}>
      {inner}
    </button>
  );
}

function Dropdown({ label, icon, children, testId }: { label: string; icon: IconName; children: (close: () => void) => ReactNode; testId: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  return (
    <div ref={ref} className="relative">
      <button className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} data-testid={testId}>
        <Icon name={icon} className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
        <Icon name="chevron" className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {children(close)}
        </div>
      )}
    </div>
  );
}

const Divider = () => <div className="my-1 border-t border-slate-100" />;

export function AppHeader({ open, save }: Props) {
  const project = useProjectStore((s) => s.project);
  const fileName = useProjectStore((s) => s.fileName);
  const dirty = useProjectStore((s) => s.dirty);
  const close = useProjectStore((s) => s.close);
  const load = useProjectStore((s) => s.load);
  const view = useUiStore((s) => s.view);
  const go = useUiStore((s) => s.go);
  const setWizard = useUiStore((s) => s.setWizard);
  const installed = useInstall((s) => s.installed);
  const showInstall = canInstall && !installed;

  const closeProject = () => {
    if (dirty && !confirm('You have unsaved changes. Close anyway? (An autosave copy is kept.)')) return;
    close();
  };
  const trySample = () => {
    if (project && dirty && !confirm('You have unsaved changes. Continue anyway? (An autosave copy is kept.)')) return;
    load(sampleSchool(), { fileName: null, handle: null, dirty: true });
  };
  const toFeatures = () => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });

  const version = project?.versions.find((v) => v.id === project.activeVersionId);
  const badge = !version
    ? { text: 'No timetable yet', cls: 'bg-slate-100 text-slate-600' }
    : version.status === 'approved'
      ? { text: 'Approved', cls: 'bg-emerald-100 text-emerald-800' }
      : { text: 'Draft', cls: 'bg-amber-100 text-amber-800' };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-3 py-2 md:px-4">
        <button
          className="flex shrink-0 items-center gap-2 font-bold text-teal-800"
          onClick={() => (project ? go('school') : window.scrollTo({ top: 0, behavior: 'smooth' }))}
          title={project ? 'Go to setup' : 'Back to top'}
        >
          <img src={logo} alt="" className="h-8 w-8" />
          <span className={project ? 'hidden lg:inline' : 'whitespace-nowrap'}>{project ? 'Timetable' : 'School Timetable'}</span>
        </button>

        {project ? (
          <>
            <div className="min-w-0 border-l border-slate-200 pl-3">
              <p className="truncate text-sm font-semibold leading-tight" data-testid="school-title">
                {project.institute.name || 'Untitled school'}
              </p>
              <p className="flex items-center gap-1.5 truncate text-xs leading-tight text-slate-500" data-testid="file-status">
                {fileName ?? 'Not saved yet'}
                {dirty && <span className="text-amber-700">• unsaved changes</span>}
              </p>
            </div>
            <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline ${badge.cls}`} data-testid="version-badge">
              {badge.text}
            </span>

            <nav className="mx-auto hidden items-center gap-1 rounded-xl bg-slate-100 p-1 md:flex" aria-label="Quick links">
              {QUICK.map((q) => {
                const active = q.match(view);
                return (
                  <button
                    key={q.label}
                    onClick={() => go(q.view)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      active ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon name={q.icon} className="h-4 w-4" />
                    {q.label}
                  </button>
                );
              })}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
              <button className="btn btn-primary" onClick={() => save()} title="Save (Ctrl+S)" data-testid="header-save">
                <Icon name="save" className="h-4 w-4" />
                <span className="hidden sm:inline">Save</span>
                {dirty && <span className="h-2 w-2 rounded-full bg-amber-300" aria-label="unsaved changes" />}
              </button>
              <Dropdown label="File" icon="menu" testId="file-menu">
                {(done) => (
                  <>
                    <div className="md:hidden">
                      {QUICK.map((q) => (
                        <MenuItem key={q.label} icon={q.icon} onClick={() => (done(), go(q.view))}>
                          {q.label}
                        </MenuItem>
                      ))}
                      <Divider />
                    </div>
                    <MenuItem icon="plus" onClick={() => (done(), setWizard(true))}>
                      New school…
                    </MenuItem>
                    <MenuItem icon="folder" hint="Ctrl+O" onClick={() => (done(), open())}>
                      Open…
                    </MenuItem>
                    {supportsFileHandles() && (
                      <MenuItem icon="save" hint="Ctrl+Shift+S" onClick={() => (done(), save(true))}>
                        Save as…
                      </MenuItem>
                    )}
                    <MenuItem icon="sparkle" onClick={() => (done(), trySample())}>
                      Open the sample school
                    </MenuItem>
                    <Divider />
                    {showInstall && (
                      <MenuItem icon="download" onClick={() => (done(), void installApp())}>
                        Install app
                      </MenuItem>
                    )}
                    <MenuItem icon="github" href={REPO}>
                      Source code &amp; feedback
                    </MenuItem>
                    <Divider />
                    <MenuItem icon="close" onClick={() => (done(), closeProject())}>
                      Close project
                    </MenuItem>
                  </>
                )}
              </Dropdown>
            </div>
          </>
        ) : (
          <>
            <nav className="ml-6 hidden items-center gap-1 text-sm font-medium text-slate-600 md:flex" aria-label="Site">
              <button className="rounded-lg px-3 py-1.5 hover:bg-slate-100 hover:text-slate-900" onClick={toFeatures}>
                Features
              </button>
              <button className="rounded-lg px-3 py-1.5 hover:bg-slate-100 hover:text-slate-900" onClick={trySample}>
                Sample school
              </button>
              <a
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-slate-100 hover:text-slate-900"
                href={REPO}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="github" className="h-4 w-4" /> GitHub
              </a>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <InstallButton className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-teal-800 ring-1 ring-teal-200 hover:bg-teal-50 lg:inline-flex" />
              <button className="btn hidden sm:inline-flex" onClick={open} title="Open (Ctrl+O)">
                <Icon name="folder" className="h-4 w-4" /> Open file
              </button>
              <button
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-teal-700 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
                onClick={() => setWizard(true)}
                data-testid="header-get-started"
              >
                Get started
              </button>
              <div className="md:hidden">
                <Dropdown label="Menu" icon="menu" testId="site-menu">
                  {(done) => (
                    <>
                      <MenuItem icon="grid" onClick={() => (done(), toFeatures())}>
                        Features
                      </MenuItem>
                      <MenuItem icon="sparkle" onClick={() => (done(), trySample())}>
                        Try the sample school
                      </MenuItem>
                      <MenuItem icon="folder" onClick={() => (done(), open())}>
                        Open file…
                      </MenuItem>
                      {showInstall && (
                        <MenuItem icon="download" onClick={() => (done(), void installApp())}>
                          Install app
                        </MenuItem>
                      )}
                      <MenuItem icon="github" href={REPO}>
                        GitHub
                      </MenuItem>
                    </>
                  )}
                </Dropdown>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
