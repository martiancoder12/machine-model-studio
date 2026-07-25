import { useState } from 'react';
import { Archive, TerminalSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SanitizerCard } from '@/components/SanitizerCard';
import { parseSanitizerReport } from '@/lib/sanitizer';
import { addVaultEntry } from '@/lib/vault';
import type { RunResult } from '@/types/api';

interface OutputConsoleProps {
  result: RunResult | null;
  running: boolean;
  error: string | null;
  moduleId: string | null;
  moduleTitle: string | null;
  flags: { opt: string; sanitizers: boolean } | null;
}

function Section({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <div className="console-section">
      <div className={`console-label ${tone}`}>{label}</div>
      <pre className={`console-text ${tone}`}>{text}</pre>
    </div>
  );
}

export function OutputConsole({ result, running, error, moduleId, moduleTitle, flags }: OutputConsoleProps) {
  const isArtifactAction =
    result !== null && (result.action === 'preprocess' || result.action === 'assembly' || result.action === 'object');
  const sanitizerReport = result ? parseSanitizerReport(result.stderr) : null;

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const [savedTick, setSavedTick] = useState(false);

  function defaultLabel(): string {
    if (!result) return '';
    const mod = moduleId ? `I.${moduleId}` : 'run';
    return `${mod} · ${result.action}`;
  }

  function handleSave() {
    if (!result || !moduleId) return;
    addVaultEntry(result, {
      moduleId,
      moduleTitle: moduleTitle ?? moduleId,
      label: saveLabel.trim() || defaultLabel(),
      flags: flags ?? { opt: '0', sanitizers: false },
    });
    setSaveOpen(false);
    setSaveLabel('');
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 2000);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-border bg-[#221f1c]">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5">
        <TerminalSquare className="h-3.5 w-3.5 text-stone-400" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">
          Output
        </span>
        {running && <span className="text-[11px] text-amber-300/90">running…</span>}
        {result && !running && (
          <span className="text-[11px] text-stone-500">
            {result.compileOk
              ? result.exitCode !== null
                ? `exit ${result.exitCode}${result.timedOut ? ' · timed out' : ''} · ${result.durationMs} ms`
                : `${result.action} · ${result.durationMs} ms`
              : `compile failed · ${result.durationMs} ms`}
          </span>
        )}
        {result && !running && moduleId && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 gap-1 px-2 text-[11px] text-stone-400 hover:bg-white/10 hover:text-stone-200"
            title="Keep this result in the vault"
            onClick={() => {
              setSaveLabel(defaultLabel());
              setSaveOpen(true);
            }}
          >
            <Archive className="h-3 w-3" />
            {savedTick ? 'Saved ✓' : 'Save to vault'}
          </Button>
        )}
        {!(result && !running && moduleId) && result && !running && <span className="ml-auto" />}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 py-2.5">
          {error && (
            <div className="console-section">
              <div className="console-label text-red-400">request error</div>
              <pre className="console-text text-red-300">
                {error}
                {'\n'}Is the backend running on port 4747?
              </pre>
            </div>
          )}

          {!result && !error && !running && (
            <p className="text-xs text-stone-500">
              Nothing yet — pick an action and press Run.
            </p>
          )}

          {result && (
            <>
              {result.compileDiagnostics.trim() !== '' && (
                <Section
                  label={result.compileOk ? 'compile diagnostics (warnings)' : 'compile diagnostics (errors)'}
                  tone={result.compileOk ? 'text-amber-300' : 'text-red-400'}
                  text={result.compileDiagnostics}
                />
              )}

              {result.timedOut && (
                <div className="console-section">
                  <pre className="console-text text-amber-300">
                    process timed out after 10 s and was killed
                  </pre>
                </div>
              )}

              {isArtifactAction ? (
                result.artifact !== null && (
                  <Section label={`artifact · ${result.action}`} tone="text-stone-200" text={result.artifact} />
                )
              ) : (
                <>
                  {result.stdout !== null && result.stdout !== '' && (
                    <Section label="stdout" tone="text-stone-200" text={result.stdout} />
                  )}
                  {sanitizerReport && result.stderr !== null ? (
                    // Structured summary card; the raw report lives inside its
                    // collapsible "full report" section (one click away).
                    <SanitizerCard report={sanitizerReport} raw={result.stderr} />
                  ) : (
                    result.stderr !== null &&
                    result.stderr !== '' && (
                      <Section label="stderr" tone="text-red-300" text={result.stderr} />
                    )
                  )}
                  {result.compileOk &&
                    (result.stdout ?? '') === '' &&
                    (result.stderr ?? '') === '' && (
                      <p className="text-xs text-stone-500">
                        Program ran quietly (no stdout/stderr).
                      </p>
                    )}
                </>
              )}

              {!result.compileOk && (
                <p className="mt-1 text-xs text-stone-500">
                  Compilation failed — fix the diagnostics above and run again.
                </p>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save to vault</DialogTitle>
            <DialogDescription>
              Keeps this run&apos;s output (stdout, diagnostics, artifact) for later review.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <Input
              autoFocus
              value={saveLabel}
              onChange={(e) => setSaveLabel(e.target.value)}
              placeholder="Label, e.g. I.03 · assembly -O0 vs -O2"
              className="text-sm"
            />
            <DialogFooter className="mt-4">
              <Button type="submit" size="sm">
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
