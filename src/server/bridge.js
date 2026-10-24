import { createHash } from 'node:crypto';

import { assertTaskId, BacklogApi, normalizeConfig } from './api-client.js';
import {
  isVersionSupported,
  MIN_BACKLOG_VERSION,
  readBacklogVersion,
  runBacklogCli,
  TESTED_BACKLOG_VERSION,
} from './cli.js';
import { BacklogApiError, BridgeError, errorMessage } from './errors.js';
import {
  canonicalDirectory,
  findBacklogProject,
  projectCandidate,
  resolveBacklogExecutable,
} from './project.js';

const ROUTE_PATH = '/__dsh/backlog-md';
const MAX_BODY_BYTES = 512 * 1024;
const EVENT_WAIT_MS = 12000;
const INSTALL_CACHE_MS = 1000;

const INSTALL_COMMANDS = [
  'npm install --save-dev backlog.md',
  'pnpm add -D backlog.md',
  'npm install -g backlog.md',
];

const INIT_COMMANDS = ['backlog init', 'backlog init --defaults'];

function sendJson(res, status, payload) {
  if (res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendOk(res, data) {
  sendJson(res, 200, { ok: true, data });
}

function assertSameOrigin(ctx, req) {
  const address = req.socket?.remoteAddress;
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') {
    throw new BridgeError(
      'loopback-only',
      'This action is only available over the local connection.',
      {
        status: 403,
      },
    );
  }
  let expected;
  try {
    expected = ctx.webServer.getOrigin();
  } catch {
    throw new BridgeError('server-not-ready', 'The Harness web server is not ready yet.', {
      status: 503,
    });
  }
  const origin = req.headers.origin;
  if (origin && origin !== expected) {
    throw new BridgeError('cross-origin', 'This request came from a different origin.', {
      status: 403,
    });
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    throw new BridgeError('cross-origin', 'Cross-site requests are not allowed.', {
      status: 403,
    });
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let total = 0;
    const chunks = [];
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        fail(new BridgeError('body-too-large', 'The request is too large.', { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        const value = text ? JSON.parse(text) : {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('not an object');
        }
        resolve(value);
      } catch {
        reject(
          new BridgeError('invalid-json', 'The request body is not valid JSON.', { status: 400 }),
        );
      }
    });
    req.on('error', (error) => fail(error));
    req.on('aborted', () =>
      fail(new BridgeError('aborted', 'The request was aborted.', { status: 499 })),
    );
  });
}

function workspaceKey(root) {
  return createHash('sha256').update(root).digest('hex').slice(0, 24);
}

function asVersion(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireString(value, name, max = 500) {
  if (typeof value !== 'string') {
    throw new BridgeError('invalid-input', `${name} must be a string.`, { status: 400 });
  }
  if (value.length > max) {
    throw new BridgeError('invalid-input', `${name} is too long.`, { status: 400 });
  }
  return value;
}

function optionalString(value, name, max = 500) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return requireString(value, name, max);
}

function stringArray(value, name, { maxItems = 100, maxLength = 500 } = {}) {
  if (!Array.isArray(value)) {
    throw new BridgeError('invalid-input', `${name} must be a list.`, { status: 400 });
  }
  if (value.length > maxItems) {
    throw new BridgeError('invalid-input', `${name} has too many entries.`, { status: 400 });
  }
  return value.map((item) => requireString(item, `${name} entry`, maxLength));
}

function optionalStringArray(value, name, options) {
  if (value === undefined) return undefined;
  return stringArray(value, name, options);
}

function numberArray(value, name, maxItems = 200) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new BridgeError('invalid-input', `${name} must be a bounded list of indexes.`, {
      status: 400,
    });
  }
  return value.map((item) => {
    if (typeof item !== 'number' || !Number.isFinite(item) || item < 0) {
      throw new BridgeError('invalid-input', `${name} must contain non-negative indexes.`, {
        status: 400,
      });
    }
    return Math.floor(item);
  });
}

