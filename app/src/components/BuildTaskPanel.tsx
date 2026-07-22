import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Award, Hammer, Minus, Stamp, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { markdownComponents } from '@/components/markdown';
import { useModuleStudy } from '@/lib/useModuleStudy';
import type { RubricMark } from '@/lib/studyState';
import { cn } from '@/lib/utils';
import type { BuildTask } from '@/types/api';

interface BuildTaskPanelProps {
  moduleId: string;
  buildTask: BuildTask;
}

/** Build Task tab — the chapter's build spec plus an interactive rubric
 * scorecard: tri-state self-assessment per criterion, a computed weighted
 * score, stretch goals, and a "declare attempt scored" verdict that snapshots
 * the scorecard into localStorage history. */
export function BuildTaskPanel({ moduleId, buildTask }: BuildTaskPanelProps) {
  const [study, mutate] = useModuleStudy(moduleId);
  const isCapstone = moduleId === '08';

  const total = buildTask.rubric.reduce((sum, c) => sum + c.weight, 0);
  const score = buildTask.rubric.reduce(
    (sum, c) => (study.build.marks[c.id] === 'pass' ? sum + c.weight : sum),
    0,
  );
  const markedCount = buildTask.rubric.filter((c) => study.build.marks[c.id]).length;

  function setMark(id: string, mark: RubricMark | null) {
    mutate((cur) => {
      const marks = { ...cur.build.marks };
      if (mark) marks[id] = mark;
      else delete marks[id];
      return { ...cur, build: { ...cur.build, marks } };
    });
  }

  function setStretch(index: number, done: boolean) {
    mutate((cur) => {
      const stretch = { ...cur.build.stretch };
      if (done) stretch[String(index)] = true;
      else delete stretch[String(index)];
      return { ...cur, build: { ...cur.build, stretch } };
    });
  }

  function declareAttempt() {
    mutate((cur) => ({
      ...cur,
      build: {
        ...cur.build,
        attempts: cur.build.attempts + 1,
        lastSnapshot: {
          at: new Date().toISOString(),
          score,
          total,
          marks: { ...cur.build.marks },
        },
      },
    }));
  }

  return (
    <div className="book-reader px-4 py-4">
      <header
        className={cn(
          'mb-3 rounded-lg border px-4 py-3',
          isCapstone
            ? 'border-amber-700/30 bg-amber-50/70 dark:border-amber-200/20 dark:bg-amber-950/20'
            : 'border-border bg-card',
        )}
      >
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {isCapstone ? <Award className="h-3 w-3" /> : <Hammer className="h-3 w-3" />}
          {isCapstone ? 'Capstone build task' : 'Build task'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{buildTask.title}</h2>
          {buildTask.gate && (
            <Badge
              variant="outline"
              className="border-amber-700/40 bg-amber-100/70 text-[10px] uppercase tracking-wide text-amber-900"
            >
              Gate — required to pass L3
            </Badge>
          )}
          {isCapstone && (
            <Badge
              variant="outline"
              className="border-amber-700/40 bg-amber-100/70 text-[10px] uppercase tracking-wide text-amber-900"
            >
              Capstone
            </Badge>
          )}
        </div>
      </header>

      {/* ---- brief ---- */}
      <div className="text-sm leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {buildTask.brief}
        </ReactMarkdown>
      </div>

      {/* ---- rubric scorecard ---- */}
      <section className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Self-assessment rubric
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {markedCount} / {buildTask.rubric.length} marked
          </span>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {buildTask.rubric.map((c) => {
            const mark = study.build.marks[c.id] ?? null;
            return (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug">{c.criterion}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    weight {c.weight}
                  </p>
                </div>
                <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
                  <MarkButton
                    active={mark === null}
                    onClick={() => setMark(c.id, null)}
                    title="Unmarked"
                  >
                    <Minus className="h-3 w-3" />
                  </MarkButton>
                  <MarkButton
                    active={mark === 'pass'}
                    activeClass="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400"
                    onClick={() => setMark(c.id, 'pass')}
                    title="Pass"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </MarkButton>
                  <MarkButton
                    active={mark === 'fail'}
                    activeClass="bg-red-600/10 text-red-700 dark:text-red-400"
                    onClick={() => setMark(c.id, 'fail')}
                    title="Fail"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </MarkButton>
                </div>
              </li>
            );
          })}
        </ul>

        {/* ---- computed score + verdict ---- */}
        <div className="mt-2.5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/50 px-3 py-2.5">
          <p className="text-sm">
            Score:{' '}
            <span className="font-semibold tabular-nums">
              {score} / {total}
            </span>{' '}
            <span className="text-[11px] text-muted-foreground">(sum of passed weights)</span>
          </p>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 gap-1.5 text-[11px]"
            onClick={declareAttempt}
            title="Snapshot this scorecard as a scored attempt"
          >
            <Stamp className="h-3 w-3" /> Declare attempt scored
          </Button>
        </div>
        {(study.build.attempts > 0 || study.build.lastSnapshot) && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {study.build.attempts} attempt{study.build.attempts === 1 ? '' : 's'} declared
            {study.build.lastSnapshot && (
              <>
                {' · latest: '}
                <span className="tabular-nums">
                  {study.build.lastSnapshot.score} / {study.build.lastSnapshot.total}
                </span>{' '}
                on {new Date(study.build.lastSnapshot.at).toLocaleString()}
              </>
            )}
          </p>
        )}
      </section>

      {/* ---- stretch goals ---- */}
      {buildTask.stretch.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Stretch goals — optional
          </h3>
          <ul className="space-y-1.5 rounded-lg border border-dashed border-border px-3 py-2.5">
            {buildTask.stretch.map((goal, i) => (
              <li key={i} className="flex items-start gap-2">
                <Checkbox
                  checked={Boolean(study.build.stretch[String(i)])}
                  onCheckedChange={(v) => setStretch(i, v === true)}
                  aria-label={`Stretch goal ${i + 1}`}
                  className="mt-0.5 shrink-0"
                />
                <span
                  className={cn(
                    'text-[13px] leading-snug',
                    study.build.stretch[String(i)] && 'text-muted-foreground line-through decoration-muted-foreground/40',
                  )}
                >
                  {goal}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MarkButton({
  active,
  activeClass = 'bg-accent text-foreground',
  onClick,
  title,
  children,
}: {
  active: boolean;
  activeClass?: string;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        'border-r border-border px-2 py-1.5 text-muted-foreground transition-colors last:border-r-0 hover:bg-accent/60',
        active && activeClass,
      )}
    >
      {children}
    </button>
  );
}
