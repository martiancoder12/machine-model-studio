// Machine Model Studio — local exec/content backend (API contract v1, MVP).
// Plain node:http, zero dependencies. Binds 127.0.0.1:4747 only.

import http from 'node:http';
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(SERVER_DIR, '..', 'content', 'book1');
const SANDBOX_ROOT = path.resolve(SERVER_DIR, 'sandbox');
const SEEDS_ROOT = path.resolve(SERVER_DIR, 'seeds');

const HOST = '127.0.0.1';
const PORT = 4747;

const MAX_OUTPUT_BYTES = 256 * 1024;   // stdout/stderr cap per stream
const MAX_BODY_BYTES = 4 * 1024 * 1024; // request body cap
const MAX_FILE_BYTES = 1 * 1024 * 1024; // reject compiles if any workspace file exceeds this
const TIMEOUT_MS = 10_000;             // compile and run timeout

const MODULE_ID_RE = /^[0-9]{2}$/;
const RUN_ACTIONS = new Set(['build-run', 'preprocess', 'assembly', 'object']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (d) => {
      size += d.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(d);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Resolve a user-supplied relative path strictly inside `root`.
// Returns the absolute path, or null if it escapes (absolute path, `..`, NUL,
// or resolves to the root itself).
function jailPath(root, rel) {
  if (typeof rel !== 'string' || rel.length === 0) return null;
  if (rel.includes('\0')) return null;
  if (path.isAbsolute(rel)) return null;
  const resolved = path.resolve(root, rel);
  if (resolved === root) return null;
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

// Walk the existing components of a resolved path; reject if any is a symlink.
async function escapesViaSymlink(root, resolved) {
  const rel = path.relative(root, resolved);
  let cur = root;
  for (const part of rel.split(path.sep)) {
    cur = path.join(cur, part);
    try {
      const st = await fsp.lstat(cur);
      if (st.isSymbolicLink()) return true;
    } catch {
      break; // component does not exist yet — fine
    }
  }
  return false;
}

// Create sandbox/<moduleId> on first access, seeding from seeds/<moduleId>/ if present.
async function ensureWorkspace(moduleId) {
  const root = path.join(SANDBOX_ROOT, moduleId);
  try {
    await fsp.access(root);
    return root;
  } catch {
    // first access
  }
  await fsp.mkdir(root, { recursive: true });
  const seedDir = path.join(SEEDS_ROOT, moduleId);
  try {
    const st = await fsp.stat(seedDir);
    if (st.isDirectory()) await fsp.cp(seedDir, root, { recursive: true });
  } catch {
    // no seed dir — workspace starts empty
  }
  return root;
}

// Recursively list workspace files (skipping dot-entries like .build/).
async function listWorkspaceFiles(root) {
  const out = [];
  async function walk(dir, prefix) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(path.join(dir, e.name), rel);
      } else if (e.isFile()) {
        out.push({ path: rel, content: await fsp.readFile(path.join(dir, e.name), 'utf8') });
      }
    }
  }
  await walk(root, '');
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

// Absolute paths of all non-hidden files in the workspace (for size checks).
async function listWorkspaceFilePaths(root) {
  const out = [];
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile()) out.push(abs);
    }
  }
  await walk(root);
  return out;
}

