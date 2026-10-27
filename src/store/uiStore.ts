import { create } from 'zustand';
import type { StepId } from '@/features/setup/steps';

export type BuildId =
  'check' | 'rules' | 'generate' | 'edit' | 'print' | 'today' | 'ledger' | 'changes' | 'calendar' | 'exams' | 'returns' | 'workload' | 'duties';
export type View = StepId | BuildId;

const VIEW_KEY = 'timetable.view';

function initialView(): View {
  try {
    return (localStorage.getItem(VIEW_KEY) as View | null) ?? 'school';
  } catch {
    return 'school';
  }
}

/** UI state shared by the header and the screens: the open screen and the start wizard. */
export interface UiState {
  view: View;
  go(view: View): void;
  wizardOpen: boolean;
  /** Which page the wizard opens on. */
  wizardStart: 'choose' | 'example';
  setWizard(open: boolean, start?: 'choose' | 'example'): void;
}

export const useUiStore = create<UiState>()((set) => ({
  view: initialView(),
  go: (view) => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* storage unavailable: just don't remember the tab */
    }
    set({ view });
    window.scrollTo({ top: 0 });
  },
  wizardOpen: false,
  wizardStart: 'choose',
  setWizard: (wizardOpen, wizardStart = 'choose') => set({ wizardOpen, wizardStart }),
}));
