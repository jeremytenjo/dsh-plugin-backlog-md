import type { Table as TanStackTable } from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { relativeDate, subtaskProgress } from '../lib/utils';
import type { BacklogTask, TaskNode } from '../types';
import { AvatarStack, PriorityBadge, ProgressRing, StatusBadge } from './badges';
import { TaskRowActions } from './columns';
import { Checkbox } from './ui/checkbox';

export function BacklogTaskList({
  table,
  statuses,
  onRowOpen,
  onSendToChat,
  onArchive,
  onNewSubtask,
}: {
  table: TanStackTable<TaskNode>;
  statuses: string[];
  onRowOpen: (task: TaskNode) => void;
  onSendToChat: (task: BacklogTask) => void;
  onArchive: (task: BacklogTask) => void;
  onNewSubtask: (task: BacklogTask) => void;
}) {
  const rows = table.getRowModel().rows;
  const children = React.useMemo(() => {
    const map = new Map<string, BacklogTask[]>();
    for (const row of table.getPrePaginationRowModel().flatRows) {
      const task = row.original;
      if (!task.parentTaskId) continue;
      const list = map.get(task.parentTaskId) ?? [];
      list.push(task);
      map.set(task.parentTaskId, list);
    }
    return map;
  }, [table]);

  return (
    <div className="dshbm-narrow dshbm-scroll dshbm-flex-1" role="list" aria-label="Backlog tasks">
      {rows.map((row) => {
        const task = row.original;
        const progress = subtaskProgress(task.id, children, statuses);
        return (
          <div
            key={row.id}
            role="listitem"
            className="dshbm-compactRow"
            data-selected={row.getIsSelected() ? 'true' : undefined}
            tabIndex={0}
            onClick={() => onRowOpen(task)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onRowOpen(task);
              }
            }}
            style={{ paddingLeft: 10 + Math.min(row.depth, 6) * 13 }}
          >
            <span
              className="dshbm-mt-0.5 dshbm-flex dshbm-flex-none"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(value === true)}
                aria-label={`Select ${task.id}`}
              />
            </span>
            <div className="dshbm-min-w-0 dshbm-flex-1">
              <div className="dshbm-flex dshbm-items-center dshbm-gap-1.5">
                {row.getCanExpand() ? (
                  <button
                    type="button"
                    className="dshbm-inline-flex dshbm-h-4 dshbm-w-4 dshbm-flex-none dshbm-items-center dshbm-justify-center dshbm-rounded dshbm-text-muted-foreground hover:dshbm-bg-accent hover:dshbm-text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      row.toggleExpanded();
                    }}
                    aria-label={row.getIsExpanded() ? 'Collapse subtasks' : 'Expand subtasks'}
                    aria-expanded={row.getIsExpanded()}
                  >
                    {row.getIsExpanded() ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                ) : null}
                <span className="dshbm-min-w-0 dshbm-flex-1 dshbm-truncate dshbm-text-xs dshbm-font-medium dshbm-text-foreground">
                  {task.title}
                </span>
                {progress.total > 0 ? (
                  <ProgressRing done={progress.done} total={progress.total} />
                ) : null}
                <StatusBadge status={task.status} statuses={statuses} />
              </div>
              <div className="dshbm-mt-1 dshbm-flex dshbm-flex-wrap dshbm-items-center dshbm-gap-x-2 dshbm-gap-y-1 dshbm-text-2xs dshbm-text-muted-foreground">
                <span className="dshbm-font-mono dshbm-tabular-nums">{task.id}</span>
                {task.priority ? <PriorityBadge priority={task.priority} /> : null}
                {task.assignee.length > 0 ? <AvatarStack names={task.assignee} max={1} /> : null}
                <span>{relativeDate(task.createdDate)}</span>
              </div>
            </div>
            <span
              className="dshbm-flex dshbm-flex-none dshbm-items-center"
              onClick={(event) => event.stopPropagation()}
            >
              <TaskRowActions
                task={task}
                onOpen={onRowOpen}
                onSendToChat={onSendToChat}
                onArchive={onArchive}
                onNewSubtask={onNewSubtask}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
