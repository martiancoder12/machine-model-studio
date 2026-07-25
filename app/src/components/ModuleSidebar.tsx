import { BookOpen, Check, ChevronDown, Gauge } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { STATUS_META, STATUS_ORDER, getStatus } from '@/lib/progress';
import { cn } from '@/lib/utils';
import type { Manifest, ManifestModule, ModuleStatus, ProgressMap } from '@/types/api';

interface ModuleSidebarProps {
  manifest: Manifest | null;
  loading: boolean;
  error: string | null;
  activeModuleId: string | null;
  progress: ProgressMap;
  dueRepCount: number;
  onSelectModule: (moduleId: string) => void;
  onCycleStatus: (moduleId: string) => void;
  onSetStatus: (moduleId: string, status: ModuleStatus) => void;
  onOpenDashboard: () => void;
}

const MARKER_STYLES: Record<string, string> = {
  'make-or-break': 'border-amber-700/40 bg-amber-100 text-amber-900',
  'L3 gate': 'border-violet-800/30 bg-violet-100 text-violet-900',
  capstone: 'border-emerald-800/30 bg-emerald-100 text-emerald-900',
};

function StatusDot({
  status,
  onCycle,
  onSet,
}: {
  status: ModuleStatus;
  onCycle: () => void;
  onSet: (s: ModuleStatus) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={`Status: ${STATUS_META[status].label} — click to cycle, right-click/arrow for menu`}
          className="group mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(e) => {
            e.stopPropagation();
            onCycle();
          }}
        >
          <span
            className={cn(
              'h-2.5 w-2.5 rounded-full ring-1 ring-black/10 transition-transform group-hover:scale-125',
              STATUS_META[status].dotClass,
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" className="w-40">
        {STATUS_ORDER.map((s) => (
          <DropdownMenuItem
            key={s}
            onClick={(e) => {
              e.stopPropagation();
              onSet(s);
            }}
            className="gap-2"
          >
            <span className={cn('h-2 w-2 rounded-full', STATUS_META[s].dotClass)} />
            <span className="flex-1">{STATUS_META[s].label}</span>
            {s === status && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModuleRow({
  mod,
  active,
  progress,
  onSelect,
  onCycleStatus,
  onSetStatus,
}: {
  mod: ManifestModule;
  active: boolean;
  progress: ProgressMap;
  onSelect: () => void;
  onCycleStatus: () => void;
  onSetStatus: (s: ModuleStatus) => void;
}) {
  const status = getStatus(progress, mod.id);
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          'flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors',
          active
            ? 'bg-accent text-accent-foreground shadow-xs'
            : 'hover:bg-accent/50 text-foreground/80',
        )}
      >
        <StatusDot status={status} onCycle={onCycleStatus} onSet={onSetStatus} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">{mod.id}</span>
            <span
              className={cn(
                'truncate text-[13px] leading-snug',
                active ? 'font-medium' : 'font-normal',
              )}
            >
              {mod.title}
            </span>
          </div>
          {(mod.marker || mod.level) && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {mod.marker && (
                <Badge
                  variant="outline"
                  className={cn('px-1.5 py-0 text-[10px] font-normal', MARKER_STYLES[mod.marker])}
                >
                  {mod.marker}
                </Badge>
              )}
              {mod.level && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {mod.level}
                </span>
              )}
            </div>
          )}
        </div>
        {active && <ChevronDown className="mt-1 h-3.5 w-3.5 -rotate-90 text-muted-foreground" />}
      </div>
    </li>
  );
}

export function ModuleSidebar(props: ModuleSidebarProps) {
  const { manifest, loading, error } = props;
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2 text-sidebar-foreground">
          <BookOpen className="h-4 w-4" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
            Machine Model Studio
          </span>
        </div>
        {manifest && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {manifest.book} · {manifest.levelRange}
          </p>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="px-2 py-3">
          {loading && <p className="px-2 text-xs text-muted-foreground">Loading modules…</p>}
          {error && (
            <p className="px-2 text-xs text-destructive">
              Could not load the manifest: {error}. Is the backend running on port 4747?
            </p>
          )}
          {manifest && (
            <ul className="space-y-0.5">
              {manifest.modules.map((mod) => (
                <ModuleRow
                  key={mod.id}
                  mod={mod}
                  active={mod.id === props.activeModuleId}
                  progress={props.progress}
                  onSelect={() => props.onSelectModule(mod.id)}
                  onCycleStatus={() => props.onCycleStatus(mod.id)}
                  onSetStatus={(s) => props.onSetStatus(mod.id, s)}
                />
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
      <div className="border-t border-sidebar-border px-3 py-2.5">
        <button
          type="button"
          onClick={props.onOpenDashboard}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-[11px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          <Gauge className="h-3.5 w-3.5" />
          Dashboard
          {props.dueRepCount > 0 && (
            <Badge className="ml-auto border-amber-700/40 bg-amber-100 px-1.5 py-0 text-[10px] text-amber-900" variant="outline">
              {props.dueRepCount} rep{props.dueRepCount === 1 ? '' : 's'} due
            </Badge>
          )}
        </button>
        <p className="mt-1 px-1.5 text-[10px] leading-relaxed text-muted-foreground">
          Progress is stored locally in your browser.
        </p>
      </div>
    </div>
  );
}
