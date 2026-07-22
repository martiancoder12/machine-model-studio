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

// ---------------------------------------------------------------------------
// v2 (Phase 2) — Study content (API.md §GET /api/study/book1/:moduleId)
// ---------------------------------------------------------------------------

export interface LabStep {
  n: number;
  title: string;
  detail: string; // markdown, inline code ok
  command: string | null; // optional single copyable shell command
}

export interface Lab {
  summary: string;
  steps: LabStep[];
  closingPrompt: string;
}

export interface RubricCriterion {
  id: string;
  criterion: string;
  weight: number;
}

export interface BuildTask {
  title: string;
  brief: string; // markdown
  gate: boolean; // true only for module 07 (L3 gate)
  rubric: RubricCriterion[];
  stretch: string[];
}

export interface StudyContent {
  moduleId: string;
  lab: Lab;
  buildTask: BuildTask;
}

// Progress (API.md §Progress — frontend-local, localStorage)
export type ModuleStatus = 'not-started' | 'reading' | 'working' | 'done';

export type ProgressMap = Record<string, { status: ModuleStatus }>;
