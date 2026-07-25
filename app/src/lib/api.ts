// API client for the Machine Model Studio backend (../API.md).
// All requests go through the Vite dev proxy: /api → http://localhost:4747.
//
// MOCK MODE: if the backend is unreachable (network error on first request),
// the client automatically falls back to mock responses so the UI is always
// usable. Explicit mock mode (?mock=1 or VITE_MOCK_API=1) is also supported.

import type {
  Manifest,
  ModuleContent,
  RunRequest,
  RunResult,
  StudyContent,
  WorkspaceFile,
  WorkspaceFiles,
} from '@/types/api';

const EXPLICIT_MOCK =
  import.meta.env.VITE_MOCK_API === '1' ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mock') === '1');

let autoMock = false; // set to true when a network error is detected

/** Returns whether the API is currently in mock mode (explicit or auto-fallback). */
export function isMockMode(): boolean {
  return EXPLICIT_MOCK || autoMock;
}

function isNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('connection refused') ||
    msg.includes('econnrefused') ||
    msg.includes('abort') ||
    e.name === 'TypeError'
  );
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

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

// ---------------------------------------------------------------- real API

const realApi = {
  getManifest: () => request<Manifest>('/api/content/book1/manifest'),

  getModule: (moduleId: string) => request<ModuleContent>(`/api/content/book1/${moduleId}`),

  getStudy: (moduleId: string) => request<StudyContent>(`/api/study/book1/${moduleId}`),

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

export const mockApi: Api = {
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

  async getStudy(moduleId): Promise<StudyContent> {
    await delay();
    // Modules 00/09 legitimately have no study content (API.md §v2).
    if (moduleId === '00' || moduleId === '09') {
      throw new ApiError(404, 'no study content');
    }
    const isGate = moduleId === '07';
    const isCapstone = moduleId === '08';
    return {
      moduleId,
      lab: {
        summary: 'Watch the toolchain turn source into a running process (mock lab).',
        steps: [
          {
            n: 1,
            title: 'Compile with warnings on',
            detail:
              'Compile `main.c` exactly the way the studio does: `cc -std=c11 -Wall -Wextra main.c -o main`. ' +
              'Any warning is a message from the machine — read it before you run anything.',
            command: 'cc -std=c11 -Wall -Wextra main.c -o main',
          },
          {
            n: 2,
            title: 'Run it and observe argv',
            detail:
              'Run the binary with two arguments and note that `argc` counts the program name itself. ' +
              'The array `argv` is the process talking back to you.',
            command: './main 100 C',
          },
          {
            n: 3,
            title: 'Peek at the assembly',
            detail:
              'Generate assembly with `-S` and find the `call` to `printf`. You do not need to read every ' +
              'line — just confirm the function call you wrote survives into machine code.',
            command: 'cc -std=c11 -S main.c',
          },
        ],
        closingPrompt:
          'In one sentence: what does the compiler guarantee about your source, and what does it not guarantee?',
      },
      buildTask: {
        title: isCapstone
          ? 'capstone · read and fix a real UB program'
          : isGate
            ? 'gate · multi-file temperature converter'
            : 'temperature converter',
        brief:
          'Write a program that reads a number and a unit letter (`C` or `F`) from `argv` and prints the ' +
          'converted temperature with **two decimal places**.\n\n' +
          '- exit code `0` on success, `1` with a usage line on bad input\n' +
          '- no warnings under `cc -std=c11 -Wall -Wextra`\n\n' +
          (isCapstone ? '_Capstone: this is the integrative task for Book I._' : ''),
        gate: isGate,
        rubric: [
          { id: 'compiles', criterion: 'Compiles warning-free under cc -Wall -Wextra', weight: 1 },
          { id: 'converts', criterion: 'C ↔ F conversions are numerically correct', weight: 2 },
          { id: 'input', criterion: 'Bad input exits 1 with a usage message on stderr', weight: 1 },
          { id: 'style', criterion: 'Names and structure a stranger could follow', weight: 1 },
        ],
        stretch: [
          'Accept Kelvin (`K`) as a third unit',
          'Read the value from stdin when argv is empty',
        ],
      },
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
      const stdout = `hello, machine — argc = ${body.argv.length + 1}\n${body.argv
        .map((a, i) => `argv[${i + 1}] = ${a}`)
        .join('\n')}${body.argv.length ? '\n' : ''}${body.stdin ? `(stdin was: ${body.stdin.split('\n')[0]}…)\n` : ''}`;
      // With sanitizers on, emit a realistic ASan + UBSan report so the
      // sanitizer summary card can be exercised without the backend.
      if (body.flags.sanitizers) {
        return {
          ok: true,
          action: body.action,
          compileOk: true,
          compileDiagnostics: '',
          exitCode: 1,
          stdout,
          stderr: [
            `${body.file}:9:12: runtime error: signed integer overflow: 2147483647 + 1 cannot be represented in type 'int'`,
            '==61234==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x6020000000f8 at pc 0x000100a3c2b4',
            'READ of size 4 at 0x6020000000f8 thread T0',
            `    #0 0x100a3c2b0 in main ${body.file}:9:12`,
            '    #1 0x100a3c4f8 in start+0x1f8',
            '',
            'SUMMARY: AddressSanitizer: heap-buffer-overflow main.c:9:12 in main',
            'ABORTING',
          ].join('\n'),
          timedOut: false,
          durationMs: 58,
          artifact: null,
        };
      }
      return {
        ok: true,
        action: body.action,
        compileOk: true,
        compileDiagnostics: `${body.file}:7:5: warning: mock warning, backend not running [-Wmock]`,
        exitCode: 0,
        stdout,
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

import { staticApi } from './staticApi';

// ---------------------------------------------------------------- auto-fallback wrapper

function withFallback<T extends (...args: Parameters<T>) => ReturnType<T>>(
  realFn: T,
  mockFn: T,
): T {
  return (async (...args: Parameters<T>) => {
    if (EXPLICIT_MOCK || autoMock) {
      return mockFn(...args);
    }
    try {
      return await realFn(...args);
    } catch (e) {
      if (isNetworkError(e)) {
        autoMock = true;
        console.warn('[api] backend unreachable — falling back to mock mode');
        return mockFn(...args);
      }
      throw e;
    }
  }) as T;
}

// ---------------------------------------------------------------- static mode (public deployment)

// VITE_STATIC_CONTENT=1 selects the static-content API (see staticApi.ts):
// real Book I content bundled at build time, simulated compilation. Used
// for the Vercel deployment, where the local exec backend cannot run.
const STATIC_CONTENT = import.meta.env.VITE_STATIC_CONTENT === '1';

/** True when the app is serving bundled static content (public deployment). */
export function isStaticMode(): boolean {
  return STATIC_CONTENT;
}

const fallbackApi: Api = {
  getManifest: withFallback(realApi.getManifest, mockApi.getManifest),
  getModule: withFallback(realApi.getModule, mockApi.getModule),
  getStudy: withFallback(realApi.getStudy, mockApi.getStudy),
  getFiles: withFallback(realApi.getFiles, mockApi.getFiles),
  putFile: withFallback(realApi.putFile, mockApi.putFile),
  deleteFile: withFallback(realApi.deleteFile, mockApi.deleteFile),
  run: withFallback(realApi.run, mockApi.run),
};

// Static mode takes precedence over everything (no backend exists there).
export const api: Api = STATIC_CONTENT ? staticApi : fallbackApi;
