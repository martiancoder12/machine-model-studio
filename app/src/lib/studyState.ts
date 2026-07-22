// Phase 2 study-flow state — frontend-local (localStorage), like progress.
// Key: localStorage["mms:study:v1"]
//
// Shape:
// {
//   [moduleId: string]: {
//     lab?: {
//       doneSteps?: Record<string, true>;   // key = step n as string
//       reflection?: string;                // answer to lab.closingPrompt
//     };
//     build?: {
//       marks?: Record<string, "pass" | "fail">; // key = rubric criterion id
//       stretch?: Record<string, true>;          // key = stretch goal index as string
//       attempts?: number;
//       lastSnapshot?: AttemptSnapshot | null;
//     };
//   };
// }

export type RubricMark = 'pass' | 'fail';

export interface AttemptSnapshot {
  at: string; // ISO timestamp
  score: number; // sum of weights marked pass
  total: number; // sum of all rubric weights
  marks: Record<string, RubricMark>;
}

export interface BuildState {
  marks: Record<string, RubricMark>;
  stretch: Record<string, true>;
  attempts: number;
  lastSnapshot: AttemptSnapshot | null;
}

export interface LabState {
  doneSteps: Record<string, true>;
  reflection: string;
}

export interface ModuleStudyState {
  lab: LabState;
  build: BuildState;
}

export type StudyStateMap = Record<string, ModuleStudyState>;

const KEY = 'mms:study:v1';

const EMPTY_LAB: LabState = { doneSteps: {}, reflection: '' };
const EMPTY_BUILD: BuildState = { marks: {}, stretch: {}, attempts: 0, lastSnapshot: null };

export function loadStudyState(): StudyStateMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StudyStateMap;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStudyState(map: StudyStateMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // storage unavailable — study state simply won't persist
  }
}

export function getModuleStudy(map: StudyStateMap, moduleId: string): ModuleStudyState {
  const m = map[moduleId];
  return {
    lab: { ...EMPTY_LAB, ...(m?.lab ?? {}) },
    build: { ...EMPTY_BUILD, ...(m?.build ?? {}) },
  };
}

export function updateModuleStudy(
  map: StudyStateMap,
  moduleId: string,
  updater: (current: ModuleStudyState) => ModuleStudyState,
): StudyStateMap {
  return { ...map, [moduleId]: updater(getModuleStudy(map, moduleId)) };
}
