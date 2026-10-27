import type { Project } from '@/domain/project';
// Inline so the single-file offline build carries the worker inside the HTML.
import SolverWorker from '@/workers/solver.worker?worker&inline';
import type { ToWorker } from '@/workers/solver.worker';
import type { GenerateOptions, GenerateResult } from './index';

export interface Progress {
  placed: number;
  total: number;
  iteration: number;
  phase?: 'placing' | 'improving';
}

export interface SolverRun {
  result: Promise<GenerateResult>;
  stop(): void;
}

type FromWorker =
  | ({ type: 'progress' } & Progress)
  | { type: 'done'; result: GenerateResult }
  | { type: 'error'; message: string };

/** Starts a solver run in a fresh worker; the worker is ended when the run finishes. */
export function runSolver(project: Project, options: GenerateOptions, onProgress: (p: Progress) => void): SolverRun {
  const worker = new SolverWorker();
  const send = (m: ToWorker) => worker.postMessage(m);
  const result = new Promise<GenerateResult>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m);
      else {
        worker.terminate();
        if (m.type === 'done') resolve(m.result);
        else reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'The timetable worker failed to start.'));
    };
  });
  send({ type: 'start', project, options });
  return { result, stop: () => send({ type: 'stop' }) };
}
