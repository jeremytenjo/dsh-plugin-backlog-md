import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { BacklogMilestone, BacklogTask, TaskNode } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function finalStatus(statuses: string[]): string {
  const list = statuses.filter((status) => status.trim().length > 0);
  return list.length > 0 ? list[list.length - 1] : 'Done';
}

export function isDoneStatus(status: string, statuses: string[]): boolean {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'done' || normalized === 'completed' || normalized === 'complete') return true;
  return status === finalStatus(statuses);
}

export function statusTone(status: string, statuses: string[]): string {
  const normalized = status.trim().toLowerCase();
  if (isDoneStatus(status, statuses)) return 'dshbm-tone-done';
  if (/progress|doing|active|started|working|review/.test(normalized)) {
    return normalized.includes('review') ? 'dshbm-tone-review' : 'dshbm-tone-progress';
  }
  if (/blocked|failed|error|cancel/.test(normalized)) return 'dshbm-tone-error';
  if (/pending|waiting|hold|paused/.test(normalized)) return 'dshbm-tone-warn';
  return 'dshbm-tone-neutral';
}

export function priorityTone(priority: string | undefined): string {
  const normalized = String(priority ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'high' || normalized === 'critical' || normalized === 'urgent') {
    return 'dshbm-tone-error';
  }
  if (normalized === 'medium' || normalized === 'normal') return 'dshbm-tone-warn';
  if (normalized === 'low' || normalized === 'minor') return 'dshbm-tone-neutral';
  return 'dshbm-tone-neutral';
}

