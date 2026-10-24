import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { waitForEvents } from '../api/bridge';
import type { ConnectionState } from '../types';
import { backlogKeys } from './useBacklog';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Long-poll the Host's Backlog.md notification relay. The Host is the single
 * WebSocket subscriber; this hook only receives the resulting change scopes and
 * invalidates the matching TanStack Query caches.
 */
export function useBacklogConnection({
  sessionId,
  workspaceKey,
  enabled,
}: {
  sessionId: string;
  workspaceKey: string;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConnectionState>('connecting');
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState('disconnected');
      return undefined;
    }

    let stopped = false;
    let controller = new AbortController();
    let since = 0;
    let failures = 0;
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const scopes = new Set<string>();

    const invalidate = (scope: string) => {
      if (scope === 'tasks' || scope === 'all') {
        void queryClient.invalidateQueries({ queryKey: backlogKeys.tasks(workspaceKey) });
        void queryClient.invalidateQueries({ queryKey: backlogKeys.taskRoot(workspaceKey) });
      }
      if (scope === 'milestones' || scope === 'all') {
        void queryClient.invalidateQueries({ queryKey: backlogKeys.milestones(workspaceKey) });
        void queryClient.invalidateQueries({ queryKey: backlogKeys.tasks(workspaceKey) });
      }
      if (scope === 'config' || scope === 'all') {
        void queryClient.invalidateQueries({ queryKey: backlogKeys.status(sessionId) });
        void queryClient.invalidateQueries({ queryKey: backlogKeys.milestones(workspaceKey) });
        void queryClient.invalidateQueries({ queryKey: backlogKeys.tasks(workspaceKey) });
      }
    };

    const schedule = (scope: string) => {
      scopes.add(scope);
      if (invalidateTimer) clearTimeout(invalidateTimer);
      invalidateTimer = setTimeout(() => {
        invalidateTimer = null;
        const pending = [...scopes];
        scopes.clear();
        for (const item of pending) invalidate(item);
      }, 150);
    };

    since = 0;
    schedule('all');

    const run = async () => {
      setState('connecting');
      while (!stopped) {
        controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        try {
          const result = await waitForEvents(sessionId, since, controller.signal);
          clearTimeout(timeout);
          if (stopped) break;
          failures = 0;
          if (result.connection?.state) setState(result.connection.state);
          else setState('live');
          if (result.closed) {
            setState('disconnected');
            await delay(1000);
            continue;
          }
          if (result.resync) {
            since = Number.isFinite(result.seq) ? result.seq : since;
            schedule('all');
          }
          if (Array.isArray(result.events) && result.events.length > 0) {
            since = Math.max(since, Number(result.seq) || since);
            let changed = false;
            for (const event of result.events) {
              if (event.type === 'resync') {
                schedule('all');
                changed = true;
              } else if (event.type === 'tasks-updated') {
                schedule('tasks');
                changed = true;
              } else if (event.type === 'milestones-updated') {
                schedule('milestones');
                changed = true;
              } else if (event.type === 'config-updated') {
                schedule('config');
                changed = true;
              } else if (event.type === 'connection') {
                setState(event.state === 'live' ? 'live' : 'reconnecting');
              }
            }
            if (changed) setLastEventAt(Date.now());
          }
        } catch (error) {
          clearTimeout(timeout);
          if (stopped) break;
          if (error instanceof DOMException && error.name === 'AbortError') {
            failures += 1;
          } else {
            failures += 1;
          }
          setState('reconnecting');
          const backoff = Math.min(15_000, 1000 * 2 ** Math.min(failures, 4));
          await delay(backoff);
        }
      }
    };

    void run();

    return () => {
      stopped = true;
      controller.abort();
      if (invalidateTimer) clearTimeout(invalidateTimer);
    };
  }, [enabled, queryClient, sessionId, workspaceKey]);

  return { state, lastEventAt };
}
