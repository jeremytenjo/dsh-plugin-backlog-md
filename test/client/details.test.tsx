import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BacklogTaskDetails } from '../../src/client/components/BacklogTaskDetails';
import type { BacklogReadyStatus, BacklogTask } from '../../src/client/types';

const status: BacklogReadyStatus = {
  state: 'ready',
  workspace: { key: 'workspace-key', name: 'Test project', folder: 'test', initialized: true },
  compatibility: { minimum: '1.30.0', tested: '1.55.3' },
  backlogVersion: '1.55.3',
  executable: { source: 'workspace' },
  server: { version: '1.55.3', managed: true, connected: 'live' },
  config: { projectName: 'Test project', statuses: ['To Do', 'In Progress', 'Done'] },
  statuses: ['To Do', 'In Progress', 'Done'],
};

const baseTask: BacklogTask = {
  id: 'TASK-1',
  title: 'Original title',
  status: 'To Do',
  priority: 'high',
  assignee: ['alice'],
  labels: ['ui'],
  dependencies: [],
  description: 'Some **Markdown** description.',
  acceptanceCriteriaItems: [{ text: 'Criterion one', checked: false, index: 1 }],
  definitionOfDoneItems: [],
  createdDate: '2026-10-24 19:00',
  updatedDate: '2026-10-24 19:00',
};

function jsonResponse(payload: unknown, statusCode = 200) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { 'content-type': 'application/json' },
  });
}

describe('BacklogTaskDetails', () => {
  it('edits a task through the official bridge and reports the save', async () => {
    let current = { ...baseTask };
    const calls: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push(body);
        if (body.action === 'tasks.get') {
          return jsonResponse({ ok: true, data: { task: current } });
        }
        if (body.action === 'tasks.update') {
          current = { ...current, ...body.changes };
          return jsonResponse({ ok: true, data: { task: current } });
        }
        return jsonResponse({ ok: false, code: 'unknown', error: 'unknown action' }, 400);
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const onNotify = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <BacklogTaskDetails
          sessionId="session-test"
          workspaceKey="workspace-key"
          taskId="TASK-1"
          status={status}
          milestones={[]}
          allTasks={[baseTask]}
          onBack={vi.fn()}
          onOpenTask={vi.fn()}
          onSendToChat={vi.fn()}
          onNewSubtask={vi.fn()}
          onNotify={onNotify}
        />
      </QueryClientProvider>,
    );

    const title = await screen.findByLabelText('Task title');
    await waitFor(() => expect((title as HTMLInputElement).value).toBe('Original title'));
    fireEvent.change(title, { target: { value: 'Edited title' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(calls.some((call) => call.action === 'tasks.update')).toBe(true);
    });
    const update = calls.find((call) => call.action === 'tasks.update');
    expect(update).toMatchObject({
      sessionId: 'session-test',
      taskId: 'TASK-1',
      changes: { title: 'Edited title' },
    });
    await waitFor(() => expect(onNotify).toHaveBeenCalledWith('Task saved to Backlog.md'));
    expect(screen.getByDisplayValue('Edited title')).toBeTruthy();
  });

  it('does not save when there are no changes', async () => {
    const calls: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push(body);
        return jsonResponse({ ok: true, data: { task: baseTask } });
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <BacklogTaskDetails
          sessionId="session-test"
          workspaceKey="workspace-key"
          taskId="TASK-1"
          status={status}
          milestones={[]}
          allTasks={[baseTask]}
          onBack={vi.fn()}
          onOpenTask={vi.fn()}
          onSendToChat={vi.fn()}
          onNewSubtask={vi.fn()}
          onNotify={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const save = await screen.findByRole('button', { name: /^Save$/ });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(calls.some((call) => call.action === 'tasks.update')).toBe(false);
  });
});
