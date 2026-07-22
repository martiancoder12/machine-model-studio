# Machine Model Studio — Frontend (`app/`)

A local-first study web app for **Book I — C: The Machine Model**: read the book,
edit C in a per-module workspace, and poke the real toolchain (build & run,
preprocess, assembly, object file) without leaving the page.

Phase 2 adds the guided study flow: per-module **Lab** walkthroughs and
**Build Task** rubrics (`GET /api/study/book1/:id`), a **sanitizer report
summary card** in the output console, and run-triggered progress promotion.

React 19 + TypeScript + Vite 7 + Tailwind v3 + shadcn/ui, with `react-markdown`
(+ `remark-gfm`) for the book reader and `@monaco-editor/react` (monaco bundled
locally, no CDN) for the C editor.

## Run

```bash
npm install
npm run dev                 # serves on http://localhost:3000
npm run dev -- --port 3100  # CLI host/port args are forwarded to vite
npm run build               # tsc -b && vite build → dist/
```

The dev server proxies `/api` → `http://localhost:4747` (see `vite.config.ts`),
where the backend (`../server/`, contract in `../API.md`) must be running.

**Mock mode:** while the backend is unavailable, open
`http://localhost:3000/?mock=1` (or set `VITE_MOCK_API=1`) — the frontend serves
canned manifest/markdown/workspace/run/study responses in the browser so every
screen can be exercised end-to-end (modules 00/09 mock the 404 no-study-content
case; runs with the sanitizer toggle on emit a mock ASan+UBSan report so the
summary card can be seen). An amber badge in the corner marks mock mode.

## Architecture

Three-region study shell (resizable panels, `react-resizable-panels` v4):

- **Left — module navigator** (`src/components/ModuleSidebar.tsx`)
  Modules 00–09 from `GET /api/content/book1/manifest`, with marker badges
  (make-or-break / L3 gate / capstone), level tags, and a per-module status dot
  (click = cycle not-started → reading → working → done; dropdown = set
  explicitly). Active module highlighted. Opening a module auto-marks it
  `reading` if it was `not-started`.
- **Center — book reader** (`src/components/BookReader.tsx`)
  Renders `GET /api/content/book1/:id` markdown as a calm book page: serif body,
  max-width column, fenced code blocks on a dark slab with a language label,
  styled GFM tables. Typography lives in `.book-reader*` in `src/index.css`.
- **Right — study panel** (`src/components/StudyPanel.tsx`) — three tabs:
  - **Workspace** (`src/components/WorkspacePanel.tsx`, unchanged behaviour):
    - File tabs from `GET /api/workspace/:id/files`, Monaco (C mode), unsaved-dot
      per tab, **Save** button + auto-save-on-blur (`PUT /api/workspace/:id/file`),
      new-file and delete-file (`DELETE …/file?path=`) controls.
    - **Run bar** (`src/components/RunBar.tsx`): action selector
      (Build & Run / Preprocess / Assembly / Object), `-O0/-O1/-O2`,
      ASan+UBSan toggle, argv input (space-separated → `argv[]`), stdin textarea.
      Posts to `/api/run` per the contract.
    - **Output console** (`src/components/OutputConsole.tsx`): dark terminal
      panel — compile diagnostics (amber warnings / red errors), stdout, stderr,
      exit-code + duration status line, timed-out notice, artifact text for
      preprocess/assembly/object. When stderr contains an AddressSanitizer or
      UBSan ("runtime error:") report, a structured summary card
      (`src/components/SanitizerCard.tsx`, parsing in `src/lib/sanitizer.ts`)
      renders above the raw output: sanitizer kind, error class
      (e.g. heap-buffer-overflow, signed integer overflow), top faulting
      file:line, and the raw report in a collapsible "full report" section.
  - **Lab** (`src/components/LabPanel.tsx`): the module's lab walkthrough as a
    checklist accordion — each numbered step expands to markdown detail
    (shared reader renderer, `src/components/markdown.tsx`) plus an optional
    copyable command chip (`src/components/CommandChip.tsx`, click-to-copy
    with feedback). Per-step completion checkboxes, a closing reflection card
    with a persisted one-sentence textarea, and a "reset lab" control.
  - **Build Task** (`src/components/BuildTaskPanel.tsx`): title with a GATE
    badge when `gate` is true (module 07) and capstone styling for module 08,
    the brief as markdown, then the rubric as an interactive scorecard —
    tri-state self-assessment per criterion (unmarked / pass / fail) with
    weights, a computed score line (sum of passed weights / total), and a
    "declare attempt scored" verdict that snapshots the scorecard into
    localStorage (latest snapshot + attempt count). Stretch goals are
    optional checkboxes.

  Lab and Build Task fetch `GET /api/study/book1/:id` for the active module.
  A 404 (modules 00/09, or content not yet authored) renders a calm "no
  guided content for this section yet" state — not an error. The Workspace
  tab stays mounted (hidden) while the other tabs are open so editor/console
  state is never lost.

