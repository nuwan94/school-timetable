import logo from '@/assets/logo.svg';
import { useFileCommands } from '@/features/files/useFileCommands';
import { SetupLayout } from '@/features/setup/SetupLayout';
import { StartScreen } from '@/features/start/StartScreen';
import { supportsFileHandles } from '@/io/projectFile';
import { useProjectStore } from '@/store/projectStore';
import { useAutosave } from '@/store/useAutosave';

export function App() {
  useAutosave();
  const { open, save, error, clearError } = useFileCommands();
  const project = useProjectStore((s) => s.project);
  const fileName = useProjectStore((s) => s.fileName);
  const dirty = useProjectStore((s) => s.dirty);
  const close = useProjectStore((s) => s.close);

  const closeProject = () => {
    if (dirty && !confirm('You have unsaved changes. Close anyway? (An autosave copy is kept.)')) return;
    close();
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="flex items-center gap-2 font-bold text-teal-800">
          <img src={logo} alt="" className="h-7 w-7" />
          Timetable
        </span>
        {project && (
          <span className="min-w-0 truncate text-sm text-slate-600" data-testid="file-status">
            {fileName ?? 'Not saved yet'}
            {dirty && <span className="ml-1.5 text-amber-700">• unsaved changes</span>}
          </span>
        )}
        {project && (
          <nav className="ml-auto flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => void save()} title="Ctrl+S">
              Save
            </button>
            {supportsFileHandles() && (
              <button className="btn" onClick={() => void save(true)} title="Ctrl+Shift+S">
                Save as…
              </button>
            )}
            <button className="btn" onClick={() => void open()} title="Ctrl+O">
              Open…
            </button>
            <button className="btn" onClick={closeProject}>
              Close
            </button>
          </nav>
        )}
      </header>

      {error && (
        <div role="alert" className="border-b border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{error.message}</p>
              {error.details.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {error.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
            <button className="btn" onClick={clearError}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex-1">{project ? <SetupLayout /> : <StartScreen onOpen={() => void open()} />}</div>
    </div>
  );
}
