import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Plus,
  Save,
  Send,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import * as React from 'react';
import { fetchTask } from '../api/bridge';
import {
  backlogKeys,
  useArchiveBacklogTask,
  useBacklogTask,
  useDeleteBacklogTask,
  useUpdateBacklogTask,
} from '../hooks/useBacklog';
import {
  absoluteDate,
  isDoneStatus,
  joinList,
  milestoneLabel,
  relativeDate,
  splitList,
} from '../lib/utils';
import type {
  AcceptanceCriterion,
  BacklogMilestone,
  BacklogReadyStatus,
  BacklogTask,
} from '../types';
import { BridgeRequestError } from '../types';
import { BacklogConfirmDialog } from './BacklogConfirmDialog';
import { InlineSpinner, PriorityBadge, ProgressRing, StatusBadge } from './badges';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Input, Label, Textarea } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface DoDItem {
  text: string;
  checked: boolean;
  index?: number;
}

interface TaskForm {
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  labels: string;
  milestone: string;
  dueDate: string;
  dependencies: string[];
  acceptance: AcceptanceCriterion[];
  dod: DoDItem[];
}

const FORM_KEYS: Array<keyof TaskForm> = [
  'title',
  'description',
  'status',
  'priority',
  'assignee',
  'labels',
  'milestone',
  'dueDate',
  'dependencies',
  'acceptance',
  'dod',
];

const FIELD_LABELS: Record<keyof TaskForm, string> = {
  title: 'Title',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
  labels: 'Labels',
  milestone: 'Milestone',
  dueDate: 'Due date',
  dependencies: 'Dependencies',
  acceptance: 'Acceptance criteria',
  dod: 'Definition of Done',
};

function formFromTask(task: BacklogTask, milestones: BacklogMilestone[]): TaskForm {
  return {
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    priority: task.priority ?? '',
    assignee: joinList(task.assignee),
    labels: joinList(task.labels),
    milestone: milestoneLabel(task, milestones),
    dueDate: task.dueDate ?? '',
    dependencies: [...task.dependencies],
    acceptance: (task.acceptanceCriteriaItems ?? []).map((item) => ({
      text: item.text,
      checked: Boolean(item.checked),
      index: item.index,
    })),
    dod: (task.definitionOfDoneItems ?? []).map((item) => ({
      text: item.text,
      checked: Boolean(item.checked),
      index: item.index,
    })),
  };
}