function sanitizeAcceptance(value) {
  if (!Array.isArray(value) || value.length > 200) {
    throw new BridgeError('invalid-input', 'Acceptance criteria must be a bounded list.', {
      status: 400,
    });
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        throw new BridgeError('invalid-input', 'Each acceptance criterion must be an object.', {
          status: 400,
        });
      }
      const text = requireString(item.text, 'Criterion text', 2000).trim();
      return { text, checked: Boolean(item.checked) };
    })
    .filter((item) => item.text.length > 0);
}

function sanitizeCreateTask(body) {
  const input = {
    title: requireString(body.title, 'Title', 500),
  };
  const description = optionalString(body.description, 'Description', 200000);
  if (description !== undefined) input.description = description;
  const status = optionalString(body.status, 'Status', 100);
  if (status) input.status = status;
  const priority = optionalString(body.priority, 'Priority', 100);
  if (priority) input.priority = priority;
  const type = optionalString(body.type, 'Type', 100);
  if (type) input.type = type;
  const project = optionalString(body.project, 'Project', 100);
  if (project) input.project = project;
  const milestone = optionalString(body.milestone, 'Milestone', 200);
  if (milestone) input.milestone = milestone;
  const dueDate = optionalString(body.dueDate, 'Due date', 40);
  if (dueDate) input.dueDate = dueDate;
  if (body.assignee !== undefined)
    input.assignee = stringArray(body.assignee, 'Assignees', { maxLength: 200 });
  if (body.labels !== undefined)
    input.labels = stringArray(body.labels, 'Labels', { maxLength: 200 });
  if (body.dependencies !== undefined) {
    input.dependencies = stringArray(body.dependencies, 'Dependencies', { maxLength: 160 }).map(
      assertTaskId,
    );
  }
  if (body.parentTaskId !== undefined && body.parentTaskId !== null) {
    input.parentTaskId = assertTaskId(requireString(body.parentTaskId, 'Parent task', 160));
  }
  if (body.acceptanceCriteriaItems !== undefined) {
    input.acceptanceCriteriaItems = sanitizeAcceptance(body.acceptanceCriteriaItems);
  }
  return input;
}

function sanitizeUpdateTask(body) {
  const input = {};
  const assign = (name, value) => {
    if (value !== undefined) input[name] = value;
  };
  assign('title', optionalString(body.title, 'Title', 500));
  assign('description', optionalString(body.description, 'Description', 200000));
  assign('status', optionalString(body.status, 'Status', 100));
  assign('priority', optionalString(body.priority, 'Priority', 100));
  assign('type', optionalString(body.type, 'Type', 100));
  assign('project', optionalString(body.project, 'Project', 100));
  assign('milestone', optionalString(body.milestone, 'Milestone', 200));
  assign('dueDate', optionalString(body.dueDate, 'Due date', 40));
  assign(
    'implementationPlan',
    optionalString(body.implementationPlan, 'Implementation plan', 200000),
  );
  assign(
    'implementationNotes',
    optionalString(body.implementationNotes, 'Implementation notes', 200000),
  );
  assign('finalSummary', optionalString(body.finalSummary, 'Final summary', 200000));
  assign('assignee', optionalStringArray(body.assignee, 'Assignees', { maxLength: 200 }));
  assign('labels', optionalStringArray(body.labels, 'Labels', { maxLength: 200 }));
  assign('references', optionalStringArray(body.references, 'References', { maxLength: 1000 }));
  assign(
    'documentation',
    optionalStringArray(body.documentation, 'Documentation', { maxLength: 1000 }),
  );
  assign(
    'modifiedFiles',
    optionalStringArray(body.modifiedFiles, 'Modified files', { maxLength: 2000 }),
  );
  if (body.dependencies !== undefined) {
    input.dependencies = stringArray(body.dependencies, 'Dependencies', { maxLength: 160 }).map(
      assertTaskId,
    );
  }
  if (body.acceptanceCriteriaItems !== undefined) {
    input.acceptanceCriteriaItems = sanitizeAcceptance(body.acceptanceCriteriaItems);
  }
  if (body.definitionOfDoneAdd !== undefined) {
    input.definitionOfDoneAdd = stringArray(body.definitionOfDoneAdd, 'Definition of Done', {
      maxLength: 2000,
    });
  }
  if (body.definitionOfDoneRemove !== undefined) {
    input.definitionOfDoneRemove = numberArray(
      body.definitionOfDoneRemove,
      'Definition of Done removal',
    );
  }
  if (body.definitionOfDoneCheck !== undefined) {
    input.definitionOfDoneCheck = numberArray(
      body.definitionOfDoneCheck,
      'Definition of Done check',
    );
  }
  if (body.definitionOfDoneUncheck !== undefined) {
    input.definitionOfDoneUncheck = numberArray(
      body.definitionOfDoneUncheck,
      'Definition of Done uncheck',
    );
  }
  if (body.commentsAppend !== undefined) {
    input.commentsAppend = stringArray(body.commentsAppend, 'Comments', { maxLength: 10000 });
  }
  if (body.commentAuthor !== undefined) {
    input.commentAuthor = requireString(body.commentAuthor, 'Comment author', 200);
  }
  if (Object.keys(input).length === 0) {
    throw new BridgeError('invalid-input', 'There are no changes to save.', { status: 400 });
  }
  return input;
}

