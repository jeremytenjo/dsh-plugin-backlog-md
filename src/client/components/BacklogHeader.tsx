import { Plus, RefreshCw } from 'lucide-react';

import type { BacklogReadyStatus, ConnectionState } from '../types';
import { BacklogMark, ConnectionIndicator } from './badges';
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
      : `${filteredCount} of ${totalCount} tasks`;
  return (
    <header className="dshbm-header">
      <div className="dshbm-headerIdentity">
        <BacklogMark size={16} />
        <div className="dshbm-headerText">
          <h1 className="dshbm-title">Backlog</h1>
          <div className="dshbm-subtitle">
            <span className="dshbm-min-w-0 dshbm-truncate" title={status.workspace.name}>
              {status.workspace.name}
            </span>
            <span className="dshbm-flex-none dshbm-subtitleSeparator" aria-hidden="true">
              ·
            </span>
            <span className="dshbm-flex-none dshbm-whitespace-nowrap dshbm-tabular-nums">
              {count}
            </span>
          </div>
        </div>
      </div>
      <div className="dshbm-headerActions">
        <ConnectionIndicator state={connection} />
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
              <RefreshCw
                size={13}
                strokeWidth={1.7}
                className={refreshing ? 'dshbm-animate-spin' : undefined}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh tasks</TooltipContent>
        </Tooltip>
        <Button type="button" size="sm" onClick={onNewTask}>
          <Plus size={13} strokeWidth={1.9} />
          New task
        </Button>
      </div>
    </header>
  );
}
