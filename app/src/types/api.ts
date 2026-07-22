// Types mirroring ../API.md (Machine Model Studio — API Contract v1, MVP)

export interface ManifestModule {
  id: string; // two-digit id "00" … "09"
  file: string;
  title: string;
  marker: 'make-or-break' | 'L3 gate' | 'capstone' | null;
  level: string | null;
}

export interface Manifest {
  book: string;
  levelRange: string;
  tier: string;
  modules: ManifestModule[];
}

export interface ModuleContent {
  id: string;
  title: string;
  markdown: string;
}

export interface WorkspaceFile {
  path: string;
  content: string;
}

export interface WorkspaceFiles {
  files: WorkspaceFile[];
}

export type RunAction = 'build-run' | 'preprocess' | 'assembly' | 'object';

export interface RunRequest {
  moduleId: string;
  action: RunAction;
  file: string;
  argv: string[];
  stdin: string;
  flags: {
    opt: '0' | '1' | '2';
    sanitizers: boolean;
  };
}

export interface RunResult {
  ok: boolean;
  action: RunAction;
  compileOk: boolean;
  compileDiagnostics: string;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  timedOut: boolean;
  durationMs: number;
  artifact: string | null;
}

// Progress (API.md §Progress — frontend-local, localStorage)
export type ModuleStatus = 'not-started' | 'reading' | 'working' | 'done';

export type ProgressMap = Record<string, { status: ModuleStatus }>;
