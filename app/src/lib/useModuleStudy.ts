import { useCallback, useEffect, useState } from 'react';
import {
  getModuleStudy,
  loadStudyState,
  saveStudyState,
  updateModuleStudy,
  type ModuleStudyState,
} from './studyState';

/** Per-module study state (lab checklist + build-task scorecard) backed by
 * localStorage["mms:study:v1"]. `mutate` applies an updater and persists. */
export function useModuleStudy(moduleId: string | null) {
  const [state, setState] = useState<ModuleStudyState>(() =>
    moduleId ? getModuleStudy(loadStudyState(), moduleId) : getModuleStudy({}, ''),
  );

  useEffect(() => {
    if (moduleId) setState(getModuleStudy(loadStudyState(), moduleId));
  }, [moduleId]);

  const mutate = useCallback(
    (updater: (current: ModuleStudyState) => ModuleStudyState) => {
      if (!moduleId) return;
      setState((prev) => {
        const next = updater(prev);
        saveStudyState(updateModuleStudy(loadStudyState(), moduleId, () => next));
        return next;
      });
    },
    [moduleId],
  );

  return [state, mutate] as const;
}
