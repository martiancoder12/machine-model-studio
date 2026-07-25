// Static-content API — used for the public deployment (Vercel), where the
// local exec backend cannot run. Selected with VITE_STATIC_CONTENT=1.
//
// Serves the REAL Book I content (manifest, chapter markdown, study JSON,
// workspace seeds) bundled at build time via import.meta.glob — reading,
// labs, rubrics, notes, reps, vault, and the gate dashboard all work
// against live content. Only two things are simulated:
//   - run(): compilation/execution needs the native toolchain (mock result)
//   - workspace writes: kept in memory for the session (nothing to persist to)
//
// The content is synced into src/static-content by scripts/sync-static-content.mjs
// (prebuild) so the app directory stays self-contained for deployment.

import manifestJson from '../static-content/book1/manifest.json';
import { ApiError, mockApi, type Api } from './api';
import type {
  Manifest,
  ModuleContent,
  StudyContent,
  WorkspaceFile,
  WorkspaceFiles,
} from '@/types/api';

const manifest = manifestJson as Manifest;

// Eager, build-time-bundled content. Keys are the glob paths below.
const markdownByPath = import.meta.glob('../static-content/book1/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const studyByPath = import.meta.glob('../static-content/book1/study/*.json', {
  import: 'default',
  eager: true,
}) as Record<string, StudyContent>;

const seedByPath = import.meta.glob('../static-content/seeds/*/*.c', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function mdFor(file: string): string | null {
  return markdownByPath[`../static-content/book1/${file}`] ?? null;
}

function studyFor(moduleId: string): StudyContent | null {
  return studyByPath[`../static-content/book1/study/${moduleId}.json`] ?? null;
}

function seedsFor(moduleId: string): WorkspaceFile[] {
  const prefix = `../static-content/seeds/${moduleId}/`;
  return Object.entries(seedByPath)
    .filter(([p]) => p.startsWith(prefix))
    .map(([p, content]) => ({ path: p.slice(prefix.length), content }));
}

// Session-only workspace overlay: seeds + any edits made this session.
const workspaceByModule = new Map<string, WorkspaceFile[]>();

function filesFor(moduleId: string): WorkspaceFile[] {
  if (!workspaceByModule.has(moduleId)) {
    workspaceByModule.set(moduleId, seedsFor(moduleId));
  }
  return workspaceByModule.get(moduleId)!;
}

export const staticApi: Api = {
  async getManifest(): Promise<Manifest> {
    return manifest;
  },

  async getModule(moduleId): Promise<ModuleContent> {
    const mod = manifest.modules.find((m) => m.id === moduleId);
    const markdown = mod ? mdFor(mod.file) : null;
    if (!mod || markdown === null) throw new ApiError(404, 'unknown module');
    return { id: mod.id, title: mod.title, markdown };
  },

  async getStudy(moduleId): Promise<StudyContent> {
    const study = studyFor(moduleId);
    if (!study) throw new ApiError(404, 'no study content');
    return study;
  },

  async getFiles(moduleId): Promise<WorkspaceFiles> {
    return { files: filesFor(moduleId).map((f) => ({ ...f })) };
  },

  async putFile(moduleId, path, content) {
    const files = filesFor(moduleId);
    const existing = files.find((f) => f.path === path);
    if (existing) existing.content = content;
    else files.push({ path, content });
    return { ok: true as const };
  },

  async deleteFile(moduleId, path) {
    const files = filesFor(moduleId);
    const idx = files.findIndex((f) => f.path === path);
    if (idx === -1) throw new ApiError(404, 'file not found');
    files.splice(idx, 1);
    return { ok: true as const };
  },

  // Compilation requires the native toolchain — simulated in static mode.
  run: (body) => mockApi.run(body),
};
