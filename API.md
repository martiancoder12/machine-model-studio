# Machine Model Studio — API Contract (v1, MVP)

Both workstreams (backend `server/`, frontend `app/`) build against this contract.
Backend binds to **127.0.0.1:4747** only. Frontend dev server proxies `/api` → `http://localhost:4747`.

## Content endpoints

### GET /api/content/book1/manifest
→ `200` the contents of `content/book1/manifest.json` (module list, titles, markers, levels).

### GET /api/content/book1/:moduleId
- `moduleId` is the two-digit id (`"00"` … `"09"`), resolved via the manifest.
→ `200 { "id": "01", "title": "I.1 · Hello, machine", "markdown": "..." }`
→ `404 { "error": "unknown module" }`

## Workspace endpoints

Each module has a persistent workspace directory at `sandbox/<moduleId>/` (created on
first access, seeded from `server/seeds/<moduleId>/` if a seed dir exists).
All file paths are relative to the workspace root and MUST be jailed there
(reject `..`, absolute paths, symlinks escaping the root → `400`).

### GET /api/workspace/:moduleId/files
→ `200 { "files": [{ "path": "main.c", "content": "..." }] }` — all files in the workspace, flat or nested.

### PUT /api/workspace/:moduleId/file
Body: `{ "path": "main.c", "content": "..." }` — creates or overwrites (mkdir -p semantics).
→ `200 { "ok": true }`

### DELETE /api/workspace/:moduleId/file?path=main.c
→ `200 { "ok": true }` · `404` if missing.

## Run endpoint

### POST /api/run
Body:
```json
{
  "moduleId": "01",
  "action": "build-run | preprocess | assembly | object",
  "file": "main.c",
  "argv": ["100", "C"],
  "stdin": "text piped to the process once",
  "flags": { "opt": "0 | 1 | 2", "sanitizers": false }
}
```

Semantics:
- Always compiles with `cc -std=c11 -Wall -Wextra` (plus `-O<opt>`, plus
  `-g -fsanitize=address,undefined` when `sanitizers` is true).
- `build-run`: compile **all `.c` files in the workspace root together** and link,
  then run the binary with `argv` and `stdin` piped.
- `preprocess`: `cc -E <file>` → artifact = preprocessed stdout.
- `assembly`: `cc -S <file>` → artifact = the `.s` file contents.
- `object`: `cc -c <file>` → artifact = `nm <file>.o` output (symbol table).
- Execution: `spawn` with argv arrays (NEVER shell interpolation), timeout 10 s,
  stdin written once then closed, stdout/stderr each capped at 256 KB.

→ `200`:
```json
{
  "ok": true,
  "action": "build-run",
  "compileOk": true,
  "compileDiagnostics": "compiler stderr (warnings/errors), empty if none",
  "exitCode": 0,
  "stdout": "...",
  "stderr": "...",
  "timedOut": false,
  "durationMs": 42,
  "artifact": "present for preprocess/assembly/object actions, null otherwise"
}
```
`compileOk: false` → `exitCode/stdout/stderr` are null; `compileDiagnostics` carries the errors.
Runtime crash → `ok: true, compileOk: true, exitCode: 139` (signal = 128+n); `stderr` may hold sanitizer reports.

## Security standing rules (backend)
- Bind 127.0.0.1 only; no auth needed at localhost but no remote exposure either.
- Validate `moduleId` against `/^[0-9]{2}$/`; jail every file path under `sandbox/<moduleId>/`.
- Never interpolate user input into a shell string; always `spawn(cmd, argsArray)`.
- Reject compiles whose workspace contains files > 1 MB.

## Progress (MVP, frontend-local)
Module progress state lives in the browser (localStorage) for MVP — no backend endpoint.
Shape: `{ "01": { "status": "not-started | reading | working | done" }, ... }`.

---

# v2 addition (Phase 2) — Study content endpoint

Structured lab walkthroughs + build-task rubrics, authored from the chapters.

### GET /api/study/book1/:moduleId
Serves `content/book1/study/<moduleId>.json`.
→ `200` the JSON below · `404 { "error": "no study content" }` (valid for modules 00/09).

### Study JSON schema (`content/book1/study/<id>.json`)
```json
{
  "moduleId": "01",
  "lab": {
    "summary": "one-line purpose of the lab",
    "steps": [
      { "n": 1, "title": "short imperative", "detail": "markdown, inline code ok",
        "command": "optional single copyable shell command or null" }
    ],
    "closingPrompt": "the one-sentence rule the chapter asks the learner to state"
  },
  "buildTask": {
    "title": "temperature converter",
    "brief": "markdown paragraph(s): the spec in full",
    "gate": false,
    "rubric": [
      { "id": "compiles", "criterion": "Compiles warning-free under cc -Wall -Wextra", "weight": 1 }
    ],
    "stretch": ["optional stretch goal", "..."]
  }
}
```
Rules: content is faithful to the chapter's Lab and Build Task sections (steps in the
chapter's order, rubric criteria verbatim from the chapter's scoring criteria);
`gate: true` only for module 07 (L3 gate); capstone marked via moduleId "08".
