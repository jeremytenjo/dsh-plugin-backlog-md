import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BacklogBridge } from '../../src/server/bridge.js';
import { BridgeError } from '../../src/server/errors.js';
import { BacklogServerManager } from '../../src/server/manager.js';
import {
  backlogAvailable,
  createTask,
  fakeRequest,
  fakeResponse,
  makeCtx,
  makeProject,
  spawnAdapter,
  waitFor,
} from './helpers.mjs';

const skip = !backlogAvailable();
const logger = { info() {}, warn() {}, error() {} };

async function httpCall(bridge, options) {
  const { req } = fakeRequest(options);
  const { res, result } = fakeResponse();
  await bridge.handle(req, res);
  return { ...result, json: result.body ? JSON.parse(result.body) : null };
}

test('bridge owns workspace discovery, task CRUD, hierarchy, security, and live events', {
  skip,
}, async () => {
  const project = await makeProject('Bridge Test');
  const parent = await createTask(project.root, [
    'Parent task',
    '--status',
    'To Do',
    '--priority',
    'high',
    '--labels',
    'ui,api',
    '--assignee',
    'alice',
    '--acceptance-criteria',
    'Criterion A',
    '--description',
    'Parent description',
  ]);
  const child = await createTask(project.root, [
    'Child task',
    '--status',
    'Done',
    '--parent',
    parent,
    '--labels',
    'ui',
  ]);

  const server = new BacklogServerManager({ spawnServer: spawnAdapter, logger });
  const ctx = makeCtx({ root: project.root });
  const bridge = new BacklogBridge({ ctx, manager: server, logger });
  try {
    const inspected = await bridge.inspect('session-test');
    assert.equal(inspected.public.state, 'ready');
    assert.equal(inspected.public.workspace.name, 'Bridge Test');
    assert.equal(inspected.public.workspace.initialized, true);
    assert.equal(inspected.public.workspace.key.length, 24);
    assert.equal(
      inspected.public.workspace.root,
      undefined,
      'the browser never receives the raw root',
    );
    assert.equal(inspected.public.server.managed, true);
    assert.equal(inspected.public.backlogVersion, '1.55.3');
    assert.deepEqual(inspected.public.statuses, ['To Do', 'In Progress', 'Done']);
    assert.equal(inspected.public.config.mcp, undefined);

    const list = await bridge.dispatch('tasks.list', { sessionId: 'session-test' });
    assert.equal(list.tasks.length, 2);
    const parentTask = list.tasks.find((task) => task.id === parent);
    const childTask = list.tasks.find((task) => task.id === child);
    assert.equal(parentTask.title, 'Parent task');
    assert.equal(childTask.parentTaskId, parent);
    assert.equal(parentTask.filePath, undefined);
    assert.equal(parentTask.rawContent, undefined);

    const detail = await bridge.dispatch('tasks.get', {
      sessionId: 'session-test',
      taskId: parent,
    });
    assert.ok(detail.task.dependencyGraph);
    assert.equal(detail.task.description, 'Parent description');

    const created = await bridge.dispatch('tasks.create', {
      sessionId: 'session-test',
      title: 'Created through the bridge',
      description: 'Created body',
      status: 'In Progress',
      priority: 'medium',
      assignee: ['bob'],
      labels: ['api'],
      parentTaskId: parent,
      acceptanceCriteriaItems: [{ text: 'Created criterion', checked: false }],
    });
    assert.equal(created.task.title, 'Created through the bridge');
    assert.equal(created.task.parentTaskId, parent);
    assert.equal(created.task.status, 'In Progress');
    assert.equal(created.task.priority, 'medium');

    const updated = await bridge.dispatch('tasks.update', {
      sessionId: 'session-test',
      taskId: created.task.id,
      changes: {
        title: 'Updated through the bridge',
        status: 'Done',
        labels: ['api', 'sync'],
        dependencies: [parent],
      },
    });
    assert.equal(updated.task.title, 'Updated through the bridge');
    assert.equal(updated.task.status, 'Done');
    assert.deepEqual(updated.task.labels, ['api', 'sync']);
    assert.deepEqual(updated.task.dependencies, [parent]);
    assert.equal(updated.task.description, 'Created body', 'unrelated metadata is preserved');
    assert.equal(updated.task.acceptanceCriteriaItems?.[0]?.text, 'Created criterion');

    const afterUpdate = await bridge.dispatch('tasks.get', {
      sessionId: 'session-test',
      taskId: created.task.id,
    });
    assert.equal(afterUpdate.task.title, 'Updated through the bridge');

    // A different session resolves through the same workspace and reuses the same server.
    const other = makeCtx({ root: project.root, sessionId: 'session-other' });
    const otherBridge = new BacklogBridge({ ctx: other, manager: server, logger });
    const firstPort = server.get(project.root).port;
    const otherStatus = await otherBridge.inspect('session-other');
    assert.equal(otherStatus.public.workspace.key, inspected.public.workspace.key);
    assert.equal(server.get(project.root).port, firstPort, 'the same workspace reuses one server');

    // Live event relay: a CLI edit must reach the Host WebSocket subscriber.
    const record = server.get(project.root);
    await waitFor(() => record.hub.getState() === 'live', { timeoutMs: 5000 });
    const since = record.hub.lastSeq;
    const waiting = record.hub.wait({ since, timeoutMs: 5000 });
    createTask(project.root, ['Agent-created task', '--status', 'To Do']);
    const notified = await waiting;
    assert.ok(
      notified.events.some((event) => event.type === 'tasks-updated'),
      'the Backlog.md WebSocket notification must be relayed',
    );

    // Archive and permanent delete both go through official surfaces.
    await bridge.dispatch('tasks.archive', {
      sessionId: 'session-test',
      taskId: created.task.id,
    });
    const afterArchive = await bridge.dispatch('tasks.list', { sessionId: 'session-test' });
    assert.equal(
      afterArchive.tasks.some((task) => task.id === created.task.id),
      false,
    );
    await bridge.dispatch('tasks.delete', {
      sessionId: 'session-test',
      taskId: created.task.id,
    });
    await assert.rejects(
      () =>
        bridge.dispatch('tasks.get', {
          sessionId: 'session-test',
          taskId: created.task.id,
        }),
      (error) => error.name === 'BacklogApiError' && error.status === 404,
    );

    // Missing tasks are actionable errors in HTTP responses.
    const missing = await httpCall(bridge, {
      body: { action: 'tasks.get', sessionId: 'session-test', taskId: 'TASK-999' },
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.json.code, 'not-found');

    // Browser trust fence: loopback + same-origin only.
    const remote = await httpCall(bridge, {
      remoteAddress: '10.0.0.9',
      body: { action: 'status', sessionId: 'session-test' },
    });
    assert.equal(remote.status, 403);
    assert.equal(remote.json.code, 'loopback-only');

    const crossOrigin = await httpCall(bridge, {
      origin: 'http://evil.example',
      body: { action: 'status', sessionId: 'session-test' },
    });
    assert.equal(crossOrigin.status, 403);
    assert.equal(crossOrigin.json.code, 'cross-origin');

    const wrongMethod = await httpCall(bridge, {
      method: 'GET',
      body: { action: 'status', sessionId: 'session-test' },
    });
    assert.equal(wrongMethod.status, 405);

    const ok = await httpCall(bridge, {
      body: { action: 'status', sessionId: 'session-test' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.ok, true);
    assert.equal(ok.json.data.workspace.name, 'Bridge Test');
    assert.equal(ok.json.data.workspace.root, undefined);

    const unknown = await httpCall(bridge, {
      body: { action: 'not-a-real-action', sessionId: 'session-test' },
    });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.json.code, 'unknown-action');
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    throw error;
  } finally {
    await server.stopAll();
    await project.cleanup();
  }
});

test('bridge reports missing installations and uninitialized workspaces without starting a server', {
  skip,
}, async () => {
  const project = await makeProject('Setup states');
  const server = new BacklogServerManager({ spawnServer: spawnAdapter, logger });
  try {
    const missingBridge = new BacklogBridge({
      ctx: {
        ...makeCtx({ root: project.root }),
        subprocess: {
          spawn: spawnAdapter,
          resolveExecutable: async () => {
            throw new Error('not found');
          },
        },
      },
      manager: server,
      logger,
    });
    const missing = await missingBridge.inspect('session-test');
    assert.equal(missing.public.state, 'not-installed');
    assert.ok(missing.public.installCommands.length > 0);
    assert.equal(server.records.size, 0);

    // Use a real empty folder rather than a Backlog project.
    const empty = await mkdtemp(join(tmpdir(), 'backlog-empty-'));
    try {
      const uninitializedBridge = new BacklogBridge({
        ctx: makeCtx({ root: empty }),
        manager: server,
        logger,
      });
      const state = await uninitializedBridge.inspect('session-test');
      assert.equal(state.public.state, 'not-initialized');
      assert.ok(state.public.initCommands.length > 0);
      assert.equal(server.records.size, 0);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  } finally {
    await server.stopAll();
    await project.cleanup();
  }
});
