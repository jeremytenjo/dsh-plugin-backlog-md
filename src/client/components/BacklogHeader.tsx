import { ListTodo, Plus, RefreshCw } from 'lucide-react';

import type { BacklogReadyStatus, ConnectionState } from '../types';
import { ConnectionIndicator } from './badges';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function BacklogHeader({
  status,
  filteredCount,
  totalCount,
  connection,
  refreshing,
  onRefresh,
  onNewTask,
}: {
  status: BacklogReadyStatus;
  filteredCount: number;
  totalCount: number;
  connection: ConnectionState;
  refreshing: boolean;
  onRefresh: () => void;
  onNewTask: () => void;
}) {
  const count =
    filteredCount === totalCount
      ? `${totalCount} ${totalCount === 1 ? 'task' : 'tasks'}`
      : `${filteredCount} of ${totalCount}`;
  return (
    <div className="dshbm-flex dshbm-flex-none dshbm-items-center dshbm-gap-2 dshbm-border-b dshbm-border-border dshbm-px-3 dshbm-py-2">
      <ListTodo size={15} strokeWidth={1.6} className="dshbm-flex-none dshbm-text-brand-primary" />
      <span className="dshbm-text-xs dshbm-font-semibold dshbm-text-foreground">Backlog</span>
      <span className="dshbm-max-w-[160px] dshbm-truncate dshbm-text-2xs dshbm-text-muted-foreground">
        {status.workspace.name}
      </span>
      <span className="dshbm-rounded-full dshbm-bg-secondary dshbm-px-1.5 dshbm-py-[1px] dshbm-text-2xs dshbm-tabular-nums dshbm-text-muted-foreground">
        {count}
      </span>
      <ConnectionIndicator state={connection} />
      <div className="dshbm-ml-auto dshbm-flex dshbm-items-center dshbm-gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="iconSm"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh tasks"
            >
              <RefreshCw size={13} className={refreshing ? 'dshbm-animate-spin' : undefined} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh tasks</TooltipContent>
        </Tooltip>
        <Button type="button" size="sm" onClick={onNewTask}>
          <Plus size={12} />
          New Task
        </Button>
      </div>
    </div>
  );
}
