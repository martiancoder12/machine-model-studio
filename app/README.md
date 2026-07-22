# Machine Model Studio — Frontend (`app/`)

A local-first study web app for **Book I — C: The Machine Model**: read the book,
edit C in a per-module workspace, and poke the real toolchain (build & run,
preprocess, assembly, object file) without leaving the page.

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
canned manifest/markdown/workspace/run responses in the browser so every screen
can be exercised end-to-end. An amber badge in the corner marks mock mode.

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
- **Right — workspace** (`src/components/WorkspacePanel.tsx`)
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
    preprocess/assembly/object.

## Where things live

```
src/
  App.tsx                      three-panel shell, manifest + progress state
  types/api.ts                 TS types mirroring ../API.md exactly
  lib/api.ts                   fetch client for all endpoints + ?mock=1 mock API
  lib/monaco.ts                local monaco bundle + editor worker wiring
  lib/progress.ts              localStorage progress (mms:progress:v1)
  components/
    ModuleSidebar.tsx          left: module navigator + status dots
    BookReader.tsx             center: markdown reader
    WorkspacePanel.tsx         right: file tabs + Monaco + save/new/delete
    RunBar.tsx                 right: action/opt/sanitizer/argv/stdin + Run
    OutputConsole.tsx          right: terminal-styled output
    ui/                        shadcn/ui components (template)
```

## Contract notes

- All endpoints are consumed exactly as specified in `../API.md`; the only
  frontend-local state is module progress (API.md §Progress).
- Progress key: `localStorage["mms:progress:v1"]`, shape
  `{ "01": { "status": "not-started | reading | working | done" } }`.
- Monaco is imported in full from the local `monaco-editor` package (robust,
  offline-friendly); the bundle is ~4.5 MB minified as a result. Slimming it to
  editor-core + cpp language only is possible later via
  `monaco-editor/languages/definitions/cpp/register`.
