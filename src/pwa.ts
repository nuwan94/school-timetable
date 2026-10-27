import { create } from 'zustand';

/**
 * Install as an app (PWA): a service worker keeps the app working offline,
 * and the browser's install prompt is kept until the user asks for it.
 * The offline single-file build (file://) has neither.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  /** The browser offered an install prompt we can show. */
  prompt: BeforeInstallPromptEvent | null;
  /** Running as the installed app, or just installed. */
  installed: boolean;
  /** The how-to dialog, for browsers without a prompt (iPhone Safari, Firefox). */
  helpOpen: boolean;
  setHelp(open: boolean): void;
}

const standalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const useInstall = create<InstallState>()((set) => ({
  prompt: null,
  installed: standalone(),
  helpOpen: false,
  setHelp: (helpOpen) => set({ helpOpen }),
}));

/** Shows the browser's install prompt, or the how-to when there is none. */
export async function installApp(): Promise<void> {
  const { prompt } = useInstall.getState();
  if (!prompt) {
    useInstall.setState({ helpOpen: true });
    return;
  }
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  useInstall.setState({ prompt: null, installed: outcome === 'accepted' });
}

export const canInstall = !__SINGLE_FILE__;

export function setupPwa(): void {
  if (!canInstall) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    useInstall.setState({ prompt: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => useInstall.setState({ prompt: null, installed: true, helpOpen: false }));
  // Dev builds skip the worker so it never serves stale modules.
  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext)
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        /* no worker: the app still works online */
      });
    });
}
