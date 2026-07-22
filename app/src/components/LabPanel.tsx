import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FlaskConical, RotateCcw } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { markdownComponents } from '@/components/markdown';
import { CommandChip } from '@/components/CommandChip';
import { useModuleStudy } from '@/lib/useModuleStudy';
import { cn } from '@/lib/utils';
import type { Lab } from '@/types/api';

interface LabPanelProps {
  moduleId: string;
  lab: Lab;
}

/** Lab tab — the chapter's lab walkthrough as a checklist accordion: each
 * numbered step expands to markdown detail plus an optional copyable command
 * chip; completion is learner-owned and persisted. Ends with the chapter's
 * closing reflection prompt. */
export function LabPanel({ moduleId, lab }: LabPanelProps) {
  const [study, mutate] = useModuleStudy(moduleId);
  const doneCount = lab.steps.filter((s) => study.lab.doneSteps[String(s.n)]).length;

  function setStepDone(n: number, done: boolean) {
    mutate((cur) => {
      const doneSteps = { ...cur.lab.doneSteps };
      if (done) doneSteps[String(n)] = true;
      else delete doneSteps[String(n)];
      return { ...cur, lab: { ...cur.lab, doneSteps } };
    });
  }

  function resetLab() {
    mutate((cur) => ({ ...cur, lab: { doneSteps: {}, reflection: '' } }));
  }

  return (
    <div className="book-reader px-4 py-4">
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <FlaskConical className="h-3 w-3" /> Lab
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{lab.summary}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {doneCount} / {lab.steps.length} steps
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
            onClick={resetLab}
            title="Clear step checkmarks and your reflection"
          >
            <RotateCcw className="h-3 w-3" /> Reset lab
          </Button>
        </div>
      </header>

      <Accordion type="multiple" className="w-full">
        {lab.steps.map((step) => {
          const done = Boolean(study.lab.doneSteps[String(step.n)]);
          return (
            <AccordionItem key={step.n} value={`step-${step.n}`}>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={done}
                  onCheckedChange={(v) => setStepDone(step.n, v === true)}
                  aria-label={`Mark step ${step.n} done`}
                  className="ml-1 shrink-0"
                />
                <AccordionTrigger className={cn('flex-1 py-2.5 text-sm', done && 'text-muted-foreground')}>
                  <span className="flex items-baseline gap-2 text-left">
                    <span className="font-mono text-[11px] text-muted-foreground">{step.n}.</span>
                    <span className={cn(done && 'line-through decoration-muted-foreground/40')}>
                      {step.title}
                    </span>
                  </span>
                </AccordionTrigger>
              </div>
              <AccordionContent className="pl-8 pr-1">
                <div className="text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {step.detail}
                  </ReactMarkdown>
                </div>
                {step.command && <CommandChip command={step.command} className="mt-2" />}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* ---- closing reflection ---- */}
      <section className="mt-4 rounded-lg border border-amber-700/25 bg-amber-50/60 px-4 py-3 dark:border-amber-200/20 dark:bg-amber-950/20">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-900/70 dark:text-amber-200/70">
          Before you move on
        </p>
        <div className="mt-1.5 text-sm font-medium">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {lab.closingPrompt}
          </ReactMarkdown>
        </div>
        <Textarea
          value={study.lab.reflection}
          onChange={(e) =>
            mutate((cur) => ({ ...cur, lab: { ...cur.lab, reflection: e.target.value } }))
          }
          placeholder="Your one-sentence answer…"
          className="mt-2 min-h-14 bg-background/70 text-sm"
        />
      </section>
    </div>
  );
}
