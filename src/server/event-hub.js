/**
 * One Host-side WebSocket subscriber per managed Backlog.md server and a
 * bounded event ring for browser long-poll consumers. This is the only
 * filesystem-change notification path the plugin uses.
 */
export class BacklogEventHub {
  /**
   * @param {{
   *   port: number,
   *   WebSocketImpl?: typeof WebSocket,
   *   logger?: Console,
   *   now?: () => number,
   *   reconnectBaseMs?: number,
   *   reconnectMaxMs?: number,
   * }} options
   */
  constructor({
    port,
    WebSocketImpl = globalThis.WebSocket,
    logger = console,
    now = Date.now,
    reconnectBaseMs = 500,
    reconnectMaxMs = 8000,
  }) {
    if (typeof WebSocketImpl !== 'function') {
      throw new Error('This Host does not provide a WebSocket client.');
    }
    this.port = port;
    this.WebSocketImpl = WebSocketImpl;
    this.logger = logger;
    this.now = now;
    this.reconnectBaseMs = reconnectBaseMs;
    this.reconnectMaxMs = reconnectMaxMs;
    this.socket = null;
    this.closed = false;
    this.everOpened = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.sequence = 0;
    this.buffer = [];
    this.maxBuffer = 200;
    this.waiters = new Set();
    this.state = 'connecting';
  }

  get lastSeq() {
    return this.sequence;
  }

  getState() {
    return this.state;
  }

  start() {
    if (this.closed || this.socket) return;
    this.connect();
  }

  connect() {
    if (this.closed) return;
    let socket;
    try {
      socket = new this.WebSocketImpl(`ws://127.0.0.1:${this.port}`);
    } catch (error) {
      this.logger.warn?.('[backlog-md] could not create the Backlog.md WebSocket:', error);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.state = this.everOpened ? 'reconnecting' : 'connecting';
    socket.addEventListener('open', () => {
      if (this.socket !== socket || this.closed) return;
      const reconnected = this.everOpened;
      this.everOpened = true;
      this.reconnectAttempt = 0;
      this.state = 'live';
      this.push('connection', { state: 'live' });
      if (reconnected) {
        this.push('resync', { reason: 'reconnected' });
      }
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket || this.closed) return;
      this.handleMessage(event.data);
    });
    socket.addEventListener('error', () => {
      if (this.socket !== socket || this.closed) return;
      this.logger.warn?.('[backlog-md] Backlog.md WebSocket error; retrying');
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.closed) return;
      this.state = 'disconnected';
      this.push('connection', { state: 'disconnected' });
      this.scheduleReconnect();
    });
  }

  handleMessage(data) {
    const text =
      typeof data === 'string'
        ? data
        : data instanceof ArrayBuffer
          ? new TextDecoder().decode(data)
          : Buffer.isBuffer(data)
            ? data.toString('utf8')
            : '';
    if (!text) return;
    if (text.startsWith('{')) {
      try {
        const payload = JSON.parse(text);
        if (payload && payload.type === 'loaded') {
          this.state = 'live';
          return;
        }
        if (payload && (payload.type === 'loading' || payload.loading === true)) {
          this.push('server-loading', { state: payload });
          return;
        }
      } catch {
        // Fall through: an unknown JSON message is not a task change.
      }
      return;
    }
    if (text === 'tasks-updated') this.push('tasks-updated', { scope: 'tasks' });
    else if (text === 'milestones-updated')
      this.push('milestones-updated', { scope: 'milestones' });
    else if (text === 'config-updated') this.push('config-updated', { scope: 'config' });
    else if (text !== 'pong') this.push('message', { text: text.slice(0, 200) });
  }

  scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    const delay = Math.min(
      this.reconnectMaxMs,
      this.reconnectBaseMs * 2 ** Math.min(this.reconnectAttempt, 6),
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  push(type, data = {}) {
    this.sequence += 1;
    const event = {
      seq: this.sequence,
      type,
      at: new Date(this.now()).toISOString(),
      ...data,
    };
    this.buffer.push(event);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();
    for (const waiter of [...this.waiters]) {
      this.waiters.delete(waiter);
      waiter.resolve({ events: [event], seq: this.sequence, resync: false });
      clearTimeout(waiter.timer);
      waiter.signal?.removeEventListener('abort', waiter.abort);
    }
  }

  /**
   * Wait for the next event after `since`. A stale cursor asks the client to
   * refetch everything instead of replaying a gap it can no longer trust.
   */
  wait({ since = 0, timeoutMs = 12000, signal } = {}) {
    if (this.closed) {
      return Promise.resolve({ events: [], seq: this.sequence, closed: true });
    }
    const cursor = Number.isFinite(Number(since)) ? Number(since) : 0;
    const first = this.buffer[0]?.seq ?? this.sequence + 1;
    if (cursor > 0 && cursor < first - 1) {
      return Promise.resolve({ events: [], seq: this.sequence, resync: true });
    }
    const available = this.buffer.filter((event) => event.seq > cursor);
    if (available.length > 0) {
      return Promise.resolve({ events: available, seq: this.sequence, resync: false });
    }
    if (signal?.aborted) {
      return Promise.resolve({ events: [], seq: this.sequence, aborted: true });
    }
    return new Promise((resolve) => {
      const waiter = { resolve, timer: null, signal, abort: null };
      waiter.abort = () => {
        if (!this.waiters.delete(waiter)) return;
        clearTimeout(waiter.timer);
        resolve({ events: [], seq: this.sequence, aborted: true });
      };
      signal?.addEventListener('abort', waiter.abort, { once: true });
      waiter.timer = setTimeout(
        () => {
          if (!this.waiters.delete(waiter)) return;
          signal?.removeEventListener('abort', waiter.abort);
          resolve({ events: [], seq: this.sequence, resync: false });
        },
        Math.max(0, Number(timeoutMs) || 0),
      );
      this.waiters.add(waiter);
    });
  }

  stop() {
    this.closed = true;
    this.state = 'closed';
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    try {
      socket?.close();
    } catch {
      // Already closed.
    }
    for (const waiter of [...this.waiters]) {
      this.waiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.signal?.removeEventListener('abort', waiter.abort);
      waiter.resolve({ events: [], seq: this.sequence, closed: true });
    }
  }
}
