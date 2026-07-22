// Bundle monaco-editor locally (local-first: no CDN loader) and point
// @monaco-editor/react at it. C has no language service, so the base
// editor worker is the only worker we need.

import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

loader.config({ monaco });

export { monaco };