// Spawn with an argv array (never a shell string). stdin written once, then
// closed. stdout/stderr each capped at MAX_OUTPUT_BYTES. SIGKILL on timeout.
function runProcess(cmd, args, { cwd, stdin = '', timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;

    child.stdout.on('data', (d) => {
      if (stdoutBytes < MAX_OUTPUT_BYTES) {
        const remaining = MAX_OUTPUT_BYTES - stdoutBytes;
        stdout += d.subarray(0, remaining).toString('utf8');
        stdoutBytes += Math.min(d.length, remaining);
      }
    });
    child.stderr.on('data', (d) => {
      if (stderrBytes < MAX_OUTPUT_BYTES) {
        const remaining = MAX_OUTPUT_BYTES - stderrBytes;
        stderr += d.subarray(0, remaining).toString('utf8');
        stderrBytes += Math.min(d.length, remaining);
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (err) => done({ error: err, code: null, signal: null, stdout, stderr, timedOut }));
    child.on('close', (code, signal) => done({ code, signal, stdout, stderr, timedOut }));

    try {
      if (stdin) child.stdin.write(stdin);
      child.stdin.end();
    } catch {
      // child may have already exited; close event will settle
    }
  });
}

// Exit code per contract: signal death => 128 + signal number.
function exitCodeOf(code, signal) {
  if (code !== null && code !== undefined) return code;
  if (signal) {
    const num = os.constants.signals[signal];
    if (typeof num === 'number') return 128 + num;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Content endpoints
// ---------------------------------------------------------------------------

async function handleManifest(res) {
  try {
    const raw = await fsp.readFile(path.join(CONTENT_DIR, 'manifest.json'), 'utf8');
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(raw);
  } catch {
    sendJson(res, 500, { error: 'manifest unavailable' });
  }
}

async function handleModule(res, moduleId) {
  if (!MODULE_ID_RE.test(moduleId)) return sendJson(res, 404, { error: 'unknown module' });
  let manifest;
  try {
    manifest = JSON.parse(await fsp.readFile(path.join(CONTENT_DIR, 'manifest.json'), 'utf8'));
  } catch {
    return sendJson(res, 500, { error: 'manifest unavailable' });
  }
  const mod = (manifest.modules ?? []).find((m) => m.id === moduleId);
  if (!mod) return sendJson(res, 404, { error: 'unknown module' });
  try {
    const markdown = await fsp.readFile(path.join(CONTENT_DIR, mod.file), 'utf8');
    sendJson(res, 200, { id: mod.id, title: mod.title, markdown });
  } catch {
    sendJson(res, 404, { error: 'unknown module' });
  }
}

// ---------------------------------------------------------------------------
// Workspace endpoints
// ---------------------------------------------------------------------------

async function handleListFiles(res, moduleId) {
  const root = await ensureWorkspace(moduleId);
  const files = await listWorkspaceFiles(root);
  sendJson(res, 200, { files });
}

async function handlePutFile(res, moduleId, body) {
  const { path: relPath, content } = body ?? {};
  if (typeof content !== 'string') return sendJson(res, 400, { error: 'content must be a string' });
  const root = await ensureWorkspace(moduleId);
  const abs = jailPath(root, relPath);
  if (!abs || (await escapesViaSymlink(root, abs))) {
    return sendJson(res, 400, { error: 'path escapes workspace' });
  }
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, content, 'utf8');
  sendJson(res, 200, { ok: true });
}

async function handleDeleteFile(res, moduleId, relPath) {
  const root = await ensureWorkspace(moduleId);
  const abs = jailPath(root, relPath);
  if (!abs || (await escapesViaSymlink(root, abs))) {
    return sendJson(res, 400, { error: 'path escapes workspace' });
  }
  try {
    await fsp.unlink(abs);
    sendJson(res, 200, { ok: true });
  } catch {
    sendJson(res, 404, { error: 'file not found' });
  }
}

// ---------------------------------------------------------------------------
// Run endpoint
// ---------------------------------------------------------------------------

function compileFailureResponse(action, diagnostics, timedOut, durationMs) {
  return {
    ok: true,
    action,
    compileOk: false,
    compileDiagnostics: diagnostics,
    exitCode: null,
    stdout: null,
    stderr: null,
    timedOut,
    durationMs,
    artifact: null,
  };
}

async function handleRun(res, body) {
  const { moduleId, action, file, argv = [], stdin = '', flags = {} } = body ?? {};

  if (!MODULE_ID_RE.test(moduleId ?? '')) return sendJson(res, 400, { error: 'invalid moduleId' });
  if (!RUN_ACTIONS.has(action)) return sendJson(res, 400, { error: 'invalid action' });
  if (typeof file !== 'string' || file.length === 0) return sendJson(res, 400, { error: 'invalid file' });

  const opt = String(flags?.opt ?? '0');
  if (!['0', '1', '2'].includes(opt)) return sendJson(res, 400, { error: 'invalid opt' });
  const sanitizers = flags?.sanitizers === true;

  const argvList = Array.isArray(argv) ? argv.map(String) : [];
  const stdinText = typeof stdin === 'string' ? stdin : String(stdin ?? '');

  const root = await ensureWorkspace(moduleId);
  const fileAbs = jailPath(root, file);
  if (!fileAbs || (await escapesViaSymlink(root, fileAbs))) {
    return sendJson(res, 400, { error: 'path escapes workspace' });
  }

  // Reject compiles whose workspace contains files > 1 MB.
  for (const abs of await listWorkspaceFilePaths(root)) {
    const st = await fsp.stat(abs);
    if (st.size > MAX_FILE_BYTES) {
      return sendJson(res, 400, { error: 'workspace contains a file larger than 1 MB' });
    }
  }

  const compileArgs = ['-std=c11', '-Wall', '-Wextra', `-O${opt}`];
  if (sanitizers) compileArgs.push('-g', '-fsanitize=address,undefined');

  const buildDir = path.join(root, '.build');
  await fsp.mkdir(buildDir, { recursive: true });

  const started = Date.now();

  // ---- build-run: compile all .c files in the workspace root together ----
  if (action === 'build-run') {
    const entries = await fsp.readdir(root, { withFileTypes: true });
    const cFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith('.c'))
      .map((e) => e.name)
      .sort();
    if (cFiles.length === 0) return sendJson(res, 400, { error: 'no .c files in workspace root' });

    const binPath = path.join(buildDir, 'a.out');
    const comp = await runProcess('cc', [...compileArgs, ...cFiles, '-o', binPath], { cwd: root });
    if (comp.timedOut) {
      return sendJson(res, 200, compileFailureResponse(action, 'compilation timed out', true, Date.now() - started));
    }
    if (comp.error) {
      return sendJson(res, 200, compileFailureResponse(action, `failed to spawn cc: ${comp.error.message}`, false, Date.now() - started));
    }
    if (comp.code !== 0) {
      return sendJson(res, 200, compileFailureResponse(action, comp.stderr, false, Date.now() - started));
    }

    const run = await runProcess(binPath, argvList, { cwd: root, stdin: stdinText });
    return sendJson(res, 200, {
      ok: true,
      action,
      compileOk: true,
      compileDiagnostics: comp.stderr,
      exitCode: exitCodeOf(run.code, run.signal),
      stdout: run.stdout,
      stderr: run.stderr,
      timedOut: run.timedOut,
      durationMs: Date.now() - started,
      artifact: null,
    });
  }

  // ---- single-file artifact actions ----
  let compile;
  let artifactPath = null;

  if (action === 'preprocess') {
    compile = await runProcess('cc', [...compileArgs, '-E', file], { cwd: root });
  } else if (action === 'assembly') {
    artifactPath = path.join(buildDir, `${path.basename(file)}.s`);
    compile = await runProcess('cc', [...compileArgs, '-S', file, '-o', artifactPath], { cwd: root });
  } else {
    // object
    artifactPath = path.join(buildDir, `${path.basename(file)}.o`);
    compile = await runProcess('cc', [...compileArgs, '-c', file, '-o', artifactPath], { cwd: root });
  }

  if (compile.timedOut) {
    return sendJson(res, 200, compileFailureResponse(action, 'compilation timed out', true, Date.now() - started));
  }
  if (compile.error) {
    return sendJson(res, 200, compileFailureResponse(action, `failed to spawn cc: ${compile.error.message}`, false, Date.now() - started));
  }
  if (compile.code !== 0) {
    return sendJson(res, 200, compileFailureResponse(action, compile.stderr, false, Date.now() - started));
  }

  let artifact;
  if (action === 'preprocess') {
    artifact = compile.stdout;
  } else if (action === 'assembly') {
    artifact = await fsp.readFile(artifactPath, 'utf8');
  } else {
    const nm = await runProcess('nm', [artifactPath], {});
    artifact = nm.error ? `nm failed: ${nm.error.message}` : nm.stdout;
  }

  return sendJson(res, 200, {
    ok: true,
    action,
    compileOk: true,
    compileDiagnostics: compile.stderr,
    exitCode: null,
    stdout: null,
    stderr: null,
    timedOut: false,
    durationMs: Date.now() - started,
    artifact,
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

    // /api/content/book1/manifest
    if (req.method === 'GET'
        && segments.length === 4
        && segments[0] === 'api' && segments[1] === 'content'
        && segments[2] === 'book1' && segments[3] === 'manifest') {
      return await handleManifest(res);
    }

    // /api/content/book1/:moduleId
    if (req.method === 'GET'
        && segments.length === 4
        && segments[0] === 'api' && segments[1] === 'content'
        && segments[2] === 'book1') {
      return await handleModule(res, segments[3]);
    }

    // /api/workspace/:moduleId/files | /api/workspace/:moduleId/file
    if (segments.length === 4 && segments[0] === 'api' && segments[1] === 'workspace') {
      const moduleId = segments[2];
      if (!MODULE_ID_RE.test(moduleId)) return sendJson(res, 400, { error: 'invalid moduleId' });
      const resource = segments[3];

      if (req.method === 'GET' && resource === 'files') {
        return await handleListFiles(res, moduleId);
      }
      if (req.method === 'PUT' && resource === 'file') {
        const raw = await readBody(req);
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          return sendJson(res, 400, { error: 'invalid JSON body' });
        }
        return await handlePutFile(res, moduleId, body);
      }
      if (req.method === 'DELETE' && resource === 'file') {
        return await handleDeleteFile(res, moduleId, url.searchParams.get('path'));
      }
    }

    // /api/run
    if (req.method === 'POST' && segments.length === 2 && segments[0] === 'api' && segments[1] === 'run') {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return sendJson(res, 400, { error: 'invalid JSON body' });
      }
      return await handleRun(res, body);
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
    console.error(err);
  }
});

await fsp.mkdir(SANDBOX_ROOT, { recursive: true });

server.listen(PORT, HOST, () => {
  console.log(`machine-model-studio server listening on http://${HOST}:${PORT}`);
});
