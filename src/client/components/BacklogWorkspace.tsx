import { useQueryClient } from '@tanstack/react-query';
import {
  type ExpandedState,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Send } from 'lucide-react';
import * as React from 'react';
import {
  useArchiveBacklogTask,
  useBacklogMilestones,
  useBacklogTasks,
  useCreateBacklogTask,
} from '../hooks/useBacklog';
import { useBacklogConnection } from '../hooks/useBacklogConnection';
import { usePersistedState } from '../hooks/usePersistedState';
import {
  buildTaskTree,
  DEFAULT_COLUMN_VISIBILITY,
  milestoneLabel,
  taskMatchesFilters,
} from '../lib/utils';
import type { BacklogFilters, BacklogMilestone, BacklogReadyStatus, BacklogTask } from '../types';
import { EMPTY_FILTERS } from '../types';
import { BacklogConfirmDialog } from './BacklogConfirmDialog';
import { BacklogCreateTaskDialog, type CreateTaskInput } from './BacklogCreateTaskDialog';
import { BacklogFilters as BacklogFiltersBar } from './BacklogFilters';
import { BacklogHeader } from './BacklogHeader';
import { BacklogStatusSummary } from './BacklogStatusSummary';
import { BacklogTaskDetails } from './BacklogTaskDetails';
import { BacklogTaskList } from './BacklogTaskList';
import { BacklogTaskTable } from './BacklogTaskTable';
import { TOGGLEABLE_COLUMNS, useBacklogColumns } from './columns';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

