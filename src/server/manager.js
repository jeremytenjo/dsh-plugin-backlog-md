import { realpath } from 'node:fs/promises';
import net from 'node:net';

import { BacklogApi } from './api-client.js';
import { isVersionSupported, MIN_BACKLOG_VERSION } from './cli.js';
import { BacklogApiError, BridgeError, errorMessage } from './errors.js';
import { BacklogEventHub } from './event-hub.js';

const START_TIMEOUT_MS = 25000;
const PROBE_TIMEOUT_MS = 4000;

/** Let the OS choose a free loopback port, then release it for the child. */
export function allocateLoopbackPort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => {
        if (Number.isInteger(port) && port > 0) resolve(port);
        else reject(new Error('Could not allocate a loopback port.'));
      });
    });
  });
}

async function canonicalPath(value) {
  try {
    return await realpath(value);
  } catch {
    return value;
  }
}

function readCollected(reader) {
  if (!reader) return '';
  try {
    return reader.readFrom(0).text;
  } catch {
    return '';
  }
}

function tail(text, limit = 1200) {
  const value = String(text ?? '').trim();
  return value.length > limit ? value.slice(-limit) : value;
}

async function probeServer({ port, fetchImpl, timeoutMs = PROBE_TIMEOUT_MS }) {
  const api = new BacklogApi({ port, fetchImpl, timeoutMs });
  const [status, version] = await Promise.all([api.status(), api.version()]);
  if (!status || typeof status !== 'object' || typeof status.projectPath !== 'string') {
    throw new BacklogApiError('The Backlog.md status response was malformed.', {
      code: 'unreadable',
    });
  }
  return {
    port,
    projectPath: await canonicalPath(status.projectPath),
    initialized: Boolean(status.initialized),
    version: typeof version?.version === 'string' ? version.version : '',
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

/**
 * Owns the official `backlog browser` processes for this Host. One record per
 * canonical project root; unowned servers are observed and never terminated.
 */
export class BacklogServerManager {
  constructor(options = {}) {
    this.spawnServer = options.spawnServer;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.allocatePort = options.allocatePort ?? allocateLoopbackPort;
    this.WebSocketImpl = options.WebSocketImpl ?? globalThis.WebSocket;
    this.logger = options.logger ?? console;
    this.now = options.now ?? Date.now;
    this.startTimeoutMs = options.startTimeoutMs ?? START_TIMEOUT_MS;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60 * 1000;
    this.maxRestarts = options.maxRestarts ?? 3;
    this.restartWindowMs = options.restartWindowMs ?? 10 * 60 * 1000;
    this.records = new Map();
    this.starts = new Map();
    this.crashes = new Map();
    this.generations = new Map();
    this.stopped = false;
    this.idleTimer = setInterval(() => {
      void this.reapIdle();
    }, 60_000);
    if (typeof this.idleTimer.unref === 'function') this.idleTimer.unref();
  }

  get(root) {
    return this.records.get(root) ?? null;
  }

  async ensure({ root, executable, defaultPort }) {
    if (this.stopped)
      throw new BridgeError('shutting-down', 'The plugin is shutting down.', { status: 503 });
    const existing = this.records.get(root);
    if (existing && existing.state === 'ready' && this.now() - existing.lastUsedAt < 2000) {
      existing.lastUsedAt = this.now();
      return existing;
    }
    if (existing) {
      try {
        const probed = await probeServer({
          port: existing.port,
          fetchImpl: this.fetchImpl,
        });
        if (
          probed.projectPath === root &&
          probed.initialized &&
          isVersionSupported(probed.version)
        ) {
          existing.version = probed.version;
          existing.lastUsedAt = this.now();
          existing.state = 'ready';
          return existing;
        }
      } catch {
        // Stale record; fall through and replace it.
      }
      await this.stopRecord(root, { reason: 'stale' });
    }

    if (this.starts.has(root)) {
      await this.starts.get(root);
      const record = this.records.get(root);
      if (record) return record;
    }

    const promise = this.startRecord({ root, executable, defaultPort });
    this.starts.set(root, promise);
    try {
      await promise;
    } finally {
      this.starts.delete(root);
    }
    const record = this.records.get(root);
    if (!record) {
      throw new BridgeError('server-start-failed', 'The Backlog.md server did not start.', {
        status: 502,
      });
    }
    return record;
  }

  async findExisting({ root, defaultPort }) {
    if (!Number.isInteger(defaultPort) || defaultPort < 1 || defaultPort > 65535) return null;
    const current = this.records.get(root);
    if (current) return current;
    try {
      const probed = await probeServer({ port: defaultPort, fetchImpl: this.fetchImpl });
      if (probed.projectPath !== root) return null;
      if (!probed.initialized) return null;
      if (!isVersionSupported(probed.version)) {
        throw new BridgeError(
          'version-unsupported',
          `Backlog.md ${probed.version} is not supported by this plugin. Version ${MIN_BACKLOG_VERSION} or newer 1.x is required.`,
          { status: 409, details: { version: probed.version, minimum: MIN_BACKLOG_VERSION } },
        );
      }
      return this.adoptExisting({
        root,
        port: defaultPort,
        version: probed.version,
      });
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      return null;
    }
  }

  adoptExisting({ root, port, version }) {
    const record = {
      root,
      port,
      version,
      owned: false,
      state: 'ready',
      startedAt: this.now(),
      lastUsedAt: this.now(),
      handle: null,
      hub: null,
      generation: 0,
    };
    record.hub = this.createHub(record);
    record.hub.push('resync', { reason: 'server-adopted' });
    this.records.set(root, record);
    return record;
  }

  createHub(record) {
    const hub = new BacklogEventHub({
      port: record.port,
      WebSocketImpl: this.WebSocketImpl,
      logger: this.logger,
    });
    hub.start();
    return hub;
  }

  checkCrashBudget(root) {
    const now = this.now();
    const history = (this.crashes.get(root) ?? []).filter(
      (stamp) => now - stamp < this.restartWindowMs,
    );
    this.crashes.set(root, history);
    if (history.length >= this.maxRestarts) {
      throw new BridgeError(
        'server-crashed',
        'The Backlog.md server stopped repeatedly. Retry once the project is healthy, or start it manually.',
        { status: 502, details: { restarts: history.length, windowMs: this.restartWindowMs } },
      );
    }
  }

  async startRecord({ root, executable, defaultPort }) {
    if (typeof this.spawnServer !== 'function') {
      throw new BridgeError('server-unavailable', 'This Host cannot start the Backlog.md server.', {
        status: 503,
      });
    }
    this.checkCrashBudget(root);

    const external = await this.findExisting({ root, defaultPort });
    if (external) return external;

    const port = await this.allocatePort();
    const generation = (this.generations.get(root) ?? 0) + 1;
    this.generations.set(root, generation);

    let handle;
    try {
      handle = await this.spawnServer({
        argv: [executable, 'browser', '--port', String(port), '--no-open'],
        cwd: root,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 512 * 1024 },
          stderr: { maxBytes: 512 * 1024 },
        },
        graceMs: 5000,
      });
    } catch (error) {
      throw new BridgeError(
        'server-start-failed',
        'The Backlog.md server process could not be started.',
        { status: 502, details: { cause: errorMessage(error) } },
      );
    }

    const record = {
      root,
      port,
      version: '',
      owned: true,
      state: 'starting',
      startedAt: this.now(),
      lastUsedAt: this.now(),
      handle,
      hub: null,
      generation,
      exited: false,
      stderr: '',
    };

    const exitPromise = Promise.resolve(handle.done)
      .then((outcome) => {
        this.onUnexpectedExit(record, outcome);
      })
      .catch((error) => {
        this.onUnexpectedExit(record, { error });
      });

    const deadline = this.now() + this.startTimeoutMs;
    let candidatePort = port;
    let lastError = null;
    while (this.now() < deadline) {
      if (record.exited) break;
      const stdout = readCollected(handle.collected?.stdout);
      const stderr = readCollected(handle.collected?.stderr);
      record.stderr = tail(stderr);
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(stdout);
      if (match) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) candidatePort = parsed;
      }
      try {
        const probed = await probeServer({
          port: candidatePort,
          fetchImpl: this.fetchImpl,
        });
        if (probed.projectPath !== root) {
          throw new BridgeError(
            'server-workspace-mismatch',
            'A Backlog.md server on this port belongs to a different project.',
            { status: 502 },
          );
        }
        if (!probed.initialized) {
          throw new BridgeError(
            'project-not-initialized',
            'This folder is not an initialized Backlog.md project.',
            { status: 409 },
          );
        }
        if (!isVersionSupported(probed.version)) {
          throw new BridgeError(
            'version-unsupported',
            `Backlog.md ${probed.version} is not supported by this plugin. Version ${MIN_BACKLOG_VERSION} or newer 1.x is required.`,
            { status: 409, details: { version: probed.version, minimum: MIN_BACKLOG_VERSION } },
          );
        }
        record.port = candidatePort;
        record.version = probed.version;
        record.state = 'ready';
        record.lastUsedAt = this.now();
        record.hub = this.createHub(record);
        record.hub.push('resync', { reason: 'server-started' });
        this.records.set(root, record);
        this.logger.info?.(
          `[backlog-md] started Backlog.md ${probed.version} for ${root} on 127.0.0.1:${candidatePort}`,
        );
        return record;
      } catch (error) {
        lastError = error;
        if (error instanceof BridgeError && error.code === 'version-unsupported') break;
      }
      await delay(250);
    }

    if (!record.exited) {
      try {
        await handle.terminate?.();
      } catch {
        // Best effort.
      }
    }
    await Promise.race([exitPromise, delay(1500)]);

    if (record.state !== 'ready') {
      const reason =
        lastError instanceof BridgeError
          ? lastError
          : new BridgeError(
              'server-start-failed',
              'The Backlog.md server did not become ready in time.',
              { status: 502, details: { stderr: record.stderr || undefined } },
            );
      if (reason.code === 'version-unsupported' || reason.code === 'project-not-initialized') {
        throw reason;
      }
      throw new BridgeError(
        'server-start-failed',
        'The Backlog.md server did not become ready. Check that Backlog.md is installed and the project is initialized.',
        {
          status: 502,
          details: {
            cause: reason.message,
            stderr: record.stderr || undefined,
          },
        },
      );
    }
    return record;
  }

  onUnexpectedExit(record, outcome) {
    record.exited = true;
    if (record.state === 'stopping' || this.stopped) return;
    const current = this.records.get(record.root);
    if (current !== record) return;
    const stderr = readCollected(record.handle?.collected?.stderr);
    if (stderr) record.stderr = tail(stderr);
    record.state = 'crashed';
    record.hub?.stop();
    record.hub = null;
    this.records.delete(record.root);
    const history = this.crashes.get(record.root) ?? [];
    history.push(this.now());
    this.crashes.set(record.root, history);
    this.logger.warn?.(
      `[backlog-md] Backlog.md server for ${record.root} exited unexpectedly (${outcome?.exitCode ?? 'unknown'}).`,
    );
  }

  async stopRecord(root, { reason = 'requested' } = {}) {
    const record = this.records.get(root);
    if (!record) return false;
    record.state = 'stopping';
    this.records.delete(root);
    record.hub?.stop();
    record.hub = null;
    if (record.owned && record.handle) {
      try {
        await record.handle.terminate?.();
      } catch (error) {
        this.logger.warn?.(`[backlog-md] could not terminate the server for ${root}:`, error);
      }
      try {
        await Promise.race([record.handle.waitForExit?.(), delay(5000)]);
      } catch {
        // The process may already be gone.
      }
    }
    this.logger.info?.(`[backlog-md] stopped Backlog.md server for ${root} (${reason})`);
    return true;
  }

  async restart(args) {
    const record = this.records.get(args.root);
    if (record?.owned) {
      this.crashes.delete(args.root);
      await this.stopRecord(args.root, { reason: 'restart-requested' });
    } else if (record && !record.owned) {
      // Never kill an adopted server; forget it so ensure can re-probe or
      // replace it with a managed one when it is no longer healthy.
      this.records.delete(args.root);
      record.hub?.stop();
    }
    return this.ensure(args);
  }

  touch(root) {
    const record = this.records.get(root);
    if (record) record.lastUsedAt = this.now();
  }

  async reapIdle() {
    if (this.stopped) return;
    const now = this.now();
    for (const [root, record] of [...this.records]) {
      if (!record.owned) continue;
      if (record.hub && record.hub.waiters?.size > 0) continue;
      if (now - record.lastUsedAt < this.idleTimeoutMs) continue;
      await this.stopRecord(root, { reason: 'idle' });
    }
  }

  async stopAll() {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.idleTimer);
    const roots = [...this.records.keys()];
    await Promise.allSettled(
      roots.map((root) => this.stopRecord(root, { reason: 'plugin-dispose' })),
    );
  }

  publicRecord(record) {
    if (!record) return null;
    return {
      port: record.port,
      version: record.version,
      owned: record.owned,
      state: record.state,
      startedAt: record.startedAt,
      lastUsedAt: record.lastUsedAt,
      connected: record.hub?.getState?.() ?? 'disconnected',
    };
  }
}