export function initials(value: string): string {
  const words = String(value ?? '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ''}${words[words.length - 1][0] ?? ''}`.toUpperCase();
}

export function splitList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function joinList(value: string[] | undefined): string {
  return (value ?? []).join(', ');
}

function parseBacklogDate(value: string): Date {
  const text = value.trim();
  // Older Backlog.md API versions return `YYYY-MM-DD HH:mm` without a zone.
  // Those timestamps are UTC, so parse them as UTC rather than local time.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(text)) {
    return new Date(`${text.replace(' ', 'T')}Z`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00Z`);
  return new Date(text);
}

export function relativeDate(value: string | undefined, now = Date.now()): string {
  if (!value) return '—';
  const date = parseBacklogDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = now - date.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;
  const suffix = future ? 'from now' : 'ago';
  if (abs < minute) return 'just now';
  if (abs < hour) return `${Math.round(abs / minute)}m ${suffix}`;
  if (abs < day) return `${Math.round(abs / hour)}h ${suffix}`;
  if (abs < week) return `${Math.round(abs / day)}d ${suffix}`;
  if (abs < month) return `${Math.round(abs / week)}w ${suffix}`;
  if (abs < year) return `${Math.round(abs / month)}mo ${suffix}`;
  return `${Math.round(abs / year)}y ${suffix}`;
}

export function absoluteDate(value: string | undefined): string {
  if (!value) return '';
  const date = parseBacklogDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function milestoneLabel(
  task: Pick<BacklogTask, 'milestone'>,
  milestones: BacklogMilestone[],
): string {
  if (!task.milestone) return '';
  const found = milestones.find(
    (milestone) => milestone.id === task.milestone || milestone.title === task.milestone,
  );
  return found?.title ?? task.milestone;
}

export function milestoneIdForTitle(title: string, milestones: BacklogMilestone[]): string | null {
  if (!title) return null;
  const found = milestones.find((milestone) => milestone.title === title || milestone.id === title);
  return found?.id ?? title;
}

export function tasksById(tasks: BacklogTask[]): Map<string, BacklogTask> {
  return new Map(tasks.map((task) => [task.id, task]));
}

export function childrenByParent(tasks: BacklogTask[]): Map<string, BacklogTask[]> {
  const map = new Map<string, BacklogTask[]>();
  for (const task of tasks) {
    const parent = task.parentTaskId;
    if (!parent) continue;
    const list = map.get(parent) ?? [];
    list.push(task);
    map.set(parent, list);
  }
  for (const list of map.values()) list.sort(compareTasks);
  return map;
}

export function compareTasks(left: BacklogTask, right: BacklogTask): number {
  const leftOrdinal = typeof left.ordinal === 'number' ? left.ordinal : Number.MAX_SAFE_INTEGER;
  const rightOrdinal = typeof right.ordinal === 'number' ? right.ordinal : Number.MAX_SAFE_INTEGER;
  if (leftOrdinal !== rightOrdinal) return leftOrdinal - rightOrdinal;
  return left.id.localeCompare(right.id, undefined, { numeric: true });
}

/** Build the explicit parent/child tree Backlog.md stores in each task's frontmatter. */
export function buildTaskTree(tasks: BacklogTask[]): {
  tree: TaskNode[];
  byId: Map<string, BacklogTask>;
  children: Map<string, BacklogTask[]>;
  ancestors: Map<string, string[]>;
} {
  const byId = tasksById(tasks);
  const cyclic = new Set<string>();
  for (const task of tasks) {
    const seen = new Set([task.id]);
    let parent = task.parentTaskId;
    while (parent && byId.has(parent)) {
      if (seen.has(parent)) {
        cyclic.add(task.id);
        break;
      }
      seen.add(parent);
      parent = byId.get(parent)?.parentTaskId;
    }
  }
  const children = new Map<string, BacklogTask[]>();
  for (const [parent, list] of childrenByParent(tasks)) {
    children.set(
      parent,
      list.filter((child) => !cyclic.has(child.id)),
    );
  }
  const visiting = new Set<string>();
  const memo = new Map<string, TaskNode>();

  function node(task: BacklogTask): TaskNode {
    const cached = memo.get(task.id);
    if (cached) return cached;
    const built: TaskNode = { ...task };
    memo.set(task.id, built);
    if (visiting.has(task.id)) return built;
    visiting.add(task.id);
    const kids = (children.get(task.id) ?? []).filter((child) => child.id !== task.id);
    if (kids.length > 0) built.subRows = kids.map(node);
    visiting.delete(task.id);
    return built;
  }

  const roots = tasks
    .filter((task) => cyclic.has(task.id) || !task.parentTaskId || !byId.has(task.parentTaskId))
    .sort(compareTasks)
    .map(node);

  const ancestors = new Map<string, string[]>();
  for (const task of tasks) {
    const chain: string[] = [];
    let parent = task.parentTaskId;
    const seen = new Set<string>();
    while (parent && byId.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      chain.push(parent);
      parent = byId.get(parent)?.parentTaskId;
    }
    ancestors.set(task.id, chain);
  }

  return { tree: roots, byId, children, ancestors };
}

export function subtaskProgress(
  taskId: string,
  children: Map<string, BacklogTask[]>,
  statuses: string[],
): { done: number; total: number } {
  const kids = children.get(taskId) ?? [];
  return {
    done: kids.filter((child) => isDoneStatus(child.status, statuses)).length,
    total: kids.length,
  };
}

export function taskMatchesFilters(
  task: BacklogTask,
  filters: {
    query: string;
    status: string;
    excludeStatus: string;
    priority: string;
    milestone: string;
    label: string;
    assignee: string;
  },
  statuses: string[],
  milestones: BacklogMilestone[],
): boolean {
  if (filters.status && task.status !== filters.status) return false;
  if (filters.excludeStatus && task.status === filters.excludeStatus) return false;
  if (filters.priority && task.priority !== filters.priority) return false;
  if (filters.label && !task.labels.includes(filters.label)) return false;
  if (filters.assignee && !task.assignee.includes(filters.assignee)) return false;
  if (filters.milestone) {
    const label = milestoneLabel(task, milestones);
    if (label !== filters.milestone) return false;
  }
  if (filters.query.trim()) {
    const query = filters.query.trim().toLowerCase();
    const haystack = [
      task.id,
      task.title,
      task.description,
      task.status,
      task.priority,
      task.type,
      task.project,
      ...task.labels,
      ...task.assignee,
      milestoneLabel(task, milestones),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

export const DEFAULT_COLUMN_VISIBILITY: Record<string, boolean> = {
  select: true,
  id: true,
  title: true,
  status: true,
  priority: true,
  ordinal: true,
  labels: true,
  assignee: true,
  milestone: true,
  created: true,
  actions: true,
};

export function sendToChatPrompt(task: BacklogTask): string {
  const reference = task.title.trim() ? `${task.id} "${task.title.trim()}"` : task.id;
  return `Implement ${reference} using its Backlog.md task definition. Follow AGENTS.md, update task status as work progresses, and verify all acceptance criteria.`;
}

export function sameSession(left: string | undefined, right: string | undefined): boolean {
  const normalize = (value: string | undefined) =>
    String(value ?? '')
      .replace(/^session-/, '')
      .trim();
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a) && a === b;
}
