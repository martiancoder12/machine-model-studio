import { useEffect, useState } from 'react';
import { BookOpenCheck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BuildTaskPanel } from '@/components/BuildTaskPanel';
import { LabPanel } from '@/components/LabPanel';
import { NotesPanel } from '@/components/NotesPanel';
import { VaultPanel } from '@/components/VaultPanel';
import { WorkspacePanel } from '@/components/WorkspacePanel';
import { api, ApiError } from '@/lib/api';
import type { StudyContent } from '@/types/api';

interface StudyPanelProps {
  moduleId: string | null;
  moduleTitle: string | null;
  /** Called when a run completes — used to auto-promote module progress. */
  onRan?: () => void;
}

type StudyLoad =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'empty' } // 404 — no guided content for this section (modules 00/09)
  | { kind: 'error'; message: string }
  | { kind: 'ready'; content: StudyContent };

/** Right region of the study shell: Workspace (editor/run, unchanged) plus
 * the Phase 2 guided-content tabs — Lab walkthrough and Build Task rubric. */
export function StudyPanel({ moduleId, moduleTitle, onRan }: StudyPanelProps) {
  const [study, setStudy] = useState<StudyLoad>({ kind: 'idle' });

  useEffect(() => {
    if (!moduleId) {
      setStudy({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setStudy({ kind: 'loading' });
    api
      .getStudy(moduleId)
      .then((content) => {
        if (!cancelled) setStudy({ kind: 'ready', content });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setStudy({ kind: 'empty' });
        else setStudy({ kind: 'error', message: e instanceof Error ? e.message : 'failed to load study content' });
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  return (
    <Tabs defaultValue="workspace" className="h-full gap-0">
      <div className="border-b border-border bg-card px-2 pt-1.5">
        <TabsList className="h-8">
          <TabsTrigger value="workspace" className="px-3 text-[11px]">
            Workspace
          </TabsTrigger>
          <TabsTrigger value="lab" className="px-3 text-[11px]">
            Lab
          </TabsTrigger>
          <TabsTrigger value="build" className="px-3 text-[11px]">
            Build Task
          </TabsTrigger>
          <TabsTrigger value="notes" className="px-3 text-[11px]">
            Notes
          </TabsTrigger>
          <TabsTrigger value="vault" className="px-3 text-[11px]">
            Vault
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Keep the workspace mounted across tab switches so the editor and
          console never lose state; Radix unmounts inactive content, so the
          workspace tab gets forceMount + hidden styling instead. */}
      <TabsContent value="workspace" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
        <WorkspacePanel moduleId={moduleId} moduleTitle={moduleTitle} onRan={onRan} />
      </TabsContent>

      <TabsContent value="lab" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          {moduleId && study.kind === 'ready' ? (
            <LabPanel key={moduleId} moduleId={moduleId} lab={study.content.lab} />
          ) : (
            <StudyPlaceholder moduleId={moduleId} study={study} which="lab" />
          )}
        </ScrollArea>
      </TabsContent>

      <TabsContent value="build" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          {moduleId && study.kind === 'ready' ? (
            <BuildTaskPanel key={moduleId} moduleId={moduleId} buildTask={study.content.buildTask} />
          ) : (
            <StudyPlaceholder moduleId={moduleId} study={study} which="build task" />
          )}
        </ScrollArea>
      </TabsContent>

      {/* Notes stays mounted too so an in-flight debounced save and the
          textarea's undo history survive tab switches. */}
      <TabsContent value="notes" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
        {moduleId ? (
          <NotesPanel key={moduleId} moduleId={moduleId} />
        ) : (
          <PlaceholderShell>Select a module to take notes.</PlaceholderShell>
        )}
      </TabsContent>

      <TabsContent value="vault" className="min-h-0 flex-1">
        <VaultPanel />
      </TabsContent>
    </Tabs>
  );
}

function StudyPlaceholder({
  moduleId,
  study,
  which,
}: {
  moduleId: string | null;
  study: StudyLoad;
  which: string;
}) {
  if (!moduleId) {
    return <PlaceholderShell>Select a module to see its {which}.</PlaceholderShell>;
  }
  if (study.kind === 'loading') {
    return <PlaceholderShell>Loading guided content…</PlaceholderShell>;
  }
  if (study.kind === 'error') {
    return (
      <div className="m-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        Could not load the {which}: {study.message} — is the backend running on port 4747?
      </div>
    );
  }
  // 'empty' (404) and 'idle': calm no-content state, not an error.
  return (
    <PlaceholderShell>No guided content for this section yet — the book chapter above is the source of truth.</PlaceholderShell>
  );
}

function PlaceholderShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-6 text-center">
      <BookOpenCheck className="h-5 w-5 text-muted-foreground/50" />
      <p className="max-w-56 text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