function formsEqual(left: TaskForm | null, right: TaskForm | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffChanges(
  base: TaskForm,
  next: TaskForm,
  milestones: BacklogMilestone[],
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  if (base.title !== next.title) changes.title = next.title;
  if (base.description !== next.description) changes.description = next.description;
  if (base.status !== next.status) changes.status = next.status;
  if (base.priority !== next.priority) changes.priority = next.priority;
  if (base.assignee !== next.assignee) changes.assignee = splitList(next.assignee);
  if (base.labels !== next.labels) changes.labels = splitList(next.labels);
  if (base.milestone !== next.milestone) {
    changes.milestone = next.milestone
      ? (milestones.find((item) => item.title === next.milestone)?.title ?? next.milestone)
      : null;
  }
  if (base.dueDate !== next.dueDate) changes.dueDate = next.dueDate.trim() || null;
  if (JSON.stringify(base.dependencies) !== JSON.stringify(next.dependencies)) {
    changes.dependencies = next.dependencies;
  }
  if (JSON.stringify(base.acceptance) !== JSON.stringify(next.acceptance)) {
    changes.acceptanceCriteriaItems = next.acceptance
      .map((item) => ({ text: item.text.trim(), checked: Boolean(item.checked) }))
      .filter((item) => item.text.length > 0);
  }

  const baseByIndex = new Map<number, DoDItem>();
  for (const item of base.dod)
    if (typeof item.index === 'number') baseByIndex.set(item.index, item);
  const nextByIndex = new Map<number, DoDItem>();
  for (const item of next.dod)
    if (typeof item.index === 'number') nextByIndex.set(item.index, item);

  const add: string[] = [];
  const remove: number[] = [];
  const check: number[] = [];
  const uncheck: number[] = [];
  for (const item of next.dod) {
    const text = item.text.trim();
    if (!text) continue;
    if (typeof item.index !== 'number') {
      add.push(text);
      continue;
    }
    const previous = baseByIndex.get(item.index);
    if (!previous) {
      add.push(text);
      continue;
    }
    if (previous.text.trim() !== text) {
      remove.push(item.index);
      add.push(text);
      continue;
    }
    if (previous.checked !== item.checked) {
      if (item.checked) check.push(item.index);
      else uncheck.push(item.index);
    }
  }
  for (const [index] of baseByIndex) {
    if (!nextByIndex.has(index)) remove.push(index);
  }
  if (add.length > 0) changes.definitionOfDoneAdd = add;
  if (remove.length > 0) changes.definitionOfDoneRemove = remove;
  if (check.length > 0) changes.definitionOfDoneCheck = check;
  if (uncheck.length > 0) changes.definitionOfDoneUncheck = uncheck;
  return changes;
}

function changedFields(base: TaskForm, next: TaskForm): Array<keyof TaskForm> {
  return FORM_KEYS.filter((key) => JSON.stringify(base[key]) !== JSON.stringify(next[key]));
}

function mergeConflict(baseline: TaskForm, mine: TaskForm, fresh: TaskForm): TaskForm {
  const merged: TaskForm = { ...mine };
  for (const key of FORM_KEYS) {
    if (JSON.stringify(mine[key]) === JSON.stringify(baseline[key])) {
      // I never touched this field; keep the external value.
      (merged as unknown as Record<string, unknown>)[key] = fresh[key];
    }
  }
  return merged;
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="dshbm-border-b dshbm-border-border dshbm-px-3 dshbm-py-3">
      <div className="dshbm-mb-2 dshbm-flex dshbm-items-center dshbm-gap-2">
        <h3 className="dshbm-m-0 dshbm-text-2xs dshbm-font-semibold dshbm-uppercase dshbm-tracking-wide dshbm-text-muted-foreground">
          {title}
        </h3>
        <div className="dshbm-ml-auto dshbm-flex dshbm-items-center dshbm-gap-1">{action}</div>
      </div>
      {children}
    </section>
  );
}

function CheckList({
  items,
  onChange,
  emptyLabel,
}: {
  items: DoDItem[];
  onChange: (items: DoDItem[]) => void;
  emptyLabel: string;
}) {
  const [draft, setDraft] = React.useState('');
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { text, checked: false }]);
    setDraft('');
  };
  return (
    <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
      {items.length === 0 ? (
        <p className="dshbm-m-0 dshbm-text-2xs dshbm-text-muted-foreground">
          {emptyLabel || 'None yet.'}
        </p>
      ) : null}
      {items.map((item, index) => (
        <div
          key={`${item.index ?? 'new'}-${index}`}
          className="dshbm-group dshbm-flex dshbm-items-center dshbm-gap-2"
        >
          <Checkbox
            checked={item.checked}
            onCheckedChange={(value) =>
              onChange(
                items.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, checked: value === true } : entry,
                ),
              )
            }
            aria-label={`Mark ${item.text} ${item.checked ? 'incomplete' : 'complete'}`}
          />
          <Input
            value={item.text}
            onChange={(event) =>
              onChange(
                items.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, text: event.target.value } : entry,
                ),
              )
            }
            className="dshbm-h-6 dshbm-flex-1 dshbm-border-transparent dshbm-bg-transparent dshbm-px-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            className="dshbm-opacity-50 group-hover:dshbm-opacity-100 focus-visible:dshbm-opacity-100"
            onClick={() => onChange(items.filter((_entry, entryIndex) => entryIndex !== index))}
            aria-label={`Remove ${item.text}`}
          >
            <X size={12} />
          </Button>
        </div>
      ))}
      <div className="dshbm-flex dshbm-items-center dshbm-gap-1.5 dshbm-pt-0.5">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Add an item…"
          className="dshbm-h-6 dshbm-flex-1"
        />
        <Button type="button" variant="outline" size="xs" onClick={add} disabled={!draft.trim()}>
          <Plus size={11} />
          Add
        </Button>
      </div>
    </div>
  );
}

