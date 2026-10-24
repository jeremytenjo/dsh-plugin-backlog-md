import { describe, expect, it } from 'vitest';
import {
  buildTaskTree,
  compareTasks,
  isDoneStatus,
  milestoneLabel,
  relativeDate,
  sendToChatPrompt,
  splitList,
  subtaskProgress,
  taskMatchesFilters,
} from '../../src/client/lib/utils';
import type { BacklogTask } from '../../src/client/types';

const task = (overrides: Partial<BacklogTask>): BacklogTask => ({
  id: 'TASK-1',
  title: 'Task',
  status: 'To Do',
  assignee: [],
  labels: [],
  dependencies: [],
  createdDate: '2026-01-01T00:00:00Z',
  ...overrides,
});

const statuses = ['To Do', 'In Progress', 'Done'];
const filters = {
  query: '',
  status: '',
  excludeStatus: '',
  priority: '',
  milestone: '',
  label: '',
  assignee: '',
};
const milestones = [
  { id: 'm-0', title: 'v1.0' },
  { id: 'm-1', title: 'v2.0' },
];

describe('task filters', () => {
  const sample = task({
    id: 'TASK-7',
    title: 'Fix the narrow panel',
    status: 'In Progress',
    priority: 'high',
    labels: ['ui', 'responsive'],
    assignee: ['alice'],
    milestone: 'm-0',
    description: 'Avoid horizontal scrolling.',
  });

  it('matches search across id, title, labels, assignees and description', () => {
    expect(taskMatchesFilters(sample, { ...filters, query: 'TASK-7' }, statuses, milestones)).toBe(
      true,
    );
    expect(taskMatchesFilters(sample, { ...filters, query: 'narrow' }, statuses, milestones)).toBe(
      true,
    );
    expect(
      taskMatchesFilters(sample, { ...filters, query: 'responsive' }, statuses, milestones),
    ).toBe(true);
    expect(taskMatchesFilters(sample, { ...filters, query: 'alice' }, statuses, milestones)).toBe(
      true,
    );
    expect(taskMatchesFilters(sample, { ...filters, query: 'scroll' }, statuses, milestones)).toBe(
      true,
    );
    expect(taskMatchesFilters(sample, { ...filters, query: 'missing' }, statuses, milestones)).toBe(
      false,
    );
  });

  it('combines status, exclude status, priority, milestone, label and assignee', () => {
    expect(
      taskMatchesFilters(sample, { ...filters, status: 'In Progress' }, statuses, milestones),
    ).toBe(true);
    expect(taskMatchesFilters(sample, { ...filters, status: 'Done' }, statuses, milestones)).toBe(
      false,
    );
    expect(
      taskMatchesFilters(sample, { ...filters, excludeStatus: 'Done' }, statuses, milestones),
    ).toBe(true);
    expect(
      taskMatchesFilters(
        sample,
        { ...filters, excludeStatus: 'In Progress' },
        statuses,
        milestones,
      ),
    ).toBe(false);
    expect(taskMatchesFilters(sample, { ...filters, priority: 'high' }, statuses, milestones)).toBe(
      true,
    );
    expect(
      taskMatchesFilters(sample, { ...filters, milestone: 'v1.0' }, statuses, milestones),
    ).toBe(true);
    expect(
      taskMatchesFilters(sample, { ...filters, milestone: 'v2.0' }, statuses, milestones),
    ).toBe(false);
    expect(taskMatchesFilters(sample, { ...filters, label: 'ui' }, statuses, milestones)).toBe(
      true,
    );
    expect(taskMatchesFilters(sample, { ...filters, assignee: 'bob' }, statuses, milestones)).toBe(
      false,
    );
  });
});

describe('task hierarchy', () => {
  const tasks = [
    task({ id: 'TASK-2', title: 'Child B', parentTaskId: 'TASK-1', status: 'Done', ordinal: 2000 }),
    task({ id: 'TASK-1', title: 'Parent', ordinal: 1000 }),
    task({
      id: 'TASK-1.1',
      title: 'Child A',
      parentTaskId: 'TASK-1',
      status: 'To Do',
      ordinal: 1000,
    }),
    task({ id: 'TASK-3', title: 'Orphan', parentTaskId: 'MISSING', status: 'To Do' }),
  ];

  it('builds a tree from explicit parentTaskId relationships, not ID formatting', () => {
    const { tree, children, ancestors } = buildTaskTree(tasks);
    expect(tree.map((node) => node.id)).toEqual(['TASK-1', 'TASK-3']);
    expect(tree[0].subRows?.map((node) => node.id)).toEqual(['TASK-1.1', 'TASK-2']);
    expect(children.get('TASK-1')?.map((node) => node.id)).toEqual(['TASK-1.1', 'TASK-2']);
    expect(ancestors.get('TASK-2')).toEqual(['TASK-1']);
  });

  it('calculates progress from actual child statuses', () => {
    const { children } = buildTaskTree(tasks);
    expect(subtaskProgress('TASK-1', children, statuses)).toEqual({ done: 1, total: 2 });
    expect(subtaskProgress('TASK-2', children, statuses)).toEqual({ done: 0, total: 0 });
  });

  it('orders by ordinal then natural ID', () => {
    expect([...tasks].sort(compareTasks).map((item) => item.id)).toEqual([
      'TASK-1',
      'TASK-1.1',
      'TASK-2',
      'TASK-3',
    ]);
  });
});

describe('formatting and helpers', () => {
  it('parses Backlog.md naive timestamps as UTC', () => {
    const now = new Date('2026-10-24T19:38:30Z').getTime();
    expect(relativeDate('2026-10-24 19:38', now)).toBe('just now');
    expect(relativeDate('2026-10-24T18:38:00Z', now)).toBe('1h ago');
  });

  it('resolves milestone IDs and titles', () => {
    expect(milestoneLabel({ milestone: 'm-0' }, milestones)).toBe('v1.0');
    expect(milestoneLabel({ milestone: 'v2.0' }, milestones)).toBe('v2.0');
    expect(milestoneLabel({}, milestones)).toBe('');
  });

  it('splits comma lists and deduplicates', () => {
    expect(splitList(' ui, api,ui, , docs ')).toEqual(['ui', 'api', 'docs']);
  });

  it('treats the last configured status as done', () => {
    expect(isDoneStatus('Done', statuses)).toBe(true);
    expect(isDoneStatus('Completed', ['To Do', 'Completed'])).toBe(true);
    expect(isDoneStatus('In Progress', statuses)).toBe(false);
  });

  it('builds the Send to Chat prompt without submitting anything', () => {
    expect(sendToChatPrompt(task({ id: 'TASK-20.4', title: 'Wire sync' }))).toBe(
      'Implement TASK-20.4 "Wire sync" using its Backlog.md task definition. Follow AGENTS.md, update task status as work progresses, and verify all acceptance criteria.',
    );
  });
});
