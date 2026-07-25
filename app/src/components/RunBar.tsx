import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import type { RunAction, RunResult } from '@/types/api';

const ACTIONS: { value: RunAction; label: string }[] = [
  { value: 'build-run', label: 'Build & Run' },
  { value: 'preprocess', label: 'Preprocess' },
  { value: 'assembly', label: 'Assembly' },
  { value: 'object', label: 'Object File' },
];

interface RunBarProps {
  moduleId: string;
  activeFile: string | null;
  running: boolean;
  onRunningChange: (running: boolean) => void;
  onResult: (result: RunResult, flags: { opt: string; sanitizers: boolean }) => void;
  onError: (message: string) => void;
}

export function RunBar({
  moduleId,
  activeFile,
  running,
  onRunningChange,
  onResult,
  onError,
}: RunBarProps) {
  const [action, setAction] = useState<RunAction>('build-run');
  const [opt, setOpt] = useState<'0' | '1' | '2'>('0');
  const [sanitizers, setSanitizers] = useState(false);
  const [argvText, setArgvText] = useState('');
  const [stdin, setStdin] = useState('');

  const canRun = !running && activeFile !== null;

  async function handleRun() {
    if (!canRun || !activeFile) return;
    onRunningChange(true);
    try {
      const result = await api.run({
        moduleId,
        action,
        file: activeFile,
        // space-separated strings → argv array (contract: argv: string[])
        argv: argvText.trim() === '' ? [] : argvText.trim().split(/\s+/),
        stdin,
        flags: { opt, sanitizers },
      });
      onResult(result, { opt, sanitizers });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'run request failed');
    } finally {
      onRunningChange(false);
    }
  }

  return (
    <div className="border-t border-border bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={action} onValueChange={(v) => setAction(v as RunAction)}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIONS.map((a) => (
              <SelectItem key={a.value} value={a.value} className="text-xs">
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={opt} onValueChange={(v) => setOpt(v as '0' | '1' | '2')}>
          <SelectTrigger className="h-8 w-[84px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['0', '1', '2'] as const).map((o) => (
              <SelectItem key={o} value={o} className="text-xs">
                -O{o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
          <Switch
            id="sanitizers"
            checked={sanitizers}
            onCheckedChange={setSanitizers}
            className="scale-[0.8]"
          />
          <Label htmlFor="sanitizers" className="cursor-pointer text-[11px] text-muted-foreground">
            ASan+UBSan
          </Label>
        </div>

        <Input
          value={argvText}
          onChange={(e) => setArgvText(e.target.value)}
          placeholder="argv: 100 C"
          className="h-8 min-w-[110px] flex-1 font-mono text-xs"
          disabled={action !== 'build-run'}
        />

        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleRun} disabled={!canRun}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? 'Running…' : 'Run'}
        </Button>
      </div>

      <div className="mt-2">
        <Textarea
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          placeholder="stdin (piped to the process once)…"
          rows={2}
          className="resize-none font-mono text-xs"
          disabled={action !== 'build-run'}
        />
      </div>
    </div>
  );
}
