import {
  type BacklogMilestone,
  type BacklogStatus,
  type BacklogTask,
  type BridgeFailure,
  BridgeRequestError,
  type EventsResult,
} from '../types';

export const BRIDGE_ROUTE = '/__dsh/backlog-md';

interface BridgeEnvelope<T> {
  ok: boolean;
  data?: T;
  code?: string;
  error?: string;
  hint?: string;
  details?: Record<string, unknown>;
}

async function post<T>(payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BRIDGE_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new BridgeRequestError({
      code: 'network',
      error: 'Could not reach the Harness host.',
      hint: 'Reload the page and try again.',
    });
  }
  let envelope: BridgeEnvelope<T>;
  try {
    envelope = (await response.json()) as BridgeEnvelope<T>;
  } catch {
    throw new BridgeRequestError({
      code: 'unreadable',
      error: 'The Harness host returned an unreadable response.',
    });
  }
  if (!response.ok || !envelope.ok || envelope.data === undefined) {
    const failure: BridgeFailure = {
      code: envelope.code ?? `http-${response.status}`,
      error: envelope.error ?? 'The Backlog.md request failed.',
      hint: envelope.hint,
      details: envelope.details,
    };
    throw new BridgeRequestError(failure);
  }
  return envelope.data;
}

export function fetchStatus(sessionId: string, signal?: AbortSignal): Promise<BacklogStatus> {
  return post<BacklogStatus>({ action: 'status', sessionId }, signal);
}

export function fetchTasks(sessionId: string, signal?: AbortSignal): Promise<BacklogTask[]> {
  return post<{ tasks: BacklogTask[] }>({ action: 'tasks.list', sessionId }, signal).then(
    (data) => data.tasks,
  );
}

export function fetchTask(
  sessionId: string,
  taskId: string,
  signal?: AbortSignal,
): Promise<BacklogTask> {
  return post<{ task: BacklogTask }>({ action: 'tasks.get', sessionId, taskId }, signal).then(
    (data) => data.task,
  );
}

export function createTask(
  sessionId: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<BacklogTask> {
  return post<{ task: BacklogTask }>({ action: 'tasks.create', sessionId, ...input }, signal).then(
    (data) => data.task,
  );
}

export function updateTask(
  sessionId: string,
  taskId: string,
  changes: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<BacklogTask> {
  return post<{ task: BacklogTask }>(
    { action: 'tasks.update', sessionId, taskId, changes },
    signal,
  ).then((data) => data.task);
}

export function archiveTask(sessionId: string, taskId: string): Promise<{ archived: boolean }> {
  return post({ action: 'tasks.archive', sessionId, taskId });
}

export function deleteTask(
  sessionId: string,
  taskId: string,
): Promise<{ archived: boolean; deleted: boolean }> {
  return post({ action: 'tasks.delete', sessionId, taskId });
}

export function fetchMilestones(
  sessionId: string,
  signal?: AbortSignal,
): Promise<BacklogMilestone[]> {
  return post<{ milestones: BacklogMilestone[] }>(
    { action: 'milestones.list', sessionId },
    signal,
  ).then((data) => data.milestones);
}

export function createMilestone(
  sessionId: string,
  input: { title: string; description?: string; dueDate?: string },
): Promise<BacklogMilestone> {
  return post<{ milestone: BacklogMilestone }>({
    action: 'milestones.create',
    sessionId,
    ...input,
  }).then((data) => data.milestone);
}

export function restartServer(sessionId: string): Promise<unknown> {
  return post({ action: 'server.restart', sessionId });
}

export function waitForEvents(
  sessionId: string,
  since: number,
  signal?: AbortSignal,
): Promise<EventsResult> {
  return post<EventsResult>({ action: 'events', sessionId, since }, signal);
}
