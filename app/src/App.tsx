import { useCallback, useEffect, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Badge } from '@/components/ui/badge';
import { BookReader } from '@/components/BookReader';
import { DashboardDialog } from '@/components/DashboardDialog';
import { ModuleSidebar } from '@/components/ModuleSidebar';
import { StudyPanel } from '@/components/StudyPanel';
import { api, isMockMode, isStaticMode } from '@/lib/api';
import {
  cycleStatus,
  getStatus,
  loadProgress,
  saveProgress,
  setStatus,
} from '@/lib/progress';
import {
  clearReps,
  completeRep,
  dueReps,
  loadReps,
  saveReps,
  scheduleReps,
  type RepsMap,
} from '@/lib/reps';
import type { Manifest, ModuleStatus, ProgressMap } from '@/types/api';

/** Keep the rep ladder in step with progress: a module enters the ladder
 * when it reaches "done" and leaves it if it is un-marked. */
function syncRepsWithProgress(reps: RepsMap, progress: ProgressMap): RepsMap {
  let next = reps;
  for (const moduleId of Object.keys(progress)) {
    const done = getStatus(progress, moduleId) === 'done';
    if (done && !next[moduleId]) next = scheduleReps(next, moduleId);
    if (!done && next[moduleId]) next = clearReps(next, moduleId);
  }
  return next;
}

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(true);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressMap>(() => loadProgress());
  const [reps, setReps] = useState<RepsMap>(() => syncRepsWithProgress(loadReps(), loadProgress()));
  const [dashboardOpen, setDashboardOpen] = useState(false);
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
    setReps((prev) => {
      const synced = syncRepsWithProgress(prev, next);
      if (synced !== prev) saveReps(synced);
      return synced;
    });
  }, []);

  const handleCompleteRep = useCallback((moduleId: string) => {
    setReps((prev) => {
      const next = completeRep(prev, moduleId);
      if (next !== prev) saveReps(next);
      return next;
    });
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

  const activeModuleTitle =
    manifest?.modules.find((m) => m.id === activeModuleId)?.title ?? null;
  const dueRepCount = dueReps(reps).length;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Group orientation="horizontal" className="flex-1">
        {/* Sizes are percentage STRINGS: in react-resizable-panels v4,
            bare numbers mean pixels, not percent. */}
        <Panel defaultSize="18%" minSize="14%" maxSize="30%">
          <ModuleSidebar
            manifest={manifest}
            loading={manifestLoading}
            error={manifestError}
            activeModuleId={activeModuleId}
            progress={progress}
            dueRepCount={dueRepCount}
            onSelectModule={handleSelectModule}
            onCycleStatus={handleCycleStatus}
            onSetStatus={handleSetStatus}
            onOpenDashboard={() => setDashboardOpen(true)}
          />
        </Panel>

        <Separator className="w-1 bg-border transition-colors hover:bg-ring/50" />

        <Panel defaultSize="47%" minSize="30%">
          <BookReader moduleId={activeModuleId} />
        </Panel>

        <Separator className="w-1 bg-border transition-colors hover:bg-ring/50" />

        <Panel defaultSize="35%" minSize="24%">
          <StudyPanel
            moduleId={activeModuleId}
            moduleTitle={activeModuleTitle}
            onRan={activeModuleId ? () => handleRan(activeModuleId) : undefined}
          />
        </Panel>
      </Group>

      <DashboardDialog
        open={dashboardOpen}
        onOpenChange={setDashboardOpen}
        manifest={manifest}
        progress={progress}
        reps={reps}
        onCompleteRep={handleCompleteRep}
        onJumpToModule={handleSelectModule}
      />

      {isStaticMode() && (
        <div className="pointer-events-none fixed bottom-3 left-3 z-50">
          <Badge variant="outline" className="pointer-events-auto border-sky-700/40 bg-sky-100 text-sky-900">
            static deployment — real book content · compilation simulated
          </Badge>
        </div>
      )}

      {!isStaticMode() && mockMode && (
        <div className="pointer-events-none fixed bottom-3 left-3 z-50">
          <Badge variant="outline" className="pointer-events-auto border-amber-700/40 bg-amber-100 text-amber-900">
            mock API — backend offline (?mock=1)
          </Badge>
        </div>
      )}
    </div>
  );
}
