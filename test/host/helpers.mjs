import { execFileSync, spawn } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const backlogBin = join(pluginRoot, 'node_modules/.bin/backlog');

export function backlogAvailable() {
  if (!existsSync(backlogBin)) return false;
  try {
    accessSync(backlogBin, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function runBacklog(args, cwd, options = {}) {
  return execFileSync(backlogBin, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    ...options,
  });
}

export async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

export async function makeProject(name = 'Plugin Test') {
  const root = await mkdtemp(join(tmpdir(), 'dsh-backlog-md-'));
  mkdir(join(root, '.git'), { recursive: true }).catch(() => {});
  const port = await freePort();
  runBacklog(
    [
      'init',
      name,
      '--defaults',
      '--no-git',
      '--agent-instructions',
      'none',
      '--auto-open-browser',
      'false',
      '--web-port',
      String(port),
    ],
    root,
  );
  return {
    root: await realpath(root),
    defaultPort: port,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function createTask(root, args) {
  const output = runBacklog(['task', 'create', ...args], root);
  const match = /Created task ([A-Za-z][A-Za-z0-9_.-]*)/.exec(output);
  if (!match) throw new Error(`Could not read task ID from: ${output}`);
  return match[1];
}

function reader() {
  const chunks = [];
  return {
    push: (chunk) => chunks.push(chunk),
    readFrom: () => ({ text: Buffer.concat(chunks).toString('utf8') }),
  };
}

/**
 * A local stand-in for the Harness subprocess service, used by host tests.
 * It mirrors the handle shape the plugin consumes.
 */
export function spawnAdapter(spec) {
  const child = spawn(spec.argv[0], spec.argv.slice(1), {
    cwd: spec.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    env: process.env,
  });
  const stdout = reader();
  const stderr = reader();
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  let exited = false;
  const done = new Promise((resolveDone) => {
    child.on('exit', (code, signal) => {
      exited = true;
      resolveDone({ exitCode: code, signal });
    });
    child.on('error', (error) => {
      exited = true;
      resolveDone({ exitCode: null, signal: null, error });
    });
  });
  return {
    done,
    collected: { stdout, stderr },
    terminate: async () => {
      if (exited) return;
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch {
        // The process may already be gone.
      }
    },
    waitForExit: async () => {
      await done;
    },
  };
}

export function makeCtx({
  root,
  sessionId = 'session-test',
  executable = backlogBin,
  origin = 'http://127.0.0.1:1234',
}) {
  const session = { id: sessionId };
  return {
    sessions: {
      get: (id) =>
        id === sessionId ||
        id === sessionId.replace(/^session-/, '') ||
        id === `session-${sessionId}`
          ? session
          : undefined,
    },
    workingDirectory: { get: () => root },
    webServer: { getOrigin: () => origin },
    subprocess: {
      spawn: spawnAdapter,
      resolveExecutable: async (name) => {
        if (name === 'backlog') return executable;
        throw new Error(`not found: ${name}`);
      },
    },
  };
}

export async function waitFor(fn, { timeoutMs = 15000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, intervalMs));
  }
  throw lastError ?? new Error('Timed out waiting for condition.');
}

export async function waitForHealth(port, timeoutMs = 15000) {
  return waitFor(
    async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/status`);
      if (!response.ok) return false;
      const data = await response.json();
      return data.initialized ? data : false;
    },
    { timeoutMs },
  );
}

export function fakeResponse() {
  const result = { status: 0, headers: {}, body: '' };
  return {
    result,
    res: {
      writableEnded: false,
      writeHead(status, headers) {
        result.status = status;
        result.headers = headers;
      },
      end(body) {
        result.body = body ? body.toString() : '';
        this.writableEnded = true;
      },
    },
  };
}

export function fakeRequest({
  remoteAddress = '127.0.0.1',
  origin = 'http://127.0.0.1:1234',
  method = 'POST',
  body = {},
} = {}) {
  const listeners = new Map();
  const req = {
    method,
    headers: {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
    },
    socket: { remoteAddress },
    on(event, handler) {
      listeners.set(event, handler);
      return req;
    },
    once(event, handler) {
      listeners.set(event, handler);
      return req;
    },
    destroy() {},
  };
  process.nextTick(() => {
    const payload = Buffer.from(JSON.stringify(body));
    listeners.get('data')?.(payload);
    listeners.get('end')?.();
  });
  return { req };
}
