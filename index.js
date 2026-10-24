/**
 * Host half of dsh-plugin-backlog-md.
 *
 * One exact loopback route is the plugin's only browser-facing surface. The
 * browser supplies a Session id and an action; the Host resolves the Session's
 * workspace, discovers the official Backlog.md CLI, starts or reuses its local
 * server, and proxies a fixed action set. The Backlog.md server itself is never
 * exposed to the browser.
 */

import { BacklogBridge, ROUTE_PATH } from './src/server/bridge.js';
import { BacklogServerManager } from './src/server/manager.js';

export const inject = ['webServer', 'subprocess', 'sessions', 'workingDirectory', 'fs'];

export function apply(ctx) {
  const manager = new BacklogServerManager({
    spawnServer: (spec) => ctx.subprocess.spawn(spec),
    fetchImpl: globalThis.fetch,
    WebSocketImpl: globalThis.WebSocket,
    logger: console,
  });
  const bridge = new BacklogBridge({
    ctx,
    manager,
    fetchImpl: globalThis.fetch,
    logger: console,
  });

  ctx.effect(() => {
    const disposeRoute = ctx.webServer.register({
      kind: 'exact',
      path: ROUTE_PATH,
      handler: bridge.handle,
    });
    return () => {
      try {
        disposeRoute();
      } catch {
        // The web server may already be tearing down.
      }
      void manager.stopAll();
    };
  }, 'backlog-md: loopback bridge');

  console.info('[backlog-md] plugin loaded');
}
