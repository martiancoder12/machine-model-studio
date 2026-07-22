// Progress is frontend-local for the MVP (API.md §Progress).
// localStorage shape: { "01": { "status": "not-started | reading | working | done" }, ... }

import type { ModuleStatus, ProgressMap } from '@/types/api';

const KEY = 'mms:progress:v1';

export const STATUS_ORDER: ModuleStatus[] = ['not-started', 'reading', 'working', 'done'];

export const STATUS_META: Record<ModuleStatus, { label: string; dotClass: string }> = {
  'not-started': { label: 'Not started', dotClass: 'bg-stone-300' },
  reading: { label: 'Reading', dotClass: 'bg-amber-500' },
  working: { label: 'Working', dotClass: 'bg-sky-600' },
  done: { label: 'Done', dotClass: 'bg-emerald-600' },
};

export function loadProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ProgressMap;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveProgress(map: ProgressMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // storage unavailable (private mode etc.) — progress simply won't persist
  }
}

export function getStatus(map: ProgressMap, moduleId: string): ModuleStatus {
  return map[moduleId]?.status ?? 'not-started';
}

export function setStatus(map: ProgressMap, moduleId: string, status: ModuleStatus): ProgressMap {
  return { ...map, [moduleId]: { status } };
}

export function cycleStatus(map: ProgressMap, moduleId: string): ProgressMap {
  const current = getStatus(map, moduleId);
  const next = STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length];
  return setStatus(map, moduleId, next);
}
