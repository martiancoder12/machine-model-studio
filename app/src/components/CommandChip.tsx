import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandChipProps {
  command: string;
  className?: string;
}

/** A single shell command rendered as a copyable code chip (click-to-copy
 * with feedback). Used by lab steps and the build task brief. */
export function CommandChip({ command, className }: CommandChipProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // Clipboard API unavailable (permissions, non-secure context) —
      // fall back to selecting nothing; the chip still reads as a command.
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title={copied ? 'Copied' : 'Copy command'}
      className={cn(
        'group inline-flex w-full items-center gap-2 rounded-md border border-border bg-[#221f1c] px-2.5 py-1.5 text-left font-mono text-[11px] text-stone-200 transition-colors hover:border-ring/40',
        className,
      )}
    >
      <Terminal className="h-3 w-3 shrink-0 text-stone-500" />
      <span className="min-w-0 flex-1 truncate">{command}</span>
      {copied ? (
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-sans text-emerald-400">
          <Check className="h-3 w-3" /> copied
        </span>
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-stone-500 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}
