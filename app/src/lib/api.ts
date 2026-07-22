// API client for the Machine Model Studio backend (../API.md).
// All requests go through the Vite dev proxy: /api → http://localhost:4747.
//
// MOCK MODE: the backend is built in parallel. Until it exists, open the app
// with ?mock=1 (or set VITE_MOCK_API=1) to serve canned responses from the
// browser so the UI can be exercised end-to-end. Mock mode is dev-only and
// never used when the real backend answers.

import type {
  Manifest,
  ModuleContent,
  RunRequest,
  RunResult,
  WorkspaceFile,
  WorkspaceFiles,
} from '@/types/api';

const MOCK_ENABLED =
  import.meta.env.VITE_MOCK_API === '1' ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mock') === '1');

export const IS_MOCK_API = MOCK_ENABLED;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ---------------------------------------------------------------- real API

const realApi = {
  getManifest: () => request<Manifest>('/api/content/book1/manifest'),

  getModule: (moduleId: string) => request<ModuleContent>(`/api/content/book1/${moduleId}`),

  getFiles: (moduleId: string) => request<WorkspaceFiles>(`/api/workspace/${moduleId}/files`),

  putFile: (moduleId: string, path: string, content: string) =>
    request<{ ok: true }>(`/api/workspace/${moduleId}/file`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    }),

  deleteFile: (moduleId: string, path: string) =>
    request<{ ok: true }>(`/api/workspace/${moduleId}/file?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    }),

  run: (body: RunRequest) =>
    request<RunResult>('/api/run', { method: 'POST', body: JSON.stringify(body) }),
};

export type Api = typeof realApi;

// ---------------------------------------------------------------- mock API

const MOCK_SEED: WorkspaceFile[] = [
  {
    path: 'main.c',
    content: `#include <stdio.h>\n\nint main(int argc, char **argv)\n{\n    printf("hello, machine — argc = %d\\n", argc);\n    for (int i = 0; i < argc; i++)\n        printf("argv[%d] = %s\\n", i, argv[i]);\n    return 0;\n}\n`,
  },
];

const mockFilesByModule = new Map<string, WorkspaceFile[]>();

function mockModuleFiles(moduleId: string): WorkspaceFile[] {
  if (!mockFilesByModule.has(moduleId)) {
    mockFilesByModule.set(moduleId, MOCK_SEED.map((f) => ({ ...f })));
  }
  return mockFilesByModule.get(moduleId)!;
}

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

const mockApi: Api = {
  async getManifest(): Promise<Manifest> {
    await delay();
    return {
      book: 'Book I — C: The Machine Model',
      levelRange: 'L0 → L3',
      tier: 'Foundations',
      modules: [
        { id: '00', file: '00_front_matter.md', title: 'Front Matter', marker: null, level: null },
        { id: '01', file: '01_hello_machine.md', title: 'I.1 · Hello, machine', marker: null, level: 'L0 → L1' },
        { id: '02', file: '02_values_memory.md', title: 'I.2 · Values and the shape of memory', marker: null, level: 'L0 → L1' },
        { id: '03', file: '03_pointers.md', title: 'I.3 · Pointers and addresses', marker: 'make-or-break', level: 'L1' },
        { id: '04', file: '04_heap.md', title: 'I.4 · The heap and manual memory', marker: null, level: 'L1' },
        { id: '05', file: '05_arrays_strings.md', title: 'I.5 · Arrays, strings, buffers', marker: null, level: 'L1 → L2' },
        { id: '06', file: '06_structs.md', title: 'I.6 · Structs and composing data', marker: null, level: 'L2' },
        { id: '07', file: '07_toolchain.md', title: 'I.7 · Multi-file programs and the real toolchain', marker: 'L3 gate', level: 'L2 → L3' },
        { id: '08', file: '08_ub_capstone.md', title: 'I.8 · Undefined behaviour and reading real C', marker: 'capstone', level: 'L2 → L3' },
        { id: '09', file: '09_back_matter.md', title: 'Back Matter · Gate Checklist', marker: null, level: null },
      ],
    };
  },

  async getModule(moduleId): Promise<ModuleContent> {
    await delay();
    return {
      id: moduleId,
      title: `Module ${moduleId} (mock)`,
      markdown: [
        `# Module ${moduleId} — mock content`,
        '',
        'This is **mock markdown** served by the frontend because the backend',
        'is still under construction. Start the real server on port 4747 and',
        'reload without `?mock=1`.',
        '',
        '## A code sample',
        '',
        '```c',
        '#include <stdio.h>',
        '',
        'int main(void)',
        '{',
        '    printf("hello, machine\\n");',
        '    return 0;',
        '}',
        '```',
        '',
        '| Term | Meaning |',
        '| ---- | ------- |',
        '| `main` | program entry point |',
        '| `printf` | formatted output |',
        '',
        'Inline `code`, *emphasis*, and lists:',
        '',
        '- compile',
        '- run',
        '- inspect the machine',
      ].join('\n'),
    };
  },

  async getFiles(moduleId): Promise<WorkspaceFiles> {
    await delay();
    return { files: mockModuleFiles(moduleId).map((f) => ({ ...f })) };
  },

  async putFile(moduleId, path, content) {
    await delay();
    const files = mockModuleFiles(moduleId);
    const existing = files.find((f) => f.path === path);
    if (existing) existing.content = content;
    else files.push({ path, content });
    return { ok: true as const };
  },

  async deleteFile(moduleId, path) {
    await delay();
    const files = mockModuleFiles(moduleId);
    const idx = files.findIndex((f) => f.path === path);
    if (idx === -1) throw new ApiError(404, 'file not found (mock)');
    files.splice(idx, 1);
    return { ok: true as const };
  },

  async run(body): Promise<RunResult> {
    await delay(350);
    if (body.action === 'build-run') {
      return {
        ok: true,
        action: body.action,
        compileOk: true,
        compileDiagnostics: `${body.file}:7:5: warning: mock warning, backend not running [-Wmock]`,
        exitCode: 0,
        stdout: `hello, machine — argc = ${body.argv.length + 1}\n${body.argv
          .map((a, i) => `argv[${i + 1}] = ${a}`)
          .join('\n')}${body.argv.length ? '\n' : ''}${body.stdin ? `(stdin was: ${body.stdin.split('\n')[0]}…)\n` : ''}`,
        stderr: '',
        timedOut: false,
        durationMs: 42,
        artifact: null,
      };
    }
    const artifactByAction: Record<string, string> = {
      preprocess: `# 1 "${body.file}"\n# 1 "<built-in>"\n/* …mock preprocessed output… */\nint main(void);\n`,
      assembly: `\t.section\t__TEXT,__text\n\t.globl\t_main\n_main:\n\tpushq\t%rbp\n\tmovq\t%rsp, %rbp\n\t/* …mock assembly… */\n\tpopq\t%rbp\n\tretq\n`,
      object: `0000000000000000 T _main\n                 U _printf\n/* mock symbol table (nm output) */`,
    };
    return {
      ok: true,
      action: body.action,
      compileOk: true,
      compileDiagnostics: '',
      exitCode: null,
      stdout: null,
      stderr: null,
      timedOut: false,
      durationMs: 18,
      artifact: artifactByAction[body.action] ?? null,
    };
  },
};

export const api: Api = MOCK_ENABLED ? mockApi : realApi;