function sanitizeReorder(body) {
  const input = {
    taskId: assertTaskId(requireString(body.taskId, 'Task', 160)),
    targetStatus: requireString(body.targetStatus, 'Target status', 100),
    orderedTaskIds: stringArray(body.orderedTaskIds, 'Ordered tasks', { maxLength: 160 }).map(
      assertTaskId,
    ),
  };
  if (body.targetMilestone !== undefined) {
    input.targetMilestone =
      body.targetMilestone === null
        ? null
        : requireString(body.targetMilestone, 'Target milestone', 200);
  }
  return input;
}

function installHint(code) {
  if (code === 'not-installed')
    return 'Install Backlog.md in this project or on your PATH, then retry.';
  if (code === 'not-initialized')
    return 'Initialize this folder as a Backlog.md project, then retry.';
  if (code === 'version-unsupported') return 'Upgrade Backlog.md to a supported 1.x release.';
  if (code === 'server-crashed')
    return 'Retry, or start `backlog browser` manually to inspect the failure.';
  if (code === 'server-start-failed')
    return 'Check that Backlog.md can start in this project, then retry.';
  if (code === 'server-unreachable')
    return 'The server stopped responding. Retry to start it again.';
  return undefined;
}

function safeDetails(error) {
  const details = error?.details;
  if (!details || typeof details !== 'object') return undefined;
  const allowed = ['state', 'version', 'minimum', 'restarts', 'reason', 'code'];
  const out = {};
  for (const key of allowed) {
    if (details[key] !== undefined) out[key] = details[key];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function mapApiError(error) {
  if (!(error instanceof BacklogApiError)) {
    return new BridgeError('backlog-error', errorMessage(error, 'The Backlog.md request failed.'), {
      status: 502,
    });
  }
  if (error.code === 'timeout') {
    return new BridgeError('backlog-timeout', 'The Backlog.md server did not respond in time.', {
      status: 504,
    });
  }
  if (error.code === 'unreachable') {
    return new BridgeError(
      'server-unreachable',
      'The Backlog.md server could not be reached. Retry to start it again.',
      { status: 502 },
    );
  }
  if (error.status === 404) {
    return new BridgeError('not-found', error.message, { status: 404 });
  }
  if (error.status === 409) {
    return new BridgeError('conflict', error.message, { status: 409 });
  }
  if (error.status && error.status >= 400 && error.status < 500) {
    return new BridgeError('invalid', error.message, { status: 400 });
  }
  return new BridgeError('backlog-error', 'Backlog.md could not complete the request.', {
    status: 502,
  });
}

/**
 * The only browser-facing surface. It resolves the Session's workspace itself,
 * starts or reuses its server, and proxies a fixed set of Backlog.md actions.
 */
export class BacklogBridge {
  constructor({ ctx, manager, fetchImpl = globalThis.fetch, logger = console, now = Date.now }) {
    this.ctx = ctx;
    this.manager = manager;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.now = now;
    this.installCache = new Map();
  }

  handle = async (req, res) => {
    try {
      if (req.method !== 'POST') {
        throw new BridgeError('method-not-allowed', 'Only POST is supported.', { status: 405 });
      }
      assertSameOrigin(this.ctx, req);
      if (
        !String(req.headers['content-type'] || '')
          .toLowerCase()
          .startsWith('application/json')
      ) {
        throw new BridgeError('content-type', 'Content-Type must be application/json.', {
          status: 415,
        });
      }
      const body = await readJsonBody(req);
      const action = typeof body.action === 'string' ? body.action : '';
      if (action === 'events') {
        await this.handleEvents(req, res, body);
        return;
      }
      const data = await this.dispatch(action, body);
      sendOk(res, data);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  handleError(res, error) {
    if (res.writableEnded) return;
    if (error instanceof BridgeError) {
      sendJson(res, error.status, {
        ok: false,
        code: error.code,
        error: error.message,
        hint: installHint(error.code),
        details: safeDetails(error),
      });
      return;
    }
    if (error instanceof BacklogApiError) {
      const mapped = mapApiError(error);
      sendJson(res, mapped.status, {
        ok: false,
        code: mapped.code,
        error: mapped.message,
        hint: installHint(mapped.code),
      });
      return;
    }
    this.logger.error?.('[backlog-md] bridge request failed', error);
    sendJson(res, 500, {
      ok: false,
      code: 'internal',
      error: 'The Backlog.md request failed unexpectedly.',
      hint: 'Retry. If it keeps failing, reload the plugin.',
    });
  }

  async dispatch(action, body) {
    if (action === 'status') {
      const inspected = await this.inspect(body.sessionId);
      return inspected.public;
    }
    const prepared = await this.prepare(body.sessionId);
    switch (action) {
      case 'tasks.list':
        return { tasks: await prepared.api.tasks() };
      case 'tasks.get':
        return { task: await prepared.api.task(assertTaskId(body.taskId)) };
      case 'tasks.create': {
        const task = await prepared.api.createTask(sanitizeCreateTask(body));
        return { task };
      }
      case 'tasks.update': {
        const task = await prepared.api.updateTask(
          assertTaskId(body.taskId),
          sanitizeUpdateTask(body.changes ?? {}),
        );
        return { task };
      }
      case 'tasks.archive': {
        await prepared.api.archiveTask(assertTaskId(body.taskId));
        return { archived: true };
      }
      case 'tasks.delete': {
        const taskId = assertTaskId(body.taskId);
        try {
          await prepared.api.archiveTask(taskId);
        } catch (error) {
          // The task may already be archived (the official API then refuses to
          // archive it again). The CLI delete below is the authoritative step.
          if (!(error instanceof BacklogApiError)) throw error;
        }
        const result = await runBacklogCli({
          spawn: (spec) => this.ctx.subprocess.spawn(spec),
          executable: prepared.install.path,
          args: ['task', 'delete', taskId],
          cwd: prepared.project.root,
          timeoutMs: 30000,
        });
        if (result.code !== 0) {
          this.logger.warn?.('[backlog-md] permanent delete failed', result.stderr);
          throw new BridgeError(
            'delete-failed',
            'The task was archived, but Backlog.md would not delete it permanently. It may still have subtasks or links.',
            { status: 409 },
          );
        }
        return { archived: true, deleted: true };
      }
      case 'tasks.reorder':
        return await prepared.api.reorderTask(sanitizeReorder(body));
      case 'milestones.list':
        return { milestones: await prepared.api.milestones() };
      case 'milestones.create': {
        const title = requireString(body.title, 'Milestone title', 200).trim();
        if (!title) {
          throw new BridgeError('invalid-input', 'A milestone title is required.', { status: 400 });
        }
        const milestone = await prepared.api.createMilestone({
          title,
          description:
            optionalString(body.description, 'Milestone description', 100000) ?? undefined,
          dueDate: optionalString(body.dueDate, 'Milestone due date', 40) ?? undefined,
        });
        return { milestone };
      }
      case 'search':
        return {
          results: await prepared.api.search(requireString(body.query, 'Query', 500), {
            limit: 50,
          }),
        };
      case 'server.restart': {
        const record = await this.manager.restart({
          root: prepared.project.root,
          executable: prepared.install.path,
          defaultPort: prepared.project.defaultPort,
        });
        return {
          server: {
            version: record.version,
            managed: record.owned,
            connected: record.hub?.getState?.() ?? 'disconnected',
          },
        };
      }
      default:
        throw new BridgeError('unknown-action', 'Unknown Backlog.md action.', { status: 400 });
    }
  }

  async handleEvents(req, res, body) {
    const prepared = await this.prepare(body.sessionId);
    const hub = prepared.record.hub;
    if (!hub) {
      throw new BridgeError('server-starting', 'The Backlog.md server is still starting.', {
        status: 503,
      });
    }
    this.manager.touch(prepared.project.root);
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.once('close', abort);
    req.once('aborted', abort);
    const since = Number.isFinite(Number(body.since)) ? Number(body.since) : 0;
    let result;
    try {
      result = await hub.wait({ since, timeoutMs: EVENT_WAIT_MS, signal: controller.signal });
    } finally {
      res.removeListener('close', abort);
      req.removeListener('aborted', abort);
    }
    this.manager.touch(prepared.project.root);
    sendOk(res, {
      ...result,
      connection: {
        state: hub.getState(),
        seq: hub.lastSeq,
      },
    });
  }

  async resolveSession(sessionId) {
    if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 256) {
      throw new BridgeError('session-required', 'A valid Harness session is required.', {
        status: 400,
      });
    }
    const candidates = [sessionId];
    if (sessionId.startsWith('session-')) candidates.push(sessionId.slice('session-'.length));
    else candidates.push(`session-${sessionId}`);
    let session = null;
    for (const candidate of candidates) {
      try {
        session = this.ctx.sessions.get(candidate);
      } catch {
        session = null;
      }
      if (session) break;
    }
    if (!session) {
      throw new BridgeError(
        'session-missing',
        'This session is no longer live. Reload the page and try again.',
        { status: 404 },
      );
    }
    const cwd = this.ctx.workingDirectory.get(session);
    if (typeof cwd !== 'string' || !cwd) {
      throw new BridgeError('workspace-invalid', 'This session has no usable working directory.', {
        status: 409,
      });
    }
    return { session, cwd: await canonicalDirectory(cwd) };
  }

  async inspectInstall(projectRoot, cwd) {
    const cacheKey = `${projectRoot}\0${cwd}`;
    const cached = this.installCache.get(cacheKey);
    if (cached && this.now() - cached.at < INSTALL_CACHE_MS) return cached.value;
    const resolved = await resolveBacklogExecutable({
      projectRoot,
      cwd,
      resolveExecutable: (name) =>
        this.ctx.subprocess.resolveExecutable(name, undefined, undefined),
    });
    let value = null;
    if (resolved) {
      try {
        const { version } = await readBacklogVersion({
          spawn: (spec) => this.ctx.subprocess.spawn(spec),
          executable: resolved.path,
          cwd: projectRoot,
        });
        value = { path: resolved.path, source: resolved.source, version: asVersion(version) };
      } catch (error) {
        this.logger.warn?.('[backlog-md] could not read the Backlog.md version', error);
        value = { path: resolved.path, source: resolved.source, version: null };
      }
    }
    this.installCache.set(cacheKey, { at: this.now(), value });
    return value;
  }

  async inspect(rawSessionId, { includeConfig = true } = {}) {
    const { cwd } = await this.resolveSession(rawSessionId);
    const found = await findBacklogProject(cwd);
    const project = found ?? (await projectCandidate(cwd));
    const key = workspaceKey(project.root);
    const workspace = {
      key,
      name: project.projectName || project.folder,
      folder: project.folder,
      initialized: Boolean(found),
    };
    const compatibility = {
      minimum: MIN_BACKLOG_VERSION,
      tested: TESTED_BACKLOG_VERSION,
    };
    const install = await this.inspectInstall(project.root, cwd);

    if (!install) {
      return {
        internal: null,
        public: {
          state: 'not-installed',
          workspace,
          compatibility,
          installCommands: INSTALL_COMMANDS,
          hint: 'Install Backlog.md in this project or on your PATH, then retry.',
        },
      };
    }
    if (!install.version) {
      return {
        internal: null,
        public: {
          state: 'not-installed',
          workspace,
          compatibility,
          installCommands: INSTALL_COMMANDS,
          hint: 'Backlog.md was found but its version could not be read. Reinstall it, then retry.',
        },
      };
    }
    if (!isVersionSupported(install.version)) {
      return {
        internal: null,
        public: {
          state: 'incompatible',
          workspace,
          compatibility,
          detectedVersion: install.version,
          hint: `Backlog.md ${install.version} is not supported. Install version ${MIN_BACKLOG_VERSION} or newer 1.x.`,
        },
      };
    }
    if (!found) {
      return {
        internal: null,
        public: {
          state: 'not-initialized',
          workspace,
          compatibility,
          backlogVersion: install.version,
          initCommands: INIT_COMMANDS,
          hint: 'Initialize this folder as a Backlog.md project, then retry.',
        },
      };
    }

    let record;
    try {
      record = await this.manager.ensure({
        root: project.root,
        executable: install.path,
        defaultPort: project.defaultPort,
      });
    } catch (error) {
      if (error instanceof BridgeError) {
        const state =
          error.code === 'version-unsupported'
            ? 'incompatible'
            : error.code === 'project-not-initialized'
              ? 'not-initialized'
              : 'error';
        return {
          internal: null,
          public: {
            state,
            workspace,
            compatibility,
            code: error.code,
            error: error.message,
            hint: installHint(error.code),
            details: safeDetails(error),
            ...(error.code === 'version-unsupported'
              ? { detectedVersion: error.details?.version, installCommands: INSTALL_COMMANDS }
              : {}),
            ...(error.code === 'project-not-initialized' ? { initCommands: INIT_COMMANDS } : {}),
          },
        };
      }
      this.logger.error?.('[backlog-md] could not start the Backlog.md server', error);
      return {
        internal: null,
        public: {
          state: 'error',
          workspace,
          compatibility,
          code: 'server-start-failed',
          error: 'The Backlog.md server could not be started.',
          hint: installHint('server-start-failed'),
        },
      };
    }

    const api = new BacklogApi({ port: record.port, fetchImpl: this.fetchImpl });
    let config = null;
    let statuses = [];
    if (includeConfig) {
      try {
        config = normalizeConfig(await api.config());
      } catch {
        // The content store can still be warming up; tasks list will initialize it.
      }
      try {
        const result = await api.statuses();
        if (Array.isArray(result)) statuses = result.filter((item) => typeof item === 'string');
      } catch {
        if (Array.isArray(config?.statuses)) statuses = config.statuses;
      }
      if (statuses.length === 0 && Array.isArray(config?.statuses)) statuses = config.statuses;
    }

    const internal = { project, install, record, api, config, statuses };
    return {
      internal,
      public: {
        state: 'ready',
        workspace,
        compatibility,
        backlogVersion: record.version || install.version,
        executable: { source: install.source },
        server: {
          version: record.version || install.version,
          managed: record.owned,
          connected: record.hub?.getState?.() ?? 'disconnected',
        },
        config: config ?? {
          projectName: workspace.name,
          statuses,
          labels: [],
          priorities: [],
        },
        statuses,
      },
    };
  }

  async prepare(sessionId) {
    const inspected = await this.inspect(sessionId, { includeConfig: false });
    if (inspected.public.state !== 'ready' || !inspected.internal) {
      throw new BridgeError('not-ready', 'Backlog.md is not ready for this workspace.', {
        status: 409,
        details: { state: inspected.public.state },
      });
    }
    return inspected.internal;
  }
}

export { INIT_COMMANDS, INSTALL_COMMANDS, ROUTE_PATH };
