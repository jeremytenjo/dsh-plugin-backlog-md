import { cn, initials, priorityTone, statusTone } from '../lib/utils';
import type { ConnectionState } from '../types';
import { Badge } from './ui/badge';

export function StatusBadge({
  status,
  statuses,
  className,
}: {
  status: string;
  statuses: string[];
  className?: string;
}) {
  return (
    <Badge className={cn('dshbm-gap-1 dshbm-px-1.5', statusTone(status, statuses), className)}>
      <span className="dshbm-h-1 dshbm-w-1 dshbm-rounded-full dshbm-bg-current dshbm-opacity-80" />
      {status || '—'}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority?: string; className?: string }) {
  if (!priority) return <span className="dshbm-text-muted-foreground">—</span>;
  return (
    <Badge className={cn('dshbm-px-1.5', priorityTone(priority), className)}>{priority}</Badge>
  );
}

export function ProgressRing({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  const ratio = Math.max(0, Math.min(1, done / total));
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      className="dshbm-inline-flex dshbm-items-center dshbm-gap-1 dshbm-text-2xs dshbm-text-muted-foreground"
      title={`${done} of ${total} subtasks done`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke="var(--dsw-alias-border-l2)"
          strokeWidth="2"
        />
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke="var(--dsw-alias-state-success-primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          transform="rotate(-90 8 8)"
        />
      </svg>
      <span className="dshbm-tabular-nums">
        {done}/{total}
      </span>
    </span>
  );
}

export function AvatarStack({ names, max = 2 }: { names: string[]; max?: number }) {
  if (names.length === 0) return <span className="dshbm-text-muted-foreground">—</span>;
  const visible = names.slice(0, max);
  return (
    <span className="dshbm-inline-flex dshbm-items-center" title={names.join(', ')}>
      {visible.map((name, index) => (
        <span
          key={`${name}-${index}`}
          className="dshbm-avatar dshbm--ml-1 first:dshbm-ml-0"
          style={{ marginLeft: index === 0 ? 0 : -4 }}
        >
          {initials(name)}
        </span>
      ))}
      {names.length > max ? (
        <span className="dshbm-ml-1 dshbm-text-2xs dshbm-text-muted-foreground">
          +{names.length - max}
        </span>
      ) : null}
    </span>
  );
}

export function LabelChips({ labels, max = 2 }: { labels: string[]; max?: number }) {
  if (labels.length === 0) return <span className="dshbm-text-muted-foreground">—</span>;
  return (
    <span
      className="dshbm-flex dshbm-min-w-0 dshbm-items-center dshbm-gap-1"
      title={labels.join(', ')}
    >
      {labels.slice(0, max).map((label) => (
        <span
          key={label}
          className="dshbm-inline-flex dshbm-max-w-[92px] dshbm-items-center dshbm-truncate dshbm-rounded dshbm-border dshbm-border-border dshbm-bg-secondary dshbm-px-1 dshbm-py-[1px] dshbm-text-2xs dshbm-text-muted-foreground"
        >
          {label}
        </span>
      ))}
      {labels.length > max ? (
        <span className="dshbm-text-2xs dshbm-text-muted-foreground">+{labels.length - max}</span>
      ) : null}
    </span>
  );
}

export function ConnectionIndicator({ state }: { state: ConnectionState }) {
  const label =
    state === 'live'
      ? 'Live'
      : state === 'connecting'
        ? 'Connecting'
        : state === 'reconnecting'
          ? 'Reconnecting'
          : 'Offline';
  const color =
    state === 'live'
      ? 'var(--dsw-alias-state-success-primary)'
      : state === 'reconnecting'
        ? 'var(--dsw-alias-state-warn-primary)'
        : state === 'connecting'
          ? 'var(--dsw-alias-brand-primary)'
          : 'var(--dsw-alias-label-tertiary)';
  return (
    <span
      className="dshbm-inline-flex dshbm-items-center dshbm-gap-1.5 dshbm-text-2xs dshbm-text-muted-foreground"
      title={
        state === 'live'
          ? 'Connected to Backlog.md notifications'
          : state === 'reconnecting'
            ? 'Reconnecting to Backlog.md notifications'
            : state === 'connecting'
              ? 'Connecting to Backlog.md notifications'
              : 'Backlog.md notifications are offline'
      }
    >
      <span
        className={cn(
          'dshbm-h-1.5 dshbm-w-1.5 dshbm-rounded-full',
          state === 'live' && 'dshbm-animate-pulse',
        )}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

export function InlineSpinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'dshbm-inline-block dshbm-h-3 dshbm-w-3 dshbm-animate-spin dshbm-rounded-full dshbm-border dshbm-border-muted-foreground/30 dshbm-border-t-foreground',
        className,
      )}
      aria-hidden="true"
    />
  );
}
