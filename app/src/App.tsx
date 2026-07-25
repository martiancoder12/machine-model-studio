import { useCallback, useEffect, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Badge } from '@/components/ui/badge';
import { BookReader } from '@/components/BookReader';
import { ModuleSidebar } from '@/components/ModuleSidebar';
import { StudyPanel } from '@/components/StudyPanel';
import { api, isMockMode } from '@/lib/api';
import {
  cycleStatus,
  getStatus,
  loadProgress,
  saveProgress,
  setStatus,
} from '@/lib/progress';
import type { Manifest, ModuleStatus, ProgressMap } from '@/types/api';

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(true);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressMap>(() => loadProgress());
  const [mockMode, setMockMode] = useState(false);

  useEffect(() => {
    api
      .getManifest()
      .then((m) => {
        setManifest(m);
        setMockMode(isMockMode());
        // Open the first real chapter (skip front matter) on first launch.
        setActiveModuleId((prev) => prev ?? m.modules[1]?.id ?? m.modules[0]?.id ?? null);
      })
      .catch((e: unknown) => {
        setManifestError(e instanceof Error ? e.message : 'failed to load manifest');
      })
      .finally(() => setManifestLoading(false));
  }, []);

  const updateProgress = useCallback((next: ProgressMap) => {
    setProgress(next);
    saveProgress(next);
  }, []);

  const handleSelectModule = useCallback(
    (moduleId: string) => {
      setActiveModuleId(moduleId);
      // Opening a module implicitly moves it from not-started → reading.
      setProgress((prev) => {
        if (getStatus(prev, moduleId) !== 'not-started') return prev;
        const next = setStatus(prev, moduleId, 'reading');
        saveProgress(next);
        return next;
      });
    },
    [],
  );

  const handleCycleStatus = useCallback(
    (moduleId: string) => updateProgress(cycleStatus(progress, moduleId)),
    [progress, updateProgress],
  );

  const handleSetStatus = useCallback(
    (moduleId: string, status: ModuleStatus) => updateProgress(setStatus(progress, moduleId, status)),
    [progress, updateProgress],
  );

  // Running code auto-promotes a module to "working" — never demotes
  // (a module already "done" stays done).
  const handleRan = useCallback(
    (moduleId: string) => {
      setProgress((prev) => {
        const current = getStatus(prev, moduleId);
        if (current === 'working' || current === 'done') return prev;
        const next = setStatus(prev, moduleId, 'working');
        saveProgress(next);
        return next;
      });
    },
    [],
  );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Group orientation="horizontal" className="flex-1">
        <Panel defaultSize={18} minSize={14} maxSize={30}>
          <ModuleSidebar
            manifest={manifest}
            loading={manifestLoading}
            error={manifestError}
            activeModuleId={activeModuleId}
            progress={progress}
            onSelectModule={handleSelectModule}
            onCycleStatus={handleCycleStatus}
            onSetStatus={handleSetStatus}
          />
        </Panel>

        <Separator className="w-px bg-border transition-colors hover:bg-ring/40" />

        <Panel defaultSize={47} minSize={30}>
          <BookReader moduleId={activeModuleId} />
        </Panel>

        <Separator className="w-px bg-border transition-colors hover:bg-ring/40" />

        <Panel defaultSize={35} minSize={24}>
          <StudyPanel
            moduleId={activeModuleId}
            onRan={activeModuleId ? () => handleRan(activeModuleId) : undefined}
          />
        </Panel>
      </Group>

      {mockMode && (
        <div className="pointer-events-none fixed bottom-3 left-3 z-50">
          <Badge variant="outline" className="pointer-events-auto border-amber-700/40 bg-amber-100 text-amber-900">
            mock API — backend offline (?mock=1)
          </Badge>
        </div>
      )}
    </div>
  );
}
