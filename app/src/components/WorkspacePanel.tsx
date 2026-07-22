import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { FilePlus2, Save, Trash2, X } from 'lucide-react';
import '@/lib/monaco'; // local monaco bundle + worker wiring
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { RunResult, WorkspaceFile } from '@/types/api';
import { OutputConsole } from './OutputConsole';
import { RunBar } from './RunBar';

interface WorkspacePanelProps {
  moduleId: string | null;
}

function isValidPath(p: string): boolean {
  return (
    p.trim() !== '' &&
    !p.includes('..') &&
    !p.startsWith('/') &&
    !p.startsWith('\\') &&
    /^[\w./-]+$/.test(p)
  );
}

export function WorkspacePanel({ moduleId }: WorkspacePanelProps) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Latest content snapshot for blur-save; refs avoid stale closures.
  const filesRef = useRef(files);
  filesRef.current = files;
  const dirtyRef = useRef(dirtyPaths);
  dirtyRef.current = dirtyPaths;

  useEffect(() => {
    if (!moduleId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setRunResult(null);
    setRunError(null);
    api
      .getFiles(moduleId)
      .then(({ files: fetched }) => {
        if (cancelled) return;
        setFiles(fetched);
        setDirtyPaths(new Set());
        setActivePath(fetched[0]?.path ?? null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setFiles([]);
        setActivePath(null);
        setLoadError(e instanceof Error ? e.message : 'failed to load workspace');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  const saveFile = useCallback(
    async (path: string) => {
      if (!moduleId) return;
      const file = filesRef.current.find((f) => f.path === path);
      if (!file || !dirtyRef.current.has(path)) return;
      setSaving(true);
      try {
        await api.putFile(moduleId, path, file.content);
        setDirtyPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      } catch {
        // Save failures surface on the next attempt; keep the dirty marker.
      } finally {
        setSaving(false);
      }
    },
    [moduleId],
  );

  const handleEditorMount: OnMount = (editor) => {
    // Auto-save on blur (Save button is also always available).
    editor.onDidBlurEditorText(() => {
      if (activePathRef.current) void saveFile(activePathRef.current);
    });
  };
  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;

  function handleEditorChange(value: string | undefined) {
    if (!activePath) return;
    setFiles((prev) => prev.map((f) => (f.path === activePath ? { ...f, content: value ?? '' } : f)));
    setDirtyPaths((prev) => new Set(prev).add(activePath));
  }

  async function handleCreateFile() {
    if (!moduleId) return;
    const path = newFileName.trim();
    if (!isValidPath(path)) return;
    try {
      await api.putFile(moduleId, path, '// new file\n');
      const { files: fetched } = await api.getFiles(moduleId);
      setFiles(fetched);
      setActivePath(path);
      setNewFileName('');
      setNewFileOpen(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'could not create file');
    }
  }

  async function handleDeleteFile(path: string) {
    if (!moduleId) return;
    if (!window.confirm(`Delete ${path}? This cannot be undone.`)) return;
    try {
      await api.deleteFile(moduleId, path);
      const remaining = files.filter((f) => f.path !== path);
      setFiles(remaining);
      setDirtyPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      if (activePath === path) setActivePath(remaining[0]?.path ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'could not delete file');
    }
  }

  const activeFile = files.find((f) => f.path === activePath) ?? null;

  return (
    <div className="flex h-full flex-col bg-secondary/40">
      {/* ---- file tabs ---- */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-2 py-1.5">
        <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Workspace
        </span>
        {files.map((f) => (
          <button
            key={f.path}
            type="button"
            onClick={() => setActivePath(f.path)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors',
              f.path === activePath
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            {dirtyPaths.has(f.path) && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="unsaved changes" />
            )}
            {f.path}
          </button>
        ))}

        {newFileOpen ? (
          <form
            className="flex shrink-0 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreateFile();
            }}
          >
            <Input
              autoFocus
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="helper.c"
              className="h-7 w-32 font-mono text-[11px]"
            />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              disabled={!isValidPath(newFileName.trim())}
            >
              Add
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                setNewFileOpen(false);
                setNewFileName('');
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </form>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            title="New file"
            onClick={() => setNewFileOpen(true)}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
          </Button>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px]"
            disabled={!activePath || !dirtyPaths.has(activePath) || saving}
            onClick={() => activePath && void saveFile(activePath)}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title={activePath ? `Delete ${activePath}` : 'Delete file'}
            disabled={!activePath}
            onClick={() => activePath && void handleDeleteFile(activePath)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ---- editor ---- */}
      <div className="min-h-0 flex-[3] basis-0">
        {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Loading workspace…</p>}
        {loadError && !loading && (
          <div className="m-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {loadError} — is the backend running on port 4747?
          </div>
        )}
        {!loading && !loadError && !activeFile && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            This workspace is empty — create a file to start.
          </p>
        )}
        {activeFile && (
          <Editor
            key={`${moduleId}:${activeFile.path}`}
            path={`${moduleId}/${activeFile.path}`}
            language="c"
            value={activeFile.content}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            theme="vs"
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              renderWhitespace: 'none',
              padding: { top: 10 },
              fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            }}
            loading={<p className="px-3 py-2 text-xs text-muted-foreground">Starting editor…</p>}
          />
        )}
      </div>

      {/* ---- run bar ---- */}
      {moduleId && (
        <RunBar
          moduleId={moduleId}
          activeFile={activePath}
          running={running}
          onRunningChange={setRunning}
          onResult={(r) => {
            setRunError(null);
            setRunResult(r);
          }}
          onError={(msg) => {
            setRunResult(null);
            setRunError(msg);
          }}
        />
      )}

      {/* ---- output console ---- */}
      <div className="flex min-h-[120px] flex-[2] basis-0 flex-col">
        <OutputConsole result={runResult} running={running} error={runError} />
      </div>
    </div>
  );
}
