// Phase 3 — Artifact vault, frontend-local.
// Key: localStorage["mms:vault:v1"]
//
// The vault keeps run results worth revisiting: assembly listings,
// preprocessed output, symbol tables, sanitizer reports, a program's
// stdout. Entries are newest-first and capped so localStorage stays small.

import type { RunAction, RunResult } from '@/types/api';

const KEY = 'mms:vault:v1';

const MAX_ENTRIES = 50;
const MAX_FIELD_CHARS = 64 * 1024; // per text field
const MAX_ENTRY_CHARS = 96 * 1024; // whole entry

export interface VaultEntry {
  id: string; // crypto.randomUUID or timestamp fallback
  moduleId: string;
  moduleTitle: string; // snapshot for display after manifest changes
  action: RunAction;
  label: string;
  createdAt: string; // ISO
  flags: { opt: string; sanitizers: boolean };
  compileOk: boolean;
  exitCode: number | null;
  compileDiagnostics: string;
  stdout: string | null;
  stderr: string | null;
  artifact: string | null;
}

function truncate(s: string | null): string | null {
  if (s === null) return null;
  if (s.length <= MAX_FIELD_CHARS) return s;
  return `${s.slice(0, MAX_FIELD_CHARS)}\n… truncated (${s.length - MAX_FIELD_CHARS} chars omitted)`;
}

function entrySize(e: VaultEntry): number {
  return (
    e.compileDiagnostics.length +
    (e.stdout?.length ?? 0) +
    (e.stderr?.length ?? 0) +
    (e.artifact?.length ?? 0)
  );
}

export function loadVault(): VaultEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VaultEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveVault(entries: VaultEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // storage unavailable or full — the entry simply won't persist
  }
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Save a run result to the vault. Returns the created entry. */
export function addVaultEntry(
  result: RunResult,
  opts: { moduleId: string; moduleTitle: string; label: string; flags: { opt: string; sanitizers: boolean } },
): VaultEntry {
  const entry: VaultEntry = {
    id: makeId(),
    moduleId: opts.moduleId,
    moduleTitle: opts.moduleTitle,
    action: result.action,
    label: opts.label.trim() || `${result.action} run`,
    createdAt: new Date().toISOString(),
    flags: opts.flags,
    compileOk: result.compileOk,
    exitCode: result.exitCode,
    compileDiagnostics: truncate(result.compileDiagnostics) ?? '',
    stdout: truncate(result.stdout),
    stderr: truncate(result.stderr),
    artifact: truncate(result.artifact),
  };
  let entries = [entry, ...loadVault()];
  // Enforce caps: drop oldest until within entry count and the new entry
  // itself fits (an oversized single entry is dropped rather than stored).
  entries = entries.slice(0, MAX_ENTRIES);
  if (entrySize(entry) > MAX_ENTRY_CHARS) {
    entries = entries.filter((e) => e.id !== entry.id);
  }
  saveVault(entries);
  return entry;
}

export function removeVaultEntry(id: string): VaultEntry[] {
  const entries = loadVault().filter((e) => e.id !== id);
  saveVault(entries);
  return entries;
}
