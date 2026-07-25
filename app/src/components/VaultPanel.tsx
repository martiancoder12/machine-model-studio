import { useState } from 'react';
import { Archive, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { loadVault, removeVaultEntry, type VaultEntry } from '@/lib/vault';

function VaultEntryRow({ entry, onDelete }: { entry: VaultEntry; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-md border border-border bg-card">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="flex cursor-pointer items-center gap-2 px-3 py-2"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium">{entry.label}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span className="font-mono">{entry.moduleId}</span>
            <span>·</span>
            <span>{entry.action}</span>
            <span>·</span>
            <span>{new Date(entry.createdAt).toLocaleString()}</span>
            {entry.flags.sanitizers && (
              <Badge variant="outline" className="border-amber-700/40 bg-amber-100 px-1 py-0 text-[9.5px] text-amber-900">
                ASan/UBSan
              </Badge>
            )}
            {!entry.compileOk && (
              <Badge variant="outline" className="border-red-800/30 bg-red-100 px-1 py-0 text-[9.5px] text-red-900">
                compile failed
              </Badge>
            )}
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          title="Delete entry"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2.5">
          {entry.compileDiagnostics.trim() !== '' && (
            <VaultSection label="compile diagnostics" text={entry.compileDiagnostics} tone="text-amber-300" />
          )}
          {entry.artifact !== null && <VaultSection label={`artifact · ${entry.action}`} text={entry.artifact} tone="text-stone-200" />}
          {entry.stdout !== null && entry.stdout !== '' && <VaultSection label="stdout" text={entry.stdout} tone="text-stone-200" />}
          {entry.stderr !== null && entry.stderr !== '' && <VaultSection label="stderr" text={entry.stderr} tone="text-red-300" />}
          {entry.compileOk && (entry.stdout ?? '') === '' && (entry.stderr ?? '') === '' && entry.artifact === null && (
            <p className="text-xs text-muted-foreground">Program ran quietly (no captured output).</p>
          )}
          <p className="text-[10.5px] text-muted-foreground">
            {entry.moduleTitle} · -O{entry.flags.opt}
            {entry.flags.sanitizers ? ' · sanitizers' : ''}
            {entry.exitCode !== null ? ` · exit ${entry.exitCode}` : ''}
          </p>
        </div>
      )}
    </li>
  );
}

function VaultSection({ label, text, tone }: { label: string; text: string; tone: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-64 overflow-auto rounded bg-[#221f1c] px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
        <span className={tone}>{text}</span>
      </pre>
    </div>
  );
}

/** Artifact vault: saved run results (assembly listings, sanitizer reports,
 * stdout captures) kept for later review. */
export function VaultPanel() {
  const [entries, setEntries] = useState<VaultEntry[]>(() => loadVault());

  function handleDelete(id: string) {
    setEntries(removeVaultEntry(id));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Archive className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Vault
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {entries.length === 0 ? 'nothing saved yet' : `${entries.length} saved`}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {entries.length === 0 ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 px-6 text-center">
            <Archive className="h-5 w-5 text-muted-foreground/50" />
            <p className="max-w-60 text-xs leading-relaxed text-muted-foreground">
              Run something, then use “Save to vault” in the output console to keep the
              assembly, sanitizer report, or stdout for later review.
            </p>
          </div>
        ) : (
          <ul className="space-y-2 px-3 py-3">
            {entries.map((e) => (
              <VaultEntryRow key={e.id} entry={e} onDelete={() => handleDelete(e.id)} />
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
