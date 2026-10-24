import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';

import { BacklogApi } from '../../src/server/api-client.js';
import { BacklogServerManager } from '../../src/server/manager.js';
import {
  backlogAvailable,
  backlogBin,
  makeProject,
  spawnAdapter,
  waitFor,
  waitForHealth,
} from './helpers.mjs';

const skip = !backlogAvailable();
const logger = { info() {}, warn() {}, error() {} };

function manager(overrides = {}) {
  return new BacklogServerManager({
    spawnServer: spawnAdapter,
    logger,
    ...overrides,
  });
}

async function portClosed(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(500) });
    return false;
  } catch {
    return true;
  }
}

test('starts one managed server, reuses it, and cleans it up', { skip }, async () => {
  const project = await makeProject('Managed lifecycle');
  const server = manager();
  try {
    const [first, second] = await Promise.all([
      server.ensure({
        root: project.root,
        executable: backlogBin,
        defaultPort: project.defaultPort,
      }),
      server.ensure({
        root: project.root,
        executable: backlogBin,
        defaultPort: project.defaultPort,
      }),
    ]);
    assert.equal(first.port, second.port);
    assert.equal(first.owned, true);
    assert.equal(server.records.size, 1);
    const api = new BacklogApi({ port: first.port });
    assert.deepEqual(await api.tasks(), []);
    assert.equal((await api.status()).initialized, true);

    await server.stopAll();
    await waitFor(() => portClosed(first.port), { timeoutMs: 5000 });
  } finally {
    await server.stopAll();
    await project.cleanup();
  }
});

test('adopts an existing compatible server without ever owning or terminating it', {
  skip,
}, async () => {
  const project = await makeProject('External server');
  const manual = spawnAdapter({
    argv: [backlogBin, 'browser', '--port', String(project.defaultPort), '--no-open'],
    cwd: project.root,
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: 64 * 1024 },
      stderr: { maxBytes: 64 * 1024 },
    },
    graceMs: 4000,
  });
  const server = manager();
  try {
    await waitForHealth(project.defaultPort);
    const record = await server.ensure({
      root: project.root,
      executable: backlogBin,
      defaultPort: project.defaultPort,
    });
    assert.equal(record.port, project.defaultPort);
    assert.equal(record.owned, false);
    await server.stopAll();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const status = await fetch(`http://127.0.0.1:${project.defaultPort}/api/status`);
    assert.equal(status.ok, true, 'an unowned server must keep running');
  } finally {
    await server.stopAll();
    await manual.terminate();
    await manual.waitForExit().catch(() => {});
    await project.cleanup();
  }
});

test('recovers from an unexpected server crash with a bounded restart', { skip }, async () => {
  const project = await makeProject('Crash recovery');
  const server = manager();
  try {
    const first = await server.ensure({
      root: project.root,
      executable: backlogBin,
      defaultPort: project.defaultPort,
    });
    await first.handle.terminate();
    await waitFor(() => server.get(project.root) === null, { timeoutMs: 8000 });
    const restarted = await server.ensure({
      root: project.root,
      executable: backlogBin,
      defaultPort: project.defaultPort,
    });
    assert.notEqual(restarted, first);
    assert.equal(restarted.owned, true);
    assert.equal((await fetch(`http://127.0.0.1:${restarted.port}/api/status`)).ok, true);
  } finally {
    await server.stopAll();
    await project.cleanup();
  }
});

test('recovers when the requested port is already occupied', { skip }, async () => {
  const project = await makeProject('Port conflict');
  const occupied = await new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"occupied"}');
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
  const occupiedPort = occupied.address().port;
  const server = manager({ allocatePort: async () => occupiedPort });
  try {
    const record = await server.ensure({
      root: project.root,
      executable: backlogBin,
      defaultPort: project.defaultPort,
    });
    assert.notEqual(record.port, occupiedPort);
    assert.equal((await fetch(`http://127.0.0.1:${record.port}/api/status`)).ok, true);
  } finally {
    await server.stopAll();
    occupied.closeAllConnections?.();
    await new Promise((resolve) => occupied.close(resolve));
    await project.cleanup();
  }
});

test('keeps one server per canonical workspace and isolates tasks', { skip }, async () => {
  const first = await makeProject('Workspace one');
  const second = await makeProject('Workspace two');
  const server = manager();
  try {
    const [a, b] = await Promise.all([
      server.ensure({
        root: first.root,
        executable: backlogBin,
        defaultPort: first.defaultPort,
      }),
      server.ensure({
        root: second.root,
        executable: backlogBin,
        defaultPort: second.defaultPort,
      }),
    ]);
    assert.notEqual(a.port, b.port);
    assert.equal(server.records.size, 2);
    const apiA = new BacklogApi({ port: a.port });
    const apiB = new BacklogApi({ port: b.port });
    assert.notEqual((await apiA.status()).projectPath, (await apiB.status()).projectPath);
  } finally {
    await server.stopAll();
    await first.cleanup();
    await second.cleanup();
  }
});

test('uses an HTTP-observable port for health probes', { skip }, async () => {
  const project = await makeProject('Health');
  const server = manager();
  try {
    const record = await server.ensure({
      root: project.root,
      executable: backlogBin,
      defaultPort: project.defaultPort,
    });
    const response = await fetch(`http://127.0.0.1:${record.port}/api/status`);
    const data = await response.json();
    assert.equal(data.projectPath, project.root);
  } finally {
    await server.stopAll();
    await project.cleanup();
  }
});

test('rejects a non-Backlog HTTP listener on the configured port', { skip }, async () => {
  const project = await makeProject('Wrong port');
  const dummy = http.createServer((_req, res) => {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"error":"not backlog"}');
  });
  const port = await new Promise((resolve) => {
    dummy.listen(0, '127.0.0.1', () => resolve(dummy.address().port));
  });
  const server = manager();
  try {
    const record = await server.ensure({
      root: project.root,
      executable: backlogBin,
      defaultPort: port,
    });
    assert.notEqual(record.port, port);
    assert.equal((await fetch(`http://127.0.0.1:${record.port}/api/status`)).ok, true);
  } finally {
    await server.stopAll();
    dummy.closeAllConnections?.();
    await new Promise((resolve) => dummy.close(resolve));
    await project.cleanup();
  }
});
