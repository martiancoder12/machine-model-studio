# Machine Model Studio — Server

Local-first exec/content backend for the Book I (C) study app. Plain `node:http`, zero
dependencies, implements the contract in [`../API.md`](../API.md).

## Start

```sh
cd server
npm start          # = node index.js
```

Listens on `http://127.0.0.1:4747` only. Requires Node ≥ 20 (built/tested on Node 24)
and a system C toolchain (`cc`, `nm`) on PATH.

## Endpoints

| Method & path | Purpose |
|---|---|
| `GET /api/content/book1/manifest` | Raw `content/book1/manifest.json` |
| `GET /api/content/book1/:moduleId` | `{ id, title, markdown }` for a two-digit module id; `404 {"error":"unknown module"}` otherwise |
| `GET /api/workspace/:moduleId/files` | `{ files: [{ path, content }] }` — all files in the module workspace (recursive, dot-entries like `.build/` excluded) |
| `PUT /api/workspace/:moduleId/file` | Body `{ path, content }`; creates/overwrites with `mkdir -p` semantics → `{ ok: true }` |
| `DELETE /api/workspace/:moduleId/file?path=<rel>` | Deletes a workspace file → `{ ok: true }`; `404` if missing |
| `POST /api/run` | Compile/run per contract. Body `{ moduleId, action, file, argv, stdin, flags: { opt, sanitizers } }` with `action ∈ build-run \| preprocess \| assembly \| object` |

Run semantics: always `cc -std=c11 -Wall -Wextra -O<opt>`, plus
`-g -fsanitize=address,undefined` when `flags.sanitizers` is true. `build-run` compiles
all `.c` files in the workspace root together, links, and runs the binary with `argv`
and one-shot `stdin`. `preprocess` (`cc -E`), `assembly` (`cc -S`), and `object`
(`cc -c` + `nm`) return their output in `artifact`. Signal deaths report
`exitCode = 128 + signal`.

## Layout

- `index.js` — the whole service
- `seeds/<moduleId>/` — starter files copied into a module workspace on first access
  (currently `seeds/01/hello.c`)
- `sandbox/<moduleId>/` — runtime-created per-module workspaces (gitignored);
  compiler outputs go to `sandbox/<moduleId>/.build/` and never appear in file listings

## Security notes

- **Loopback only.** Binds `127.0.0.1`; no auth, no remote exposure.
- **Path jailing.** `moduleId` must match `/^[0-9]{2}$/`. Every workspace path is
  resolved and verified to stay under `sandbox/<moduleId>/`; absolute paths, `..`
  escapes, NUL bytes, and symlink components are rejected with `400`.
- **No shell.** Compilation and execution use `spawn(cmd, argsArray)` exclusively —
  user input is never interpolated into a shell string.
- **Resource limits.** 10 s timeout (compile and run), stdout/stderr capped at
  256 KB each, request bodies capped at 4 MB, and compiles are rejected with `400`
  if any workspace file exceeds 1 MB.