export function BacklogWorkspace({
  status,
  sessionId,
  sendToChat,
  sendTasksToChat,
  tabVisible,
}: {
  status: BacklogReadyStatus;
  sessionId: string;
  sendToChat: (task: BacklogTask) => boolean;
  sendTasksToChat: (tasks: BacklogTask[]) => boolean;
  tabVisible: boolean;
}) {
  const queryClient = useQueryClient();
  const workspaceKey = status.workspace.key;
  const tasksQuery = useBacklogTasks(sessionId, workspaceKey, true);
  const milestonesQuery = useBacklogMilestones(sessionId, workspaceKey, true);
  const archiveMutation = useArchiveBacklogTask(sessionId, workspaceKey);
  const createMutation = useCreateBacklogTask(sessionId, workspaceKey);
  const connection = useBacklogConnection({ sessionId, workspaceKey, enabled: tabVisible });

  const tasks = tasksQuery.data ?? [];
  const milestones = milestonesQuery.data ?? [];
  const hierarchy = React.useMemo(() => buildTaskTree(tasks), [tasks]);

  const [filters, setFilters] = usePersistedState<BacklogFilters>(
    `dsh.backlog-md.filters.v1.${workspaceKey}`,
    EMPTY_FILTERS,
  );
  const deferredQuery = React.useDeferredValue(filters.query);
  const effectiveFilters = React.useMemo<BacklogFilters>(
    () => ({ ...filters, query: deferredQuery }),
    [filters, deferredQuery],
  );
  const [sorting, setSorting] = usePersistedState<SortingState>(
    `dsh.backlog-md.sorting.v1.${workspaceKey}`,
    [],
  );
  const [columnVisibility, setColumnVisibility] = usePersistedState<VisibilityState>(
    `dsh.backlog-md.columns.v1.${workspaceKey}`,
    DEFAULT_COLUMN_VISIBILITY,
  );
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = usePersistedState<PaginationState>(
    `dsh.backlog-md.pagination.v1.${workspaceKey}`,
    { pageIndex: 0, pageSize: 100 },
  );
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createParentId, setCreateParentId] = React.useState<string | null>(null);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<BacklogTask | null>(null);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = React.useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  React.useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const statusOptions = React.useMemo(
    () => unique([...status.statuses, ...tasks.map((task) => task.status)]),
    [status.statuses, tasks],
  );
  const priorityOptions = React.useMemo(
    () => unique([...(status.config.priorities ?? []), ...tasks.map((task) => task.priority)]),
    [status.config.priorities, tasks],
  );
  const milestoneOptions = React.useMemo(
    () =>
      unique([
        ...milestones.map((milestone) => milestone.title),
        ...tasks.map((task) => milestoneLabel(task, milestones)),
      ]),
    [milestones, tasks],
  );
  const labelOptions = React.useMemo(() => unique(tasks.flatMap((task) => task.labels)), [tasks]);
  const assigneeOptions = React.useMemo(
    () => unique(tasks.flatMap((task) => task.assignee)),
    [tasks],
  );

  // Counts on the status strip are the rows the table would show, including the
  // parent rows it keeps for context, so a click lands on the count it promised.
  const statusSummary = React.useMemo(() => {
    const rowCount = (filtersToCount: BacklogFilters) => {
      const rows = new Set<string>();
      for (const task of tasks) {
        if (!taskMatchesFilters(task, filtersToCount, status.statuses, milestones)) continue;
        rows.add(task.id);
        for (const ancestor of hierarchy.ancestors.get(task.id) ?? []) rows.add(ancestor);
      }
      return rows.size;
    };
    const baseFilters = { ...effectiveFilters, status: '' };
    const counts = new Map<string, number>(
      statusOptions.map((value) => [value, rowCount({ ...baseFilters, status: value })]),
    );
    return { counts, total: rowCount(baseFilters) };
  }, [effectiveFilters, hierarchy.ancestors, milestones, status.statuses, statusOptions, tasks]);

  const openTask = React.useCallback((task: BacklogTask) => {
    setSelectedTaskId(task.id);
  }, []);

  const openNewSubtask = React.useCallback((task: BacklogTask) => {
    setCreateParentId(task.id);
    setCreateError(null);
    setCreateOpen(true);
  }, []);

  const requestArchive = React.useCallback((task: BacklogTask) => {
    setArchiveError(null);
    setArchiveTarget(task);
  }, []);

  const sendTaskToChat = React.useCallback(
    (task: BacklogTask) => {
      const sent = sendToChat(task);
      notify(sent ? `${task.id} added to the composer` : 'Could not reach the composer');
    },
    [notify, sendToChat],
  );

  const columns = useBacklogColumns({
    statuses: statusOptions,
    milestones,
    children: hierarchy.children,
    onOpen: openTask,
    onSendToChat: sendTaskToChat,
    onArchive: requestArchive,
    onNewSubtask: openNewSubtask,
  });

  const table = useReactTable({
    data: hierarchy.tree,
    columns,
    state: {
      sorting,
      columnVisibility,
      expanded,
      rowSelection,
      pagination,
      globalFilter: effectiveFilters,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, value) =>
      taskMatchesFilters(row.original, value as BacklogFilters, status.statuses, milestones),
    filterFromLeafRows: true,
    enableRowSelection: true,
    autoResetPageIndex: true,
  });

  React.useEffect(() => {
    const active = Object.entries(effectiveFilters).some(([key, value]) =>
      key === 'query' ? Boolean(String(value).trim()) : Boolean(value),
    );
    if (!active) return;
    const matching = tasks.filter((task) =>
      taskMatchesFilters(task, effectiveFilters, status.statuses, milestones),
    );
    const parents = new Set<string>();
    for (const task of matching) {
      for (const parent of hierarchy.ancestors.get(task.id) ?? []) parents.add(parent);
    }
    if (parents.size === 0) return;
    setExpanded((current) => {
      const next: Record<string, boolean> =
        typeof current === 'object' && current !== null ? { ...current } : {};
      let changed = false;
      for (const parent of parents) {
        if (!next[parent]) {
          next[parent] = true;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [effectiveFilters, hierarchy.ancestors, milestones, status.statuses, tasks]);

  const filteredCount = table.getFilteredRowModel().flatRows.length;
  const totalCount = tasks.length;
  const selectedTasks = table.getSelectedRowModel().flatRows.map((row) => row.original);
  const sendSelected = React.useCallback(() => {
    if (selectedTasks.length === 0) return;
    const sent = sendTasksToChat(selectedTasks);
    if (sent) table.resetRowSelection();
  }, [selectedTasks, sendTasksToChat, table]);
  const refreshing = tasksQuery.isFetching || milestonesQuery.isFetching;
  const page = table.getState().pagination;
  const pageCount = table.getPageCount();
  const firstRow = filteredCount === 0 ? 0 : page.pageIndex * page.pageSize + 1;
  const lastRow = Math.min(filteredCount, (page.pageIndex + 1) * page.pageSize);
  const parentTask = createParentId
    ? (tasks.find((task) => task.id === createParentId) ?? null)
    : null;
  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['backlog', workspaceKey] });
    void queryClient.invalidateQueries({ queryKey: ['backlog', 'status', sessionId] });
    void tasksQuery.refetch();
    void milestonesQuery.refetch();
  }, [milestonesQuery, queryClient, sessionId, tasksQuery, workspaceKey]);

  const submitCreate = React.useCallback(
    async (input: CreateTaskInput) => {
      setCreateError(null);
      try {
        const created = await createMutation.mutateAsync(
          input as unknown as Record<string, unknown>,
        );
        setCreateOpen(false);
        setCreateParentId(null);
        notify(`${created.id} created in Backlog.md`);
        if (!parentTask) setSelectedTaskId(created.id);
      } catch (caught) {
        setCreateError(caught instanceof Error ? caught.message : 'Could not create the task.');
      }
    },
    [createMutation, notify, parentTask],
  );

  const confirmArchive = React.useCallback(async () => {
    if (!archiveTarget) return;
    setArchiveError(null);
    try {
      await archiveMutation.mutateAsync(archiveTarget.id);
      notify(`${archiveTarget.id} archived`);
      if (selectedTaskId === archiveTarget.id) setSelectedTaskId(null);
      setArchiveTarget(null);
    } catch (caught) {
      setArchiveError(caught instanceof Error ? caught.message : 'Could not archive the task.');
    }
  }, [archiveMutation, archiveTarget, notify, selectedTaskId]);

  const changePageSize = (value: string) => {
    const size = value === 'all' ? 100_000 : Number.parseInt(value, 10);
    setPagination({ pageIndex: 0, pageSize: Number.isFinite(size) ? size : 100 });
  };

  if (selectedTaskId) {
    return (
      <div className="dshbm-flex dshbm-min-h-0 dshbm-flex-1 dshbm-flex-col">
        <BacklogTaskDetails
          sessionId={sessionId}
          workspaceKey={workspaceKey}
          taskId={selectedTaskId}
          status={status}
          milestones={milestones}
          allTasks={tasks}
          onBack={() => setSelectedTaskId(null)}
          onOpenTask={(id) => setSelectedTaskId(id)}
          onSendToChat={sendTaskToChat}
          onNewSubtask={openNewSubtask}
          onNotify={notify}
        />
        <CreateDialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) setCreateParentId(null);
          }}
          parentTask={parentTask}
          status={status}
          milestones={milestones}
          submitting={createMutation.isPending}
          error={createError}
          onSubmit={submitCreate}
        />
        <ArchiveDialog
          target={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          error={archiveError}
          busy={archiveMutation.isPending}
          onConfirm={confirmArchive}
        />
        {toast ? <div className="dshbm-toast">{toast}</div> : null}
      </div>
    );
  }

  return (
    <div className="dshbm-flex dshbm-min-h-0 dshbm-flex-1 dshbm-flex-col">
      <BacklogHeader
        status={status}
        filteredCount={filteredCount}
        totalCount={totalCount}
        connection={connection.state}
        refreshing={refreshing}
        onRefresh={refresh}
        onNewTask={() => {
          setCreateParentId(null);
          setCreateError(null);
          setCreateOpen(true);
        }}
      />
      <BacklogStatusSummary
        statuses={statusOptions}
        counts={statusSummary.counts}
        total={statusSummary.total}
        selected={filters.status}
        onSelect={(nextStatus) => {
          setFilters({ ...filters, status: nextStatus });
          setPagination((current) => ({ ...current, pageIndex: 0 }));
          table.resetRowSelection();
        }}
      />
      <BacklogFiltersBar
        filters={filters}
        onChange={(next) => {
          setFilters(next);
          setPagination((current) => ({ ...current, pageIndex: 0 }));
          table.resetRowSelection();
        }}
        statuses={statusOptions}
        priorities={priorityOptions}
        milestones={milestoneOptions}
        labels={labelOptions}
        assignees={assigneeOptions}
        columnVisibility={columnVisibility as Record<string, boolean>}
        onColumnVisibilityChange={(next) => setColumnVisibility(next)}
        columns={TOGGLEABLE_COLUMNS}
      />

      {selectedTasks.length > 0 ? (
        <div className="dshbm-selectionBar">
          <span className="dshbm-selectionCount">{selectedTasks.length} selected</span>
          <Button type="button" variant="ghost" size="xs" onClick={sendSelected}>
            <Send size={12} />
            Send to chat
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={() => table.resetRowSelection()}>
            Clear
          </Button>
        </div>
      ) : null}

      {tasksQuery.isLoading ? (
        <div className="dshbm-flex dshbm-flex-1 dshbm-flex-col dshbm-px-3 dshbm-pt-2">
          {Array.from({ length: 10 }).map((_, index) => (
            <span key={index} className="dshbm-skeleton" style={{ height: 38, marginBottom: 1 }} />
          ))}
        </div>
      ) : tasksQuery.error ? (
        <EmptyState
          title="Could not load tasks"
          description={
            tasksQuery.error instanceof Error
              ? tasksQuery.error.message
              : 'The Backlog.md server did not answer.'
          }
          action={
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              <RefreshCw size={12} />
              Retry
            </Button>
          }
        />
      ) : totalCount === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Create the first Backlog.md task. Agents can also add tasks with the Backlog.md CLI or MCP server."
          action={
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={12} />
              New task
            </Button>
          }
        />
      ) : filteredCount === 0 ? (
        <EmptyState
          title="No tasks match"
          description={`${totalCount} tasks are hidden by the current search and filters.`}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <BacklogTaskTable table={table} onRowOpen={openTask} />
          <BacklogTaskList
            table={table}
            statuses={status.statuses}
            onRowOpen={openTask}
            onSendToChat={sendTaskToChat}
            onArchive={requestArchive}
            onNewSubtask={openNewSubtask}
          />
        </>
      )}

      <div className="dshbm-panelFooter">
        <span className="dshbm-tabular-nums">
          {filteredCount === 0 ? '0 tasks' : `${firstRow}–${lastRow} of ${filteredCount}`}
        </span>
        <span className="dshbm-ml-auto dshbm-flex dshbm-items-center dshbm-gap-1">
          <span>Rows</span>
          <Select
            value={page.pageSize >= 100_000 ? 'all' : String(page.pageSize)}
            onValueChange={changePageSize}
          >
            <SelectTrigger
              className="dshbm-h-6 dshbm-w-[70px] dshbm-text-[11px]"
              aria-label="Rows per page"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="250">250</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft size={12} />
          </Button>
          <span className="dshbm-min-w-[40px] dshbm-text-center dshbm-tabular-nums">
            {pageCount === 0 ? '0 / 0' : `${page.pageIndex + 1} / ${pageCount}`}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight size={12} />
          </Button>
        </span>
      </div>

      <CreateDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateParentId(null);
        }}
        parentTask={parentTask}
        status={status}
        milestones={milestones}
        submitting={createMutation.isPending}
        error={createError}
        onSubmit={submitCreate}
      />
      <ArchiveDialog
        target={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        error={archiveError}
        busy={archiveMutation.isPending}
        onConfirm={confirmArchive}
      />
      {toast ? <div className="dshbm-toast">{toast}</div> : null}
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="dshbm-emptyWrap">
      <div className="dshbm-empty">
        <div className="dshbm-emptyText">
          <p className="dshbm-emptyTitle">{title}</p>
          <p className="dshbm-emptyBody">{description}</p>
        </div>
        <div className="dshbm-emptyAction">{action}</div>
      </div>
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  parentTask,
  status,
  milestones,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentTask: BacklogTask | null;
  status: BacklogReadyStatus;
  milestones: BacklogMilestone[];
  submitting: boolean;
  error: string | null;
  onSubmit: (input: CreateTaskInput) => Promise<void>;
}) {
  return (
    <BacklogCreateTaskDialog
      open={open}
      onOpenChange={onOpenChange}
      parentTask={parentTask}
      statuses={status.statuses}
      priorities={
        status.config.priorities && status.config.priorities.length > 0
          ? status.config.priorities
          : ['High', 'Medium', 'Low']
      }
      milestones={milestones}
      defaultStatus={status.config.defaultStatus ?? status.statuses[0] ?? 'To Do'}
      submitting={submitting}
      error={error}
      onSubmit={onSubmit}
    />
  );
}

function ArchiveDialog({
  target,
  onClose,
  error,
  busy,
  onConfirm,
}: {
  target: BacklogTask | null;
  onClose: () => void;
  error: string | null;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <BacklogConfirmDialog
      open={Boolean(target)}
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title={target ? `Archive ${target.id}?` : 'Archive task?'}
      description="Backlog.md moves the task to its archive. The Markdown record, ID, and links are preserved, and the task leaves the board."
      confirmLabel="Archive task"
      busy={busy}
      error={error}
      onConfirm={onConfirm}
    />
  );
}
