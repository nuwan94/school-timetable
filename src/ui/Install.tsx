import { useEffect } from 'react';
import { canInstall, installApp, useInstall } from '@/pwa';
import { Icon } from './Icon';

/** "Install app": the browser's prompt where there is one, otherwise the how-to. Hidden once installed. */
export function InstallButton({ className, label = 'Install app' }: { className: string; label?: string }) {
  const installed = useInstall((s) => s.installed);
  if (!canInstall || installed) return null;
  return (
    <button className={className} onClick={() => void installApp()} data-testid="install-app">
      <Icon name="download" className="h-4 w-4" />
      {label}
    </button>
  );
}

function platform(): 'ios' | 'android' | 'firefox' | 'desktop' {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/firefox/i.test(ua)) return 'firefox';
  return 'desktop';
}

const STEPS: Record<ReturnType<typeof platform>, string[]> = {
  ios: ['Open this page in Safari.', 'Tap the Share button.', 'Choose “Add to Home Screen”, then “Add”.'],
  android: ['Open the browser menu (⋮).', 'Choose “Install app” or “Add to Home screen”.', 'Confirm with “Install”.'],
  firefox: [
    'Firefox cannot install web apps on a computer.',
    'Open this page in Chrome or Edge instead.',
    'Click the install icon in the address bar.',
  ],
  desktop: [
    'Click the install icon at the right of the address bar.',
    'Or open the browser menu and choose “Install School Timetable”.',
    'It then opens from the Start menu or desktop, even without internet.',
  ],
};

/** How to install when the browser gives no prompt, with the pendrive copy as a fallback. */
export function InstallHelp() {
  const open = useInstall((s) => s.helpOpen);
  const setHelp = useInstall((s) => s.setHelp);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setHelp(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setHelp]);
  if (!open) return null;
  const steps = STEPS[platform()];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setHelp(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        data-testid="install-help"
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="h-1.5 bg-gradient-to-r from-teal-600 via-emerald-500 to-amber-400" />
        <button
          onClick={() => setHelp(false)}
          aria-label="Close"
          className="absolute right-3 top-4 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
        <div className="px-6 pb-6 pt-6">
          <h2 id="install-title" className="text-xl font-bold">
            Install School Timetable
          </h2>
          <p className="mt-1 text-sm text-slate-600">It opens like any other app and keeps working without internet.</p>
          <ol className="mt-5 space-y-3">
            {steps.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">
                  {i + 1}
                </span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-800">School computer with no internet or no install rights?</p>
            <p className="mt-1">
              Copy the{' '}
              <a className="font-medium text-teal-700 underline" href="./timetable-offline.html" download>
                single-file version
              </a>{' '}
              to a pendrive and open it in Chrome or Edge.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
