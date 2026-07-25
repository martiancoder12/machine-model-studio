# Machine Model Studio

A local-first study environment for **Book I — C: The Machine Model** (L0 → L3).

Read the book, write C, compile and run it against the real native toolchain
(`cc`, ASan/UBSan, `make`, `lldb`), work the labs, score the build tasks, and
track progress toward the L3 gate — all in one web app served from your own
machine. Nothing leaves localhost.

**Live demo:** https://machine-model-studio.vercel.app — full book content,
labs, rubrics, notes, reps, and the gate dashboard; compilation is simulated
(the real toolchain only runs locally).

## Architecture (Option B — local-first)

- **Frontend**: React + TypeScript + Tailwind — book reader, Monaco editor,
  xterm.js terminal, progress/gate dashboards.
- **Backend**: small local Node service that shells out to the native toolchain
  in sandboxed per-exercise directories (timeouts, resource limits).
- **Storage**: local (SQLite/JSON). Cloud migration (Railway + Neon Postgres)
  is a deliberate future option behind a storage abstraction — not needed now.

## Non-goals

- No GUI debugger — terminal `lldb` inside the app is enough for I.7.
- No IDE-class features (refactoring, IntelliSense-grade C analysis).
- No cloud dependency, no accounts, no telemetry.

## Roadmap

- **Phase 0** — Architecture & scaffolding: repo, backend exec service, app shell. ✅
- **Phase 1 — MVP**: book renderer, editor, run/pipeline buttons, terminal,
  per-module exercise workspaces. ✅
- **Phase 2** — Lab walkthroughs, rubric scorecards, sanitizer/-O toggles. ✅
- **Phase 3** — Reps scheduler, L3 gate dashboard, artifact vault, notes. ✅
- **Phase 4** — Polish, QA, docs.

## Running locally

```sh
node server/index.js        # backend on 127.0.0.1:4747 (content + exec)
cd app && npm run dev       # frontend, proxies /api → 4747
```

Without the backend the frontend falls back to mock mode automatically —
reading works, runs are canned.

## Deployment

The public deployment is a **static build** of the frontend: the real Book I
content (chapters, study JSON, seeds) is bundled at build time via
`VITE_STATIC_CONTENT=1`; workspace writes are session-only and `run` is
simulated, since the native toolchain cannot leave localhost.

```sh
cd app && npm run deploy    # redeploy after content or app changes
```

`app/scripts/sync-static-content.mjs` (prebuild) refreshes the bundled copy
from `content/` and `server/seeds/` automatically, so content edits flow
into the next deploy with no extra steps.

## Working agreement

Commit and push at the end of every work session.
