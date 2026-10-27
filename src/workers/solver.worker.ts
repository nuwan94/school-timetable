import type { Project } from '@/domain/project';
import { generateTimetable, type GenerateOptions } from '@/solver';

/**
 * Runs the solver off the main thread. The solver awaits between batches,
 * which is when a "stop" message gets through.
 */

export type ToWorker = { type: 'start'; project: Project; options: GenerateOptions } | { type: 'stop' };

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};

let stop = false;

ctx.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'stop') {
    stop = true;
    return;
  }
  stop = false;
  generateTimetable(msg.project, msg.options, {
    yieldEvery: 100,
    shouldStop: () => stop,
    onProgress: (p) => ctx.postMessage({ type: 'progress', ...p }),
  }).then(
    (result) => ctx.postMessage({ type: 'done', result }),
    (err: unknown) => ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) }),
  );
};
