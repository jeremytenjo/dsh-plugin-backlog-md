import { realpath } from 'node:fs/promises';

import { BacklogApiError, BridgeError } from './errors.js';

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/**
 * Thin, typed-by-validation client for the official Backlog.md HTTP API.
 * Only loopback origins are constructed here; callers never supply a URL.
 */
export class BacklogApi {
  /**
   * @param {{port: number, fetchImpl?: typeof fetch, timeoutMs?: number, host?: string}} options
   */
  constructor({ port, fetchImpl = globalThis.fetch, timeoutMs = 20000, host = '127.0.0.1' }) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('A valid Backlog.md server port is required.');
    }
    this.port = port;
    this.host = host;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.origin = `http://${host}:${port}`;
  }

  async request(pathname, { method = 'GET', body, timeoutMs = this.timeoutMs, signal } = {}) {
    if (typeof pathname !== 'string' || !pathname.startsWith('/api/')) {
      throw new Error('The Backlog.md API path is invalid.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    const forwardAbort = () => controller.abort(signal?.reason);
    if (signal) {
      if (signal.aborted) forwardAbort();
      else signal.addEventListener('abort', forwardAbort, { once: true });
    }

    let response;
    try {
      response = await this.fetchImpl(`${this.origin}${pathname}`, {
        method,
        redirect: 'error',
        headers: {
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new BacklogApiError('The Backlog.md server did not respond in time.', {
          code: 'timeout',
        });
      }
      throw new BacklogApiError(
        'The Backlog.md server could not be reached. It may have stopped.',
        { code: 'unreachable', details: error instanceof Error ? error.message : undefined },
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forwardAbort);
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_RESPONSE_BYTES) {
      throw new BacklogApiError('The Backlog.md server returned an unexpectedly large response.', {
        code: 'response-too-large',
        status: response.status,
      });
    }
    let text;
    try {
      text = await response.text();
    } catch {
      throw new BacklogApiError('The Backlog.md response could not be read.', {
        code: 'unreadable',
        status: response.status,
      });
    }
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new BacklogApiError('The Backlog.md server returned an unexpectedly large response.', {
        code: 'response-too-large',
        status: response.status,
      });
    }

    let payload = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new BacklogApiError('The Backlog.md server returned an unreadable response.', {
          code: 'unreadable',
          status: response.status,
        });
      }
    }

    if (!response.ok) {
      const message =
        typeof payload === 'object' && payload && typeof payload.error === 'string'
          ? payload.error
          : `The Backlog.md server returned HTTP ${response.status}.`;
      throw new BacklogApiError(message, {
        status: response.status,
        code: `http-${response.status}`,
        details: typeof payload === 'object' ? payload : undefined,
      });
    }
    return payload;
  }

  status() {
    return this.request('/api/status');
  }

  version() {
    return this.request('/api/version');
  }

  config() {
    return this.request('/api/config');
  }

  statuses() {
    return this.request('/api/statuses');
  }

  async tasks() {
    const payload = await this.request('/api/tasks');
    if (!Array.isArray(payload)) {
      throw new BacklogApiError('The task list returned an unreadable response.', {
        code: 'unreadable',
      });
    }
    return payload.map(normalizeTask);
  }

  async task(id) {
    const payload = await this.request(`/api/task/${encodeURIComponent(id)}`);
    return normalizeTaskDetail(payload);
  }

  async createTask(input) {
    const payload = await this.request('/api/tasks', { method: 'POST', body: input });
    return normalizeTask(payload);
  }

  async updateTask(id, input) {
    const payload = await this.request(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: input,
    });
    return normalizeTask(payload);
  }

  async archiveTask(id) {
    return this.request(`/api/tasks/${encodeURIComponent(id)}/archive`, { method: 'POST' });
  }

  async reorderTask(input) {
    const payload = await this.request('/api/tasks/reorder', { method: 'POST', body: input });
    if (!payload || typeof payload !== 'object') {
      throw new BacklogApiError('The reorder response was unreadable.', { code: 'unreadable' });
    }
    return payload;
  }

  async milestones() {
    const payload = await this.request('/api/milestones');
    if (!Array.isArray(payload)) {
      throw new BacklogApiError('The milestone list returned an unreadable response.', {
        code: 'unreadable',
      });
    }
    return payload.map(normalizeMilestone);
  }

  async createMilestone(input) {
    const payload = await this.request('/api/milestones', { method: 'POST', body: input });
    return normalizeMilestone(payload);
  }

  async search(query, options = {}) {
    const params = new URLSearchParams({ query });
    if (options.limit) params.set('limit', String(options.limit));
    const payload = await this.request(`/api/search?${params.toString()}`);
    if (!Array.isArray(payload)) {
      throw new BacklogApiError('The search response was unreadable.', { code: 'unreadable' });
    }
    return payload;
  }
}

