import { useEffect, useMemo, useState } from 'react';
import { Check, CircleDashed, Gauge, GraduationCap, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import { getStatus } from '@/lib/progress';
import { loadStudyState } from '@/lib/studyState';
import { dueLabel, dueReps, isMastered, repStageLabel, type RepsMap } from '@/lib/reps';
import { cn } from '@/lib/utils';
import type { Manifest, ProgressMap, StudyContent } from '@/types/api';

const GATE_MODULE = '07';
// Modules whose mastery the L3 gate certifies (everything before the gate,
// excluding front/back matter 00/09).
const CORE_MODULES = ['01', '02', '03', '04', '05', '06'];

interface DashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manifest: Manifest | null;
  progress: ProgressMap;
  reps: RepsMap;
  onCompleteRep: (moduleId: string) => void;
  onJumpToModule: (moduleId: string) => void;
}

interface GateCheck {
  label: string;
  detail: string;
  pass: boolean;
}

function GateRow({ check }: { check: GateCheck }) {
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      {check.pass ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
      )}
      <div className="min-w-0">
        <div className={cn('text-[12.5px]', check.pass ? 'text-foreground' : 'text-foreground/80')}>
          {check.label}
        </div>
        <div className="text-[11px] text-muted-foreground">{check.detail}</div>
      </div>
    </li>
  );
}

export function DashboardDialog({
  open,
  onOpenChange,
  manifest,
  progress,
  reps,
  onCompleteRep,
  onJumpToModule,
}: DashboardDialogProps) {
  const [gateStudy, setGateStudy] = useState<StudyContent | null>(null);

  // Fetch the gate module's study content (step count, rubric weights) when
  // the dashboard opens — needed to score the lab/rubric checks precisely.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .getStudy(GATE_MODULE)
      .then((c) => {
        if (!cancelled) setGateStudy(c);
      })
      .catch(() => {
        if (!cancelled) setGateStudy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const study = useMemo(() => (open ? loadStudyState() : {}), [open]);

  const checks: GateCheck[] = useMemo(() => {
    const doneCore = CORE_MODULES.filter((id) => getStatus(progress, id) === 'done');
    const lab = study[GATE_MODULE]?.lab;
    const build = study[GATE_MODULE]?.build;
    const totalSteps = gateStudy?.lab.steps.length ?? 0;
    const doneSteps = lab ? Object.keys(lab.doneSteps).length : 0;
    const reflection = (lab?.reflection ?? '').trim().length > 0;
    const snap = build?.lastSnapshot ?? null;

    return [
      {
        label: 'Core modules I.1–I.6 done',
        detail: `${doneCore.length} of ${CORE_MODULES.length} marked done`,
        pass: doneCore.length === CORE_MODULES.length,
      },
      {
        label: 'Gate lab walkthrough completed',
        detail: totalSteps > 0 ? `${doneSteps} of ${totalSteps} steps` : 'no steps checked off yet',
        pass: totalSteps > 0 && doneSteps === totalSteps,
      },
      {
        label: 'Gate lab reflection written',
        detail: reflection ? 'stated in your own words' : 'the closing rule, in your own words',
        pass: reflection,
      },
      {
        label: 'Gate build task at full marks',
        detail: snap ? `best snapshot ${snap.score}/${snap.total}` : 'no rubric snapshot yet',
        pass: snap !== null && snap.score === snap.total && snap.total > 0,
      },
    ];
  }, [progress, study, gateStudy]);

  const gateReady = checks.every((c) => c.pass);
  const due = dueReps(reps);
  const scheduled = Object.entries(reps).sort(([, a], [, b]) => a.dueAt.localeCompare(b.dueAt));

  function titleFor(moduleId: string): string {
    return manifest?.modules.find((m) => m.id === moduleId)?.title ?? `Module ${moduleId}`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Studio dashboard
          </DialogTitle>
          <DialogDescription>L3 gate readiness and the reps schedule.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-3">
          {/* ---- L3 gate ---- */}
          <section>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                L3 gate
              </h3>
              {gateReady ? (
                <Badge className="ml-auto border-emerald-800/30 bg-emerald-100 text-emerald-900" variant="outline">
                  ready
                </Badge>
              ) : (
                <Badge className="ml-auto" variant="outline">
                  {checks.filter((c) => c.pass).length}/{checks.length}
                </Badge>
              )}
            </div>
            <ul className="mt-1 divide-y divide-border/60">
              {checks.map((c) => (
                <GateRow key={c.label} check={c} />
              ))}
            </ul>
            {gateReady && (
              <p className="mt-1 rounded-md border border-emerald-800/20 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
                Everything the gate asks for is in place — go take the I.8 capstone.
              </p>
            )}
          </section>

          {/* ---- Reps ---- */}
          <section className="mt-5">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Reps
              </h3>
              {due.length > 0 && (
                <Badge className="ml-auto border-amber-700/40 bg-amber-100 text-amber-900" variant="outline">
                  {due.length} due
                </Badge>
              )}
            </div>

            {scheduled.length === 0 ? (
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                No reps scheduled yet. Mark a module <span className="font-medium text-foreground">done</span> and
                it enters the rep ladder — reviews due after 1, 3, 7, 16, then 35 days.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {scheduled.map(([moduleId, rep]) => {
                  const overdue = due.includes(moduleId);
                  const mastered = isMastered(rep);
                  return (
                    <li
                      key={moduleId}
                      className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className="block max-w-full truncate text-left text-[12.5px] font-medium hover:underline"
                          onClick={() => {
                            onJumpToModule(moduleId);
                            onOpenChange(false);
                          }}
                        >
                          {titleFor(moduleId)}
                        </button>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {repStageLabel(rep)} · {dueLabel(rep)}
                        </div>
                      </div>
                      {overdue && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 border-amber-700/40 text-[11px] text-amber-900 hover:bg-amber-100"
                          onClick={() => onCompleteRep(moduleId)}
                        >
                          Rep done
                        </Button>
                      )}
                      {mastered && (
                        <Badge variant="outline" className="shrink-0 border-emerald-800/30 bg-emerald-100 text-[10px] text-emerald-900">
                          mastered
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
