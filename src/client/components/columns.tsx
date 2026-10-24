import type { ColumnDef, RowData } from '@tanstack/react-table';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  MessageSquarePlus,
  MoreHorizontal,
  Plus,
  Send,
} from 'lucide-react';
import * as React from 'react';
import {
  compareTaskStatus,
  compareTasks,
  milestoneLabel,
  relativeDate,
  subtaskProgress,
} from '../lib/utils';
import type { BacklogMilestone, BacklogTask, TaskNode } from '../types';
import { AvatarStack, LabelChips, PriorityBadge, ProgressRing, StatusBadge } from './badges';
import { Checkbox } from './ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    toggleable?: boolean;
  }
}

function SortHeader({
  label,
  column,
}: {
  label: string;
  column: {
    getIsSorted: () => false | 'asc' | 'desc';
    getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
  };
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className="dshbm-sortButton"
      onClick={column.getToggleSortingHandler()}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <span className="dshbm-sortGlyph" aria-hidden="true">
        {sorted === 'desc' ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
      </span>
    </button>
  );
}

export function useBacklogColumns({
  statuses,
  milestones,
  children,
  onOpen,
  onSendToChat,
  onArchive,
  onNewSubtask,
}: {
  statuses: string[];
  milestones: BacklogMilestone[];
  children: Map<string, BacklogTask[]>;
  onOpen: (task: BacklogTask) => void;
  onSendToChat: (task: BacklogTask) => void;
  onArchive: (task: BacklogTask) => void;
  onNewSubtask: (task: BacklogTask) => void;
}): ColumnDef<TaskNode>[] {
  return React.useMemo<ColumnDef<TaskNode>[]>(
    () => [
      {
        id: 'select',
        size: 28,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
            aria-label="Select all tasks on this page"
          />
        ),
        cell: ({ row }) => (
          <span onClick={(event) => event.stopPropagation()}>
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(value === true)}
              aria-label={`Select ${row.original.id}`}
            />
          </span>
        ),
      },
      {
        id: 'id',
        accessorKey: 'id',
        size: 74,
        header: ({ column }) => <SortHeader label="ID" column={column} />,
        cell: ({ row }) => <span className="dshbm-idCell">{row.original.id}</span>,
        meta: { label: 'ID', toggleable: true },
      },
      {
        id: 'title',
        accessorKey: 'title',
        size: 260,
        minSize: 180,
        header: ({ column }) => <SortHeader label="Title" column={column} />,
        cell: ({ row, table }) => {
          const progress = subtaskProgress(row.original.id, children, statuses);
          const depth = row.depth;
          return (
            <div
              className="dshbm-rowTitle"
              style={{ paddingLeft: depth > 0 ? Math.min(depth, 6) * 13 : 0 }}
            >
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
              ) : (
                <span className="dshbm-inline-block dshbm-h-4 dshbm-w-4 dshbm-flex-none" />
              )}
              <span className="dshbm-rowTitleText" title={row.original.title}>
                {row.original.title}
              </span>
              {progress.total > 0 ? (
                <ProgressRing done={progress.done} total={progress.total} />
              ) : null}
            </div>
          );
        },
        meta: { label: 'Title', toggleable: false },
      },
      {
        id: 'status',
        accessorKey: 'status',
        size: 96,
        header: ({ column }) => <SortHeader label="Status" column={column} />,
        cell: ({ row }) => <StatusBadge status={row.original.status} statuses={statuses} />,
        sortingFn: (left, right) => compareTaskStatus(left.original, right.original, statuses),
        sortDescFirst: false,
        meta: { label: 'Status', toggleable: true },
      },
      {
        id: 'priority',
        accessorKey: 'priority',
        size: 72,
        header: ({ column }) => <SortHeader label="Priority" column={column} />,
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
        meta: { label: 'Priority', toggleable: true },
      },
      {
        id: 'ordinal',
        accessorKey: 'ordinal',
        size: 62,
        header: ({ column }) => <SortHeader label="Ordinal" column={column} />,
        cell: ({ row }) => (
          <span className="dshbm-text-[11.5px] dshbm-tabular-nums">
            {typeof row.original.ordinal === 'number' ? row.original.ordinal : '—'}
          </span>
        ),
        sortingFn: (left, right) => compareTasks(left.original, right.original),
        meta: { label: 'Ordinal', toggleable: true },
      },
      {
        id: 'labels',
        accessorFn: (task) => task.labels.join(', '),
        size: 128,
        header: ({ column }) => <SortHeader label="Labels" column={column} />,
        cell: ({ row }) => <LabelChips labels={row.original.labels} />,
        meta: { label: 'Labels', toggleable: true },
      },
      {
        id: 'assignee',
        accessorFn: (task) => task.assignee.join(', '),
        size: 84,
        header: ({ column }) => <SortHeader label="Assignee" column={column} />,
        cell: ({ row }) => <AvatarStack names={row.original.assignee} />,
        meta: { label: 'Assignee', toggleable: true },
      },
      {
        id: 'milestone',
        accessorFn: (task) => milestoneLabel(task, milestones),
        size: 118,
        header: ({ column }) => <SortHeader label="Milestone" column={column} />,
        cell: ({ row }) => {
          const label = milestoneLabel(row.original, milestones);
          return label ? (
            <span className="dshbm-truncate" title={label}>
              {label}
            </span>
          ) : (
            <span className="dshbm-text-muted-foreground">—</span>
          );
        },
        meta: { label: 'Milestone', toggleable: true },
      },
      {
        id: 'created',
        accessorKey: 'createdDate',
        size: 82,
        header: ({ column }) => <SortHeader label="Created" column={column} />,
        cell: ({ row }) => (
          <span className="dshbm-text-[11.5px] dshbm-tabular-nums" title={row.original.createdDate}>
            {relativeDate(row.original.createdDate)}
          </span>
        ),
        meta: { label: 'Created', toggleable: true },
      },
      {
        id: 'actions',
        size: 30,
        enableSorting: false,
        enableHiding: false,
        header: () => null,
        cell: ({ row }) => (
          <span onClick={(event) => event.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="dshbm-rowAction dshbm-inline-flex dshbm-h-7 dshbm-w-7 dshbm-items-center dshbm-justify-center dshbm-rounded-md dshbm-text-muted-foreground hover:dshbm-bg-accent hover:dshbm-text-foreground"
                  aria-label={`Actions for ${row.original.id}`}
                >
                  <MoreHorizontal size={13} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onOpen(row.original)}>
                  Open details
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onSendToChat(row.original)}>
                  <Send size={12} />
                  Send to Chat
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onNewSubtask(row.original)}>
                  <Plus size={12} />
                  New subtask
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => onArchive(row.original)}>
                  <Archive size={12} />
                  Archive task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        ),
        meta: { label: 'Actions', toggleable: false },
      },
    ],
    [statuses, milestones, children, onOpen, onSendToChat, onArchive, onNewSubtask],
  );
}

export const TOGGLEABLE_COLUMNS = [
  { id: 'id', label: 'ID' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'ordinal', label: 'Ordinal' },
  { id: 'labels', label: 'Labels' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'milestone', label: 'Milestone' },
  { id: 'created', label: 'Created' },
];

export function TaskRowActions({
  task,
  onOpen,
  onSendToChat,
  onArchive,
  onNewSubtask,
}: {
  task: BacklogTask;
  onOpen: (task: BacklogTask) => void;
  onSendToChat: (task: BacklogTask) => void;
  onArchive: (task: BacklogTask) => void;
  onNewSubtask: (task: BacklogTask) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="dshbm-rowAction dshbm-inline-flex dshbm-h-7 dshbm-w-7 dshbm-items-center dshbm-justify-center dshbm-rounded-md dshbm-text-muted-foreground hover:dshbm-bg-accent hover:dshbm-text-foreground"
          aria-label={`Actions for ${task.id}`}
        >
          <MoreHorizontal size={13} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onOpen(task)}>Open details</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSendToChat(task)}>
          <MessageSquarePlus size={12} />
          Send to Chat
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onNewSubtask(task)}>
          <Plus size={12} />
          New subtask
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => onArchive(task)}>
          <Archive size={12} />
          Archive task
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