export function assertTaskId(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 160 ||
    !/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/.test(value)
  ) {
    throw new BridgeError('task-id-invalid', 'That task ID is not valid.', { status: 400 });
  }
  return value;
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** Validate the fields the UI reads while preserving newer Backlog.md fields. */
export function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BacklogApiError('The Backlog.md task response was malformed.', {
      code: 'unreadable',
    });
  }
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') {
    throw new BacklogApiError('The Backlog.md task response was missing its ID or title.', {
      code: 'unreadable',
    });
  }
  const task = {
    ...raw,
    id: raw.id,
    title: raw.title,
    status: asString(raw.status, 'To Do'),
    assignee: asStringArray(raw.assignee),
    labels: asStringArray(raw.labels),
    dependencies: asStringArray(raw.dependencies),
    references: asStringArray(raw.references),
    documentation: asStringArray(raw.documentation),
    modifiedFiles: asStringArray(raw.modifiedFiles),
    createdDate: asString(raw.createdDate),
    description: asString(raw.description),
  };
  delete task.filePath;
  delete task.rawContent;
  return task;
}

export function normalizeTaskDetail(raw) {
  const task = normalizeTask(raw);
  if (raw.dependencyGraph !== undefined && typeof raw.dependencyGraph !== 'object') {
    throw new BacklogApiError('The dependency graph was malformed.', { code: 'unreadable' });
  }
  if (raw.readiness !== undefined && typeof raw.readiness !== 'object') {
    throw new BacklogApiError('The readiness report was malformed.', { code: 'unreadable' });
  }
  return task;
}

export function normalizeMilestone(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') {
    throw new BacklogApiError('The Backlog.md milestone response was malformed.', {
      code: 'unreadable',
    });
  }
  return {
    ...raw,
    id: raw.id,
    title: asString(raw.title, raw.id),
    description: asString(raw.description),
  };
}

/**
 * `/api/config` can carry an MCP bearer token. The browser never needs it, so
 * the bridge strips credential-bearing and command-bearing fields.
 */
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BacklogApiError('The Backlog.md configuration was malformed.', {
      code: 'unreadable',
    });
  }
  const config = { ...raw };
  delete config.mcp;
  delete config.onStatusChange;
  config.statuses = asStringArray(config.statuses);
  config.labels = asStringArray(config.labels);
  config.priorities = asStringArray(config.priorities);
  config.types = asStringArray(config.types);
  config.projects = asStringArray(config.projects);
  config.definitionOfDone = asStringArray(config.definitionOfDone);
  return config;
}

/**
 * Check a running server's workspace identity and version. Used both for a
 * managed child and for an already-running server we did not start.
 */
export async function inspectServer({ port, fetchImpl = globalThis.fetch, timeoutMs = 5000 }) {
  const api = new BacklogApi({ port, fetchImpl, timeoutMs });
  const [status, versionPayload, config] = await Promise.all([
    api.status(),
    api.version(),
    api.config().catch(() => null),
  ]);
  if (!status || typeof status !== 'object' || typeof status.projectPath !== 'string') {
    throw new BacklogApiError('The Backlog.md status response was malformed.', {
      code: 'unreadable',
    });
  }
  let projectPath = status.projectPath;
  try {
    projectPath = await realpath(status.projectPath);
  } catch {
    // Keep the reported path; the caller compares canonically when possible.
  }
  return {
    port,
    projectPath,
    initialized: Boolean(status.initialized),
    version: asString(versionPayload?.version),
    config: config ? normalizeConfig(config) : null,
  };
}