## Where things live

```
src/
  App.tsx                      three-panel shell, manifest + progress state
  types/api.ts                 TS types mirroring ../API.md exactly (incl. v2 study schema)
  lib/api.ts                   fetch client for all endpoints + ?mock=1 mock API
  lib/monaco.ts                local monaco bundle + editor worker wiring
  lib/progress.ts              localStorage progress (mms:progress:v1)
  lib/studyState.ts            localStorage study state (mms:study:v1) — shapes + helpers
  lib/useModuleStudy.ts        per-module study-state hook (load/mutate/persist)
  lib/sanitizer.ts             ASan/UBSan stderr → structured report parser
  components/
    ModuleSidebar.tsx          left: module navigator + status dots
    BookReader.tsx             center: markdown reader
    markdown.tsx               shared react-markdown renderers (reader + study tabs)
    StudyPanel.tsx             right: Workspace | Lab | Build Task tabs + study fetch
    WorkspacePanel.tsx         right/workspace: file tabs + Monaco + save/new/delete
    RunBar.tsx                 right/workspace: action/opt/sanitizer/argv/stdin + Run
    OutputConsole.tsx          right/workspace: terminal-styled output + sanitizer card
    SanitizerCard.tsx          structured ASan/UBSan summary + collapsible raw report
    LabPanel.tsx               right/lab: checklist-accordion walkthrough + reflection
    BuildTaskPanel.tsx         right/build: brief + rubric scorecard + stretch goals
    CommandChip.tsx            copyable shell-command chip (click-to-copy + feedback)
    ui/                        shadcn/ui components (template)
```

## Study state (Phase 2, frontend-local)

Key: `localStorage["mms:study:v1"]`, keyed by module id:

```json
{
  "01": {
    "lab": {
      "doneSteps": { "1": true, "3": true },
      "reflection": "The compiler guarantees translation, not correctness."
    },
    "build": {
      "marks": { "compiles": "pass", "converts": "fail" },
      "stretch": { "0": true },
      "attempts": 2,
      "lastSnapshot": {
        "at": "2026-02-14T10:30:00.000Z",
        "score": 3, "total": 5,
        "marks": { "compiles": "pass", "converts": "pass" }
      }
    }
  }
}
```

Progress refinement (Phase 2): completing a run auto-promotes the module's
status dot to `working` (never demotes `done`); lab completion does NOT change
the dot — the learner owns module status.

## Contract notes

- All endpoints are consumed exactly as specified in `../API.md` (v1 + v2 study
  endpoint); the only frontend-local state is module progress
  (API.md §Progress) and study state (`mms:study:v1`, above).
- Progress key: `localStorage["mms:progress:v1"]`, shape
  `{ "01": { "status": "not-started | reading | working | done" } }`.
- Monaco is imported in full from the local `monaco-editor` package (robust,
  offline-friendly); the bundle is ~4.5 MB minified as a result. Slimming it to
  editor-core + cpp language only is possible later via
  `monaco-editor/languages/definitions/cpp/register`.
