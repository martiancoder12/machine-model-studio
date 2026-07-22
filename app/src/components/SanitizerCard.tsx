import { Bug, ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { SanitizerReport } from '@/lib/sanitizer';

interface SanitizerCardProps {
  report: SanitizerReport;
  raw: string;
}

/** Structured summary of an AddressSanitizer / UBSan report, rendered above
 * the raw output in the console. An aid to reading the report (the book
 * teaches report-reading) — the full raw text stays one click away. */
export function SanitizerCard({ report, raw }: SanitizerCardProps) {
  return (
    <Collapsible>
      <div className="mb-2 rounded-md border border-red-400/25 bg-red-950/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-red-300">
            <Bug className="h-3.5 w-3.5" />
            {report.kind} report
          </span>
          {report.errorClass && (
            <span className="rounded-sm bg-red-400/15 px-1.5 py-0.5 font-mono text-[11px] text-red-200">
              {report.errorClass}
            </span>
          )}
          {report.location && (
            <span className="font-mono text-[11px] text-stone-300">
              at <span className="text-amber-200">{report.location}</span>
            </span>
          )}
          <CollapsibleTrigger
            className={cn(
              'group ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wide text-stone-500',
              'transition-colors hover:text-stone-300',
            )}
          >
            full report
            <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-stone-400">
          The sanitizer stopped your program at the first memory/UB fault. Read the report top-down:
          the error class, then the top stack frame — that line is where the machine said no.
        </p>
        <CollapsibleContent>
          <pre className="console-text mt-2 max-h-64 overflow-auto rounded-sm border border-white/10 bg-black/30 p-2 text-red-300/90">
            {raw}
          </pre>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
