import { AppHeader } from '@/ui/AppHeader';
import { InstallHelp } from '@/ui/Install';
import { useFileCommands } from '@/features/files/useFileCommands';
import { SetupLayout } from '@/features/setup/SetupLayout';
import { StartScreen } from '@/features/start/StartScreen';
import { StartWizard } from '@/features/start/StartWizard';
import { useProjectStore } from '@/store/projectStore';
import { useAutosave } from '@/store/useAutosave';

export function App() {
  useAutosave();
  const { open, save, error, clearError } = useFileCommands();
  const project = useProjectStore((s) => s.project);

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader open={() => void open()} save={(saveAs) => void save(saveAs)} />

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

      <div className="flex-1">{project ? <SetupLayout /> : <StartScreen />}</div>
      <StartWizard onOpen={() => void open()} />
      <InstallHelp />
    </div>
  );
}
