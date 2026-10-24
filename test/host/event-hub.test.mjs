import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BacklogEventHub } from '../../src/server/event-hub.js';

class FakeSocket extends EventTarget {
  static instances = [];

  constructor(url) {
    super();
    this.url = url;
    this.closed = false;
    FakeSocket.instances.push(this);
  }

  close() {
    this.closed = true;
    this.dispatchEvent(new Event('close'));
  }

  message(data) {
    const event = new Event('message');
    Object.defineProperty(event, 'data', { value: data });
    this.dispatchEvent(event);
  }

  open() {
    this.dispatchEvent(new Event('open'));
  }
}

function makeHub({ reset = true } = {}) {
  if (reset) FakeSocket.instances = [];
  return new BacklogEventHub({
    port: 1234,
    WebSocketImpl: FakeSocket,
    logger: { warn() {}, info() {}, error() {} },
    reconnectBaseMs: 5,
    reconnectMaxMs: 10,
  });
}

async function waitFor(fn, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out');
}

test('relays Backlog.md task, milestone, and config notifications', async () => {
  const hub = makeHub();
  try {
    hub.start();
    const socket = FakeSocket.instances[0];
    socket.open();
    socket.message('tasks-updated');
    socket.message('milestones-updated');
    socket.message('config-updated');
    const result = await hub.wait({ since: 0, timeoutMs: 50 });
    const types = result.events.map((event) => event.type);
    assert.ok(types.includes('tasks-updated'));
    assert.ok(types.includes('milestones-updated'));
    assert.ok(types.includes('config-updated'));
    assert.equal(result.resync, false);
    assert.ok(result.seq >= 4);
  } finally {
    hub.stop();
  }
});

test('does not replay an event twice for the same cursor', async () => {
  const hub = makeHub();
  try {
    hub.start();
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].message('tasks-updated');
    const first = await hub.wait({ since: 0, timeoutMs: 50 });
    assert.ok(first.events.some((event) => event.type === 'tasks-updated'));
    const second = await hub.wait({ since: first.seq, timeoutMs: 30 });
    assert.deepEqual(second.events, []);
    assert.equal(second.seq, first.seq);
  } finally {
    hub.stop();
  }
});

test('asks for a full resync when the cursor has fallen out of the ring', async () => {
  const hub = makeHub();
  try {
    for (let index = 0; index < 205; index += 1) hub.push('tasks-updated');
    const result = await hub.wait({ since: 1, timeoutMs: 30 });
    assert.equal(result.resync, true);
    assert.deepEqual(result.events, []);
    assert.equal(result.seq, 205);
  } finally {
    hub.stop();
  }
});

test('reconnects with a resync event and stops cleanly', async () => {
  const hub = makeHub();
  try {
    hub.start();
    const first = FakeSocket.instances[0];
    first.open();
    first.close();
    assert.equal(hub.getState(), 'disconnected');
    await waitFor(() => FakeSocket.instances.length === 2);
    const second = FakeSocket.instances[1];
    second.open();
    const result = await hub.wait({ since: 0, timeoutMs: 50 });
    assert.ok(result.events.some((event) => event.type === 'resync'));
    assert.equal(hub.getState(), 'live');
  } finally {
    hub.stop();
  }
  const result = await hub.wait({ since: 0, timeoutMs: 10 });
  assert.equal(result.closed, true);
});

test('keeps workspaces isolated by using one hub per server', async () => {
  FakeSocket.instances = [];
  const a = makeHub({ reset: false });
  const b = makeHub({ reset: false });
  try {
    a.start();
    b.start();
    FakeSocket.instances[0].open();
    FakeSocket.instances[1].open();
    FakeSocket.instances[0].message('tasks-updated');
    const aResult = await a.wait({ since: 0, timeoutMs: 30 });
    const bResult = await b.wait({ since: 0, timeoutMs: 30 });
    assert.ok(aResult.events.some((event) => event.type === 'tasks-updated'));
    assert.ok(!bResult.events.some((event) => event.type === 'tasks-updated'));
  } finally {
    a.stop();
    b.stop();
  }
});