export function BacklogTaskDetails({
  sessionId,
  workspaceKey,
  taskId,
  status,
  milestones,
  allTasks,
  onBack,
  onOpenTask,
  onSendToChat,
  onNewSubtask,
  onNotify,
}: {
  sessionId: string;
  workspaceKey: string;
  taskId: string;
  status: BacklogReadyStatus;
  milestones: BacklogMilestone[];
  allTasks: BacklogTask[];
  onBack: () => void;
  onOpenTask: (taskId: string) => void;
  onSendToChat: (task: BacklogTask) => void;
  onNewSubtask: (task: BacklogTask) => void;
  onNotify: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const taskQuery = useBacklogTask(sessionId, workspaceKey, taskId, true);
  const updateMutation = useUpdateBacklogTask(sessionId, workspaceKey);
  const archiveMutation = useArchiveBacklogTask(sessionId, workspaceKey);
  const deleteMutation = useDeleteBacklogTask(sessionId, workspaceKey);

  const [form, setForm] = React.useState<TaskForm | null>(null);
  const [baseline, setBaseline] = React.useState<TaskForm | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [external, setExternal] = React.useState<TaskForm | null>(null);
  const [conflict, setConflict] = React.useState<{
    fresh: BacklogTask;
    freshForm: TaskForm;
    fields: Array<keyof TaskForm>;
  } | null>(null);
  const [confirm, setConfirm] = React.useState<'archive' | 'delete' | 'discard' | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  const task = taskQuery.data ?? null;
  const dirty = Boolean(form && baseline && !formsEqual(form, baseline));
  const busy = saving || archiveMutation.isPending || deleteMutation.isPending;

  React.useEffect(() => {
    setForm(null);
    setBaseline(null);
    setExternal(null);
    setConflict(null);
    setError(null);
    setSavedAt(null);
  }, [taskId]);

  React.useEffect(() => {
    if (!task) return;
    const freshForm = formFromTask(task, milestones);
    if (!form || !baseline) {
      setForm(freshForm);
      setBaseline(freshForm);
      return;
    }
    if (formsEqual(form, baseline)) {
      if (!formsEqual(form, freshForm)) {
        setForm(freshForm);
        setBaseline(freshForm);
      }
      setExternal(null);
      return;
    }
    const changed = changedFields(baseline, freshForm);
    if (changed.length > 0) setExternal(freshForm);
  }, [task, milestones, form, baseline]);

  React.useEffect(() => {
    if (taskQuery.error instanceof Error) setError(taskQuery.error.message);
  }, [taskQuery.error]);

  const goBack = React.useCallback(() => {
    if (dirty) {
      setConfirm('discard');
      return;
    }
    onBack();
  }, [dirty, onBack]);

  const save = React.useCallback(
    async (options?: { fresh?: BacklogTask; freshForm?: TaskForm; merge?: boolean }) => {
      if (!form || !baseline || saving) return;
      setSaving(true);
      setError(null);
      try {
        const fresh: BacklogTask =
          options?.fresh ??
          ((await queryClient.fetchQuery({
            queryKey: backlogKeys.task(workspaceKey, taskId),
            queryFn: ({ signal }) => fetchTask(sessionId, taskId, signal),
            staleTime: 0,
          })) as BacklogTask);
        const freshForm = options?.freshForm ?? formFromTask(fresh, milestones);
        const baseForDiff = options?.merge ? freshForm : baseline;
        const nextForm = options?.merge ? mergeConflict(baseline, form, freshForm) : form;
        const fields = changedFields(baseForDiff, nextForm);
        if (fields.length === 0) {
          setBaseline(freshForm);
          setForm(freshForm);
          setExternal(null);
          setSavedAt(Date.now());
          setSaving(false);
          return;
        }
        const changes = diffChanges(baseForDiff, nextForm, milestones);
        const updated = await updateMutation.mutateAsync({ taskId, changes });
        const updatedForm = formFromTask(updated, milestones);
        setForm(updatedForm);
        setBaseline(updatedForm);
        setExternal(null);
        setSavedAt(Date.now());
        onNotify('Task saved to Backlog.md');
      } catch (caught) {
        if (caught instanceof BridgeRequestError) {
          if (caught.code === 'conflict') {
            try {
              const fresh = await fetchTask(sessionId, taskId);
              const freshForm = formFromTask(fresh, milestones);
              setConflict({
                fresh,
                freshForm,
                fields: changedFields(baseline, freshForm),
              });
            } catch {
              setError(caught.message);
            }
          } else {
            setError(caught.message);
          }
        } else {
          setError(caught instanceof Error ? caught.message : 'Could not save the task.');
        }
      } finally {
        setSaving(false);
      }
    },
    [
      baseline,
      form,
      milestones,
      onNotify,
      queryClient,
      saving,
      sessionId,
      taskId,
      updateMutation,
      workspaceKey,
    ],
  );

  const requestSave = React.useCallback(() => {
    if (!form || !baseline) return;
    const conflictFields = external ? changedFields(baseline, external) : [];
    if (external && conflictFields.length > 0) {
      setConflict({
        fresh: task as BacklogTask,
        freshForm: external,
        fields: conflictFields,
      });
      return;
    }
    void save();
  }, [baseline, external, form, save, task]);

  const archive = React.useCallback(async () => {
    setConfirmError(null);
    try {
      await archiveMutation.mutateAsync(taskId);
      onNotify('Task archived in Backlog.md');
      onBack();
    } catch (caught) {
      setConfirmError(caught instanceof Error ? caught.message : 'Could not archive the task.');
    }
  }, [archiveMutation, onBack, onNotify, taskId]);

  const permanentlyDelete = React.useCallback(async () => {
    setConfirmError(null);
    try {
      await deleteMutation.mutateAsync(taskId);
      onNotify('Task permanently deleted from Backlog.md');
      onBack();
    } catch (caught) {
      setConfirmError(caught instanceof Error ? caught.message : 'Could not delete the task.');
    }
  }, [deleteMutation, onBack, onNotify, taskId]);

  if (taskQuery.isLoading && !task) {
    return <DetailSkeleton onBack={onBack} />;
  }
  if (taskQuery.isError || !task) {
    return (
      <div className="dshbm-flex dshbm-flex-1 dshbm-flex-col dshbm-items-center dshbm-justify-center dshbm-gap-2 dshbm-p-4">
        <p className="dshbm-m-0 dshbm-text-xs dshbm-text-muted-foreground">
          {taskQuery.error instanceof Error
            ? taskQuery.error.message
            : 'This task is no longer available.'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          Back to tasks
        </Button>
      </div>
    );
  }
  if (!form || !baseline) {
    return <DetailSkeleton onBack={onBack} />;
  }

  const parent = task.parentTaskId
    ? allTasks.find((item) => item.id === task.parentTaskId)
    : undefined;
  const children = allTasks.filter((item) => item.parentTaskId === task.id);
  const done = children.filter((child) => isDoneStatus(child.status, status.statuses)).length;
  const dirtyFields = changedFields(baseline, form);
  const eligibleDependencies = allTasks.filter(
    (item) => item.id !== task.id && !form.dependencies.includes(item.id),
  );
  const statusOptions = [
    ...new Set(
      [...status.statuses, task.status, form.status].filter((value): value is string =>
        Boolean(value),
      ),
    ),
  ];
  const priorityOptions = [
    ...new Set(
      [
        ...(status.config.priorities ?? []),
        'High',
        'Medium',
        'Low',
        task.priority,
        form.priority,
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
  const milestoneOptions = [
    ...milestones.map((milestone) => milestone.title),
    ...(form.milestone ? [form.milestone] : []),
  ].filter((value, index, list) => list.indexOf(value) === index);

  return (
    <div className="dshbm-flex dshbm-min-h-0 dshbm-flex-1 dshbm-flex-col">
      <div className="dshbm-flex dshbm-flex-none dshbm-items-center dshbm-gap-2 dshbm-border-b dshbm-border-border dshbm-px-2 dshbm-py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          onClick={goBack}
          aria-label="Back to tasks"
          title="Back to tasks"
        >
          <ArrowLeft size={14} />
        </Button>
        <Badge className="dshbm-font-mono dshbm-text-2xs dshbm-tone-neutral">{task.id}</Badge>
        {parent ? (
          <button
            type="button"
            className="dshbm-inline-flex dshbm-max-w-[150px] dshbm-items-center dshbm-gap-1 dshbm-truncate dshbm-text-2xs dshbm-text-muted-foreground hover:dshbm-text-foreground"
            onClick={() => onOpenTask(parent.id)}
            title={`Parent: ${parent.title}`}
          >
            <ChevronRight size={10} className="dshbm-rotate-180" />
            {parent.title}
          </button>
        ) : null}
        <div className="dshbm-ml-auto dshbm-flex dshbm-items-center dshbm-gap-1">
          {dirty ? (
            <span className="dshbm-text-2xs dshbm-text-[var(--dsw-alias-state-warn-label)]">
              Unsaved changes
            </span>
          ) : savedAt ? (
            <span className="dshbm-text-2xs dshbm-text-muted-foreground">Saved</span>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="iconSm" aria-label="Task actions">
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard.writeText(task.id);
                  onNotify('Task ID copied');
                }}
              >
                <Copy size={12} />
                Copy task ID
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSendToChat(task)}>
                <Send size={12} />
                Send to Chat
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onNewSubtask(task)}>
                <Plus size={12} />
                New subtask
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfirm('archive')}>
                <Archive size={12} />
                Archive task
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => setConfirm('delete')}>
                <Trash2 size={12} />
                Delete permanently
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="dshbm-scroll dshbm-flex-1">
        {external ? (
          <div className="dshbm-mx-3 dshbm-mt-3 dshbm-flex dshbm-flex-wrap dshbm-items-center dshbm-gap-2 dshbm-rounded-md dshbm-border dshbm-border-border dshbm-bg-secondary dshbm-px-2 dshbm-py-1.5">
            <span className="dshbm-text-2xs dshbm-text-muted-foreground">
              Backlog.md changed this task outside the panel.
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                setForm(external);
                setBaseline(external);
                setExternal(null);
                setError(null);
              }}
            >
              Reload latest
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={requestSave}>
              Review merge
            </Button>
          </div>
        ) : null}

        {error ? (
          <div className="dshbm-mx-3 dshbm-mt-3 dshbm-flex dshbm-items-start dshbm-gap-2 dshbm-rounded-md dshbm-bg-destructive/10 dshbm-px-2 dshbm-py-1.5">
            <span className="dshbm-text-2xs dshbm-text-destructive">{error}</span>
          </div>
        ) : null}

        <div className="dshbm-px-3 dshbm-pt-3">
          <Input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            className="dshbm-h-auto dshbm-border-transparent dshbm-bg-transparent dshbm-px-0 dshbm-py-1 dshbm-text-base dshbm-font-semibold focus-visible:dshbm-ring-0"
            aria-label="Task title"
            maxLength={500}
          />
          <div className="dshbm-mt-1 dshbm-flex dshbm-flex-wrap dshbm-items-center dshbm-gap-2 dshbm-text-2xs dshbm-text-muted-foreground">
            <StatusBadge status={task.status} statuses={status.statuses} />
            <PriorityBadge priority={task.priority} />
            {task.assignee.length > 0 ? (
              <span className="dshbm-inline-flex dshbm-items-center dshbm-gap-1">
                <UserRound size={11} /> {task.assignee.join(', ')}
              </span>
            ) : null}
            <span className="dshbm-inline-flex dshbm-items-center dshbm-gap-1">
              <CalendarDays size={11} />
              {relativeDate(task.createdDate)}
            </span>
            {task.updatedDate ? (
              <span title={absoluteDate(task.updatedDate)}>
                updated {relativeDate(task.updatedDate)}
              </span>
            ) : null}
            {task.milestone ? (
              <span className="dshbm-inline-flex dshbm-items-center dshbm-gap-1">
                <Link2 size={11} /> {milestoneLabel(task, milestones)}
              </span>
            ) : null}
          </div>
        </div>

        <Section title="Metadata">
          <div className="dshbm-grid dshbm-grid-cols-2 dshbm-gap-2">
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm({ ...form, status: value })}
              >
                <SelectTrigger aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
              <Label>Priority</Label>
              <Select
                value={form.priority || '__none__'}
                onValueChange={(value) =>
                  setForm({ ...form, priority: value === '__none__' ? '' : value })
                }
              >
                <SelectTrigger aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {priorityOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
              <Label>Assignee</Label>
              <Input
                value={form.assignee}
                onChange={(event) => setForm({ ...form, assignee: event.target.value })}
                placeholder="alice, bob"
              />
            </div>
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
              <Label>Labels</Label>
              <Input
                value={form.labels}
                onChange={(event) => setForm({ ...form, labels: event.target.value })}
                placeholder="ui, docs"
              />
            </div>
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
              <Label>Milestone</Label>
              <Select
                value={form.milestone || '__none__'}
                onValueChange={(value) =>
                  setForm({ ...form, milestone: value === '__none__' ? '' : value })
                }
              >
                <SelectTrigger aria-label="Milestone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No milestone</SelectItem>
                  {milestoneOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
              <Label>Due date</Label>
              <Input
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                placeholder="YYYY-MM-DD"
              />
            </div>
          </div>
        </Section>

        <Section title="Description">
          <Textarea
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            className="dshbm-min-h-32 dshbm-font-mono"
            aria-label="Description in Markdown"
            placeholder="Markdown description…"
          />
          <p className="dshbm-mt-1 dshbm-m-0 dshbm-text-2xs dshbm-text-muted-foreground">
            Markdown is preserved exactly as Backlog.md stores it.
          </p>
        </Section>

        <Section title="Acceptance criteria">
          <CheckList
            items={form.acceptance}
            onChange={(acceptance) => setForm({ ...form, acceptance })}
            emptyLabel="No acceptance criteria yet."
          />
        </Section>

        <Section title="Definition of Done">
          <CheckList
            items={form.dod}
            onChange={(dod) => setForm({ ...form, dod })}
            emptyLabel="No checklist items yet."
          />
        </Section>

        <Section
          title={`Subtasks${children.length > 0 ? ` · ${done}/${children.length}` : ''}`}
          action={
            <Button type="button" variant="ghost" size="xs" onClick={() => onNewSubtask(task)}>
              <Plus size={11} />
              Add
            </Button>
          }
        >
          {children.length === 0 ? (
            <p className="dshbm-m-0 dshbm-text-2xs dshbm-text-muted-foreground">No subtasks.</p>
          ) : (
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
              <div className="dshbm-mb-1">
                <ProgressRing done={done} total={children.length} />
              </div>
              {children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  className="dshbm-flex dshbm-items-center dshbm-gap-2 dshbm-rounded-md dshbm-border dshbm-border-border dshbm-bg-transparent dshbm-px-2 dshbm-py-1.5 dshbm-text-left hover:dshbm-bg-secondary"
                  onClick={() => onOpenTask(child.id)}
                >
                  <span className="dshbm-font-mono dshbm-text-2xs dshbm-text-muted-foreground">
                    {child.id}
                  </span>
                  <span className="dshbm-min-w-0 dshbm-flex-1 dshbm-truncate dshbm-text-xs">
                    {child.title}
                  </span>
                  <StatusBadge status={child.status} statuses={status.statuses} />
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Dependencies">
          {form.dependencies.length === 0 ? (
            <p className="dshbm-m-0 dshbm-text-2xs dshbm-text-muted-foreground">No dependencies.</p>
          ) : (
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
              {form.dependencies.map((dependencyId) => {
                const dependency = allTasks.find((item) => item.id === dependencyId);
                return (
                  <div
                    key={dependencyId}
                    className="dshbm-flex dshbm-items-center dshbm-gap-2 dshbm-rounded-md dshbm-border dshbm-border-border dshbm-px-2 dshbm-py-1"
                  >
                    <button
                      type="button"
                      className="dshbm-min-w-0 dshbm-flex-1 dshbm-truncate dshbm-text-left dshbm-text-xs hover:dshbm-underline"
                      onClick={() => onOpenTask(dependencyId)}
                    >
                      <span className="dshbm-font-mono dshbm-text-2xs dshbm-text-muted-foreground">
                        {dependencyId}
                      </span>{' '}
                      {dependency?.title ?? ''}
                    </button>
                    {dependency ? (
                      <StatusBadge status={dependency.status} statuses={status.statuses} />
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="iconSm"
                      onClick={() =>
                        setForm({
                          ...form,
                          dependencies: form.dependencies.filter((id) => id !== dependencyId),
                        })
                      }
                      aria-label={`Remove dependency ${dependencyId}`}
                    >
                      <X size={12} />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="dshbm-mt-2">
            <Select
              value=""
              onValueChange={(value) => {
                if (!value || value === '__none__') return;
                setForm({ ...form, dependencies: [...form.dependencies, value] });
              }}
            >
              <SelectTrigger aria-label="Add dependency">
                <SelectValue placeholder="Add a dependency…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select a task…</SelectItem>
                {eligibleDependencies.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.id} · {candidate.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>

        {task.comments && task.comments.length > 0 ? (
          <Section title="Comments">
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-2">
              {task.comments.map((comment, index) => (
                <div
                  key={comment.id ?? index}
                  className="dshbm-rounded-md dshbm-border dshbm-border-border dshbm-px-2 dshbm-py-1.5"
                >
                  <div className="dshbm-mb-1 dshbm-flex dshbm-items-center dshbm-gap-2 dshbm-text-2xs dshbm-text-muted-foreground">
                    {comment.author ? <span>{comment.author}</span> : null}
                    {comment.createdDate ? <span>{relativeDate(comment.createdDate)}</span> : null}
                  </div>
                  <p className="dshbm-m-0 dshbm-whitespace-pre-wrap dshbm-text-xs">
                    {comment.body}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        <div className="dshbm-px-3 dshbm-py-3">
          <div className="dshbm-flex dshbm-flex-wrap dshbm-items-center dshbm-gap-2 dshbm-rounded-md dshbm-bg-secondary dshbm-px-2 dshbm-py-1.5 dshbm-text-2xs dshbm-text-muted-foreground">
            <span className="dshbm-inline-flex dshbm-items-center dshbm-gap-1">
              <ExternalLink size={11} />
              Backlog.md project: {status.workspace.name}
            </span>
            <span>Created {absoluteDate(task.createdDate) || '—'}</span>
            {task.updatedDate ? <span>Updated {absoluteDate(task.updatedDate)}</span> : null}
            {dirtyFields.length > 0 ? (
              <span className="dshbm-text-[var(--dsw-alias-state-warn-label)]">
                {dirtyFields.length} field{dirtyFields.length === 1 ? '' : 's'} changed
              </span>
            ) : null}
            <span className="dshbm-ml-auto">
              {status.server.managed ? 'Managed server' : 'Existing server'} ·{' '}
              {status.server.version}
            </span>
          </div>
        </div>
      </div>

      <div className="dshbm-flex dshbm-flex-none dshbm-items-center dshbm-gap-2 dshbm-border-t dshbm-border-border dshbm-bg-background dshbm-px-3 dshbm-py-2">
        {dirty ? (
          <span className="dshbm-inline-flex dshbm-items-center dshbm-gap-1 dshbm-text-2xs dshbm-text-muted-foreground">
            <span className="dshbm-h-1.5 dshbm-w-1.5 dshbm-rounded-full dshbm-bg-[var(--dsw-alias-state-warn-primary)]" />
            Unsaved changes
          </span>
        ) : (
          <span className="dshbm-text-2xs dshbm-text-muted-foreground">
            {savedAt ? 'Saved to Backlog.md' : 'Edits save through the official API.'}
          </span>
        )}
        <div className="dshbm-ml-auto dshbm-flex dshbm-items-center dshbm-gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!baseline) return;
              setForm(baseline);
              setExternal(null);
              setError(null);
            }}
            disabled={!dirty || busy}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={requestSave} disabled={!dirty || busy}>
            {saving ? <InlineSpinner /> : <Save size={12} />}
            Save
          </Button>
        </div>
      </div>

      <BacklogConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(open) => (!open ? setConfirm(null) : undefined)}
        title={`Archive ${task.id}?`}
        description="Backlog.md moves the task to its archive. The Markdown record, ID, and links are preserved, and the task leaves the board."
        confirmLabel="Archive task"
        busy={archiveMutation.isPending}
        error={confirmError}
        onConfirm={() => void archive()}
      />
      <BacklogConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => (!open ? setConfirm(null) : undefined)}
        title={`Permanently delete ${task.id}?`}
        description="The task is archived first, then removed with the official Backlog.md CLI. This cannot be undone and may fail if subtasks or links still exist."
        confirmLabel="Delete permanently"
        destructive
        requireText={task.id}
        busy={deleteMutation.isPending}
        error={confirmError}
        onConfirm={() => void permanentlyDelete()}
      />
      <BacklogConfirmDialog
        open={confirm === 'discard'}
        onOpenChange={(open) => (!open ? setConfirm(null) : undefined)}
        title="Discard unsaved changes?"
        description="Your edits have not been saved to Backlog.md. Leaving now discards them."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => {
          setConfirm(null);
          setForm(baseline);
          onBack();
        }}
      />

      <Dialog
        open={conflict !== null}
        onOpenChange={(open) => (open ? undefined : setConflict(null))}
      >
        <DialogContent aria-describedby="backlog-conflict-description">
          <DialogHeader>
            <DialogTitle>This task changed in Backlog.md</DialogTitle>
            <DialogDescription id="backlog-conflict-description">
              {conflict
                ? `These fields changed externally: ${conflict.fields
                    .map((field) => FIELD_LABELS[field])
                    .join(', ')}. Choose how to continue.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="dshbm-rounded-md dshbm-bg-secondary dshbm-px-2 dshbm-py-1.5 dshbm-text-2xs dshbm-text-muted-foreground">
            Nothing is saved until you choose. Reloading keeps the external version; merging keeps
            your edits and preserves external changes in fields you did not touch.
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConflict(null)}>
              Keep editing
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!conflict) return;
                setForm(conflict.freshForm);
                setBaseline(conflict.freshForm);
                setExternal(null);
                setConflict(null);
              }}
            >
              Reload latest
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!conflict) return;
                void save({
                  fresh: conflict.fresh,
                  freshForm: conflict.freshForm,
                  merge: true,
                });
                setConflict(null);
              }}
            >
              <Check size={12} />
              Merge my edits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="dshbm-flex dshbm-flex-1 dshbm-flex-col">
      <div className="dshbm-flex dshbm-items-center dshbm-gap-2 dshbm-border-b dshbm-border-border dshbm-px-2 dshbm-py-1.5">
        <Button type="button" variant="ghost" size="iconSm" onClick={onBack} aria-label="Back">
          <ArrowLeft size={14} />
        </Button>
        <span className="dshbm-skeleton dshbm-h-3 dshbm-w-20" />
      </div>
      <div className="dshbm-flex dshbm-flex-col dshbm-gap-2 dshbm-p-3">
        <span className="dshbm-skeleton dshbm-h-6 dshbm-w-2/3" />
        <span className="dshbm-skeleton dshbm-h-3 dshbm-w-1/3" />
        <span className="dshbm-skeleton dshbm-mt-3 dshbm-h-24 dshbm-w-full" />
        <span className="dshbm-skeleton dshbm-h-24 dshbm-w-full" />
      </div>
    </div>
  );
}
