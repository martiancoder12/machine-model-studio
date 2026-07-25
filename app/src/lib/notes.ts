// Phase 3 — per-module notes, frontend-local.
// Key: localStorage["mms:notes:v1"] — { [moduleId: string]: string }

const KEY = 'mms:notes:v1';

export type NotesMap = Record<string, string>;

export function loadNotes(): NotesMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as NotesMap;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function getNote(moduleId: string): string {
  return loadNotes()[moduleId] ?? '';
}

export function saveNote(moduleId: string, text: string): void {
  try {
    const map = loadNotes();
    if (text.trim() === '') delete map[moduleId];
    else map[moduleId] = text;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // storage unavailable — the note simply won't persist
  }
}
