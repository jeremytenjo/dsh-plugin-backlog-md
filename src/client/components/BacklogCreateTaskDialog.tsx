import * as React from 'react';
import { splitList } from '../lib/utils';
import type { BacklogMilestone, BacklogTask } from '../types';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input, Label, Textarea } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string[];
  labels?: string[];
  milestone?: string;
  dueDate?: string;
  parentTaskId?: string;
  acceptanceCriteriaItems?: Array<{ text: string; checked: boolean }>;
}

export function BacklogCreateTaskDialog({
  open,
  onOpenChange,
  parentTask,
  statuses,
  priorities,
  milestones,
  defaultStatus,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentTask: BacklogTask | null;
  statuses: string[];
  priorities: string[];
  milestones: BacklogMilestone[];
  defaultStatus: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: CreateTaskInput) => Promise<void> | void;
}) {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [status, setStatus] = React.useState(defaultStatus);
  const [priority, setPriority] = React.useState('');
  const [assignee, setAssignee] = React.useState('');
  const [labels, setLabels] = React.useState('');
  const [milestone, setMilestone] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [criteria, setCriteria] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setStatus(defaultStatus || statuses[0] || 'To Do');
    setPriority('');
    setAssignee('');
    setLabels('');
    setMilestone('');
    setDueDate('');
    setCriteria('');
  }, [open, defaultStatus, statuses]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || submitting) return;
    const input: CreateTaskInput = {
      title: title.trim(),
      ...(description.trim() ? { description } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(splitList(assignee).length > 0 ? { assignee: splitList(assignee) } : {}),
      ...(splitList(labels).length > 0 ? { labels: splitList(labels) } : {}),
      ...(milestone ? { milestone } : {}),
      ...(dueDate.trim() ? { dueDate: dueDate.trim() } : {}),
      ...(parentTask ? { parentTaskId: parentTask.id } : {}),
      ...(criteria.trim()
        ? {
            acceptanceCriteriaItems: criteria
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean)
              .map((text) => ({ text, checked: false })),
          }
        : {}),
    };
    await onSubmit(input);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!submitting ? onOpenChange(next) : undefined)}>
      <DialogContent aria-describedby="backlog-create-description">
        <DialogHeader>
          <DialogTitle>{parentTask ? 'New subtask' : 'New task'}</DialogTitle>
          <DialogDescription id="backlog-create-description">
            {parentTask
              ? `Add a subtask under ${parentTask.id} · ${parentTask.title}`
              : 'Create a task in the Backlog.md project. Backlog.md assigns the ID.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="dshbm-flex dshbm-flex-col dshbm-gap-2.5">
          <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
            <Label htmlFor="backlog-new-title">Title</Label>
            <Input
              id="backlog-new-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs to be done?"
              autoFocus
              maxLength={500}
            />
          </div>
          <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
            <Label htmlFor="backlog-new-description">Description (Markdown)</Label>
            <Textarea
              id="backlog-new-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Context, notes, and links…"
              className="dshbm-min-h-20"
            />
          </div>
          <div className="dshbm-grid dshbm-grid-cols-2 dshbm-gap-2">
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((option) => (
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
                value={priority || '__none__'}
                onValueChange={(value) => setPriority(value === '__none__' ? '' : value)}
              >
                <SelectTrigger aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {priorities.map((option) => (
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
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
                placeholder="alice, bob"
              />
            </div>
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
              <Label>Labels</Label>
              <Input
                value={labels}
                onChange={(event) => setLabels(event.target.value)}
                placeholder="ui, docs"
              />
            </div>
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
              <Label>Milestone</Label>
              <Select
                value={milestone || '__none__'}
                onValueChange={(value) => setMilestone(value === '__none__' ? '' : value)}
              >
                <SelectTrigger aria-label="Milestone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No milestone</SelectItem>
                  {milestones.map((option) => (
                    <SelectItem key={option.id} value={option.title}>
                      {option.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
              <Label>Due date</Label>
              <Input
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </div>
          </div>
          <div className="dshbm-flex dshbm-flex-col dshbm-gap-1">
            <Label>Acceptance criteria (one per line)</Label>
            <Textarea
              value={criteria}
              onChange={(event) => setCriteria(event.target.value)}
              placeholder={'Works end to end\nTests cover the change'}
              className="dshbm-min-h-16"
            />
          </div>
          {error ? (
            <p className="dshbm-m-0 dshbm-rounded-md dshbm-bg-destructive/10 dshbm-px-2 dshbm-py-1.5 dshbm-text-2xs dshbm-text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || submitting}>
              {submitting ? 'Creating…' : 'Create task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
