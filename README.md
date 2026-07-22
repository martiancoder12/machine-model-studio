# Machine Model Studio

A local-first study environment for **Book I — C: The Machine Model** (L0 → L3).

Read the book, write C, compile and run it against the real native toolchain
(`cc`, ASan/UBSan, `make`, `lldb`), work the labs, score the build tasks, and
track progress toward the L3 gate — all in one web app served from your own
machine. Nothing leaves localhost.

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

- **Phase 0** — Architecture & scaffolding: repo, backend exec service, app shell.
- **Phase 1 — MVP**: book renderer, editor, run/pipeline buttons, terminal,
  per-module exercise workspaces. *(Phase gate: use it for a week on I.1–I.2.)*
- **Phase 2** — Lab walkthroughs, rubric scorecards, sanitizer/-O toggles.
- **Phase 3** — Reps scheduler, L3 gate dashboard, artifact vault, notes.
- **Phase 4** — Polish, QA, docs.

## Working agreement

Commit and push at the end of every work session.
