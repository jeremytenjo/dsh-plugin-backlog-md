import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  archiveTask,
  createMilestone,
  createTask,
  deleteTask,
  fetchMilestones,
  fetchStatus,
  fetchTask,
  fetchTasks,
  restartServer,
  updateTask,
} from '../api/bridge';
import type { BacklogMilestone, BacklogStatus, BacklogTask } from '../types';

export const backlogKeys = {
  all: ['backlog'] as const,
  status: (sessionId: string) => ['backlog', 'status', sessionId] as const,
  workspace: (workspaceKey: string) => ['backlog', workspaceKey] as const,
  tasks: (workspaceKey: string) => ['backlog', workspaceKey, 'tasks'] as const,
  task: (workspaceKey: string, taskId: string) =>
    ['backlog', workspaceKey, 'task', taskId] as const,
  taskRoot: (workspaceKey: string) => ['backlog', workspaceKey, 'task'] as const,
  milestones: (workspaceKey: string) => ['backlog', workspaceKey, 'milestones'] as const,
};

export function useBacklogStatus(sessionId: string, enabled = true) {
  return useQuery<BacklogStatus>({
    queryKey: backlogKeys.status(sessionId),
    queryFn: ({ signal }) => fetchStatus(sessionId, signal),
    enabled: enabled && Boolean(sessionId),
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

export function useBacklogTasks(sessionId: string, workspaceKey: string, enabled: boolean) {
  return useQuery<BacklogTask[]>({
    queryKey: backlogKeys.tasks(workspaceKey),
    queryFn: ({ signal }) => fetchTasks(sessionId, signal),
    enabled,
    staleTime: 10_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useBacklogTask(
  sessionId: string,
  workspaceKey: string,
  taskId: string | null,
  enabled: boolean,
) {
  return useQuery<BacklogTask>({
    queryKey: taskId
      ? backlogKeys.task(workspaceKey, taskId)
      : ['backlog', workspaceKey, 'task', 'none'],
    queryFn: ({ signal }) => {
      if (!taskId) throw new Error('No task selected.');
      return fetchTask(sessionId, taskId, signal);
    },
    enabled: enabled && Boolean(taskId),
    staleTime: 5_000,
    gcTime: 15 * 60_000,
    retry: 1,
  });
}

export function useBacklogMilestones(sessionId: string, workspaceKey: string, enabled: boolean) {
  return useQuery<BacklogMilestone[]>({
    queryKey: backlogKeys.milestones(workspaceKey),
    queryFn: ({ signal }) => fetchMilestones(sessionId, signal),
    enabled,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
}

function invalidateTasks(queryClient: ReturnType<typeof useQueryClient>, workspaceKey: string) {
  void queryClient.invalidateQueries({ queryKey: backlogKeys.tasks(workspaceKey) });
  void queryClient.invalidateQueries({ queryKey: backlogKeys.taskRoot(workspaceKey) });
}

export function useCreateBacklogTask(sessionId: string, workspaceKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => createTask(sessionId, input),
    onSuccess: (task) => {
      queryClient.setQueryData(backlogKeys.task(workspaceKey, task.id), task);
      invalidateTasks(queryClient, workspaceKey);
    },
  });
}

export function useUpdateBacklogTask(sessionId: string, workspaceKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, changes }: { taskId: string; changes: Record<string, unknown> }) =>
      updateTask(sessionId, taskId, changes),
    onSuccess: (task) => {
      queryClient.setQueryData(backlogKeys.task(workspaceKey, task.id), task);
      invalidateTasks(queryClient, workspaceKey);
    },
  });
}

export function useArchiveBacklogTask(sessionId: string, workspaceKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => archiveTask(sessionId, taskId),
    onSuccess: (_result, taskId) => {
      queryClient.removeQueries({ queryKey: backlogKeys.task(workspaceKey, taskId) });
      invalidateTasks(queryClient, workspaceKey);
    },
  });
}

export function useDeleteBacklogTask(sessionId: string, workspaceKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(sessionId, taskId),
    onSuccess: (_result, taskId) => {
      queryClient.removeQueries({ queryKey: backlogKeys.task(workspaceKey, taskId) });
      invalidateTasks(queryClient, workspaceKey);
    },
  });
}

export function useCreateBacklogMilestone(sessionId: string, workspaceKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; description?: string; dueDate?: string }) =>
      createMilestone(sessionId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: backlogKeys.milestones(workspaceKey) });
      void queryClient.invalidateQueries({ queryKey: backlogKeys.tasks(workspaceKey) });
    },
  });
}

export function useRestartBacklogServer(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => restartServer(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: backlogKeys.all });
    },
  });
}
