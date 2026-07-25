// Phase 3 — Reps scheduler (spaced repetition), frontend-local.
// Key: localStorage["mms:reps:v1"]
//
// A module that reaches status "done" enters the rep ladder: short review
// sessions due after 1, 3, 7, 16, then 35 days. Completing a rep advances
// the ladder; after the last interval the module is "mastered" and leaves
// the schedule. Un-marking a module as done drops its rep state.
//
// Shape:
// {
//   [moduleId: string]: {
//     stage: number;      // index into INTERVAL_DAYS of the NEXT rep
//     dueAt: string;      // ISO timestamp when the next rep is due
//     history: string[];  // ISO timestamps of completed reps
//   };
// }

export const INTERVAL_DAYS = [1, 3, 7, 16, 35] as const;

export interface RepState {
  stage: number;
  dueAt: string;
  history: string[];
}

export type RepsMap = Record<string, RepState>;

const KEY = 'mms:reps:v1';
const DAY_MS = 24 * 60 * 60 * 1000;

export function loadReps(): RepsMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RepsMap;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveReps(map: RepsMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // storage unavailable — reps simply won't persist
  }
}

function plusDays(from: Date, days: number): string {
  return new Date(from.getTime() + days * DAY_MS).toISOString();
}

/** Put a module on the rep ladder (first rep due tomorrow). No-op if the
 * module already has rep state — re-marking done must not reset progress. */
export function scheduleReps(map: RepsMap, moduleId: string, now = new Date()): RepsMap {
  if (map[moduleId]) return map;
  return {
    ...map,
    [moduleId]: { stage: 0, dueAt: plusDays(now, INTERVAL_DAYS[0]), history: [] },
  };
}

/** Drop a module's rep state (used when its status leaves "done"). */
export function clearReps(map: RepsMap, moduleId: string): RepsMap {
  if (!(moduleId in map)) return map;
  const next = { ...map };
  delete next[moduleId];
  return next;
}

/** Mark the current rep as done and advance the ladder. After the final
 * interval the module is mastered: stage === INTERVAL_DAYS.length and
 * dueAt is left as the completion time (no further reps are due). */
export function completeRep(map: RepsMap, moduleId: string, now = new Date()): RepsMap {
  const rep = map[moduleId];
  if (!rep || isMastered(rep)) return map;
  const stage = rep.stage + 1;
  const mastered = stage >= INTERVAL_DAYS.length;
  return {
    ...map,
    [moduleId]: {
      stage,
      dueAt: mastered ? now.toISOString() : plusDays(now, INTERVAL_DAYS[stage]),
      history: [...rep.history, now.toISOString()],
    },
  };
}

export function isMastered(rep: RepState): boolean {
  return rep.stage >= INTERVAL_DAYS.length;
}

export function isDue(rep: RepState, now = new Date()): boolean {
  return !isMastered(rep) && new Date(rep.dueAt).getTime() <= now.getTime();
}

/** Modules with a rep due right now, sorted by due date (oldest first). */
export function dueReps(map: RepsMap, now = new Date()): string[] {
  return Object.entries(map)
    .filter(([, rep]) => isDue(rep, now))
    .sort(([, a], [, b]) => a.dueAt.localeCompare(b.dueAt))
    .map(([id]) => id);
}

export function repStageLabel(rep: RepState): string {
  return isMastered(rep) ? 'mastered' : `rep ${rep.stage + 1} of ${INTERVAL_DAYS.length}`;
}

/** Human-readable due label: "overdue 3d", "today", "in 5d". */
export function dueLabel(rep: RepState, now = new Date()): string {
  if (isMastered(rep)) return 'mastered';
  const diffDays = Math.round((new Date(rep.dueAt).getTime() - now.getTime()) / DAY_MS);
  if (diffDays < 0) return `overdue ${-diffDays}d`;
  if (diffDays === 0) return 'today';
  return `in ${diffDays}d`;
}
