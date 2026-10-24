import { cn, initials, statusTone } from '../lib/utils';
import type { ConnectionState } from '../types';
import { Badge } from './ui/badge';

/**
 * The product's mark: a short backlog list with one item checked.
 * Drawn here rather than borrowed from a generic icon set.
 */
export function BacklogMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={cn('dshbm-mark', className)}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.25 4h7.5M3.25 7h5.5M3.25 10h4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M9.5 12.1l1.6 1.5 2.5-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StatusBadge({
  status,
  statuses,
  className,
}: {
  status: string;
  statuses: string[];
  className?: string;
}) {
  if (!status) return <span className="dshbm-text-muted-foreground">—</span>;
  return (
    <Badge className={cn('dshbm-px-1.5', statusTone(status, statuses), className)}>{status}</Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority?: string; className?: string }) {
  if (!priority) return <span className="dshbm-text-muted-foreground">—</span>;
  const urgent = /high|critical|urgent|blocker/i.test(priority);
  return (
    <span
      className={cn(
        'dshbm-inline-flex dshbm-items-center dshbm-gap-1.5 dshbm-text-[11.5px]',
        urgent ? 'dshbm-text-foreground' : 'dshbm-text-muted-foreground',
        className,
      )}
    >
      {urgent ? <span className="dshbm-priorityDot" aria-hidden="true" /> : null}
      {priority}
    </span>
  );
}

export function ProgressRing({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  const ratio = Math.max(0, Math.min(1, done / total));
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      className="dshbm-inline-flex dshbm-flex-none dshbm-items-center dshbm-gap-1 dshbm-text-[11px] dshbm-text-muted-foreground"
      title={`${done} of ${total} subtasks done`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle
          cx="7"
          cy="7"
          r={radius}
          fill="none"
          stroke="var(--dsw-alias-border-l2)"
          strokeWidth="2"
        />
        <circle
          cx="7"
          cy="7"
          r={radius}
          fill="none"
          stroke="var(--dsw-alias-label-primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          transform="rotate(-90 7 7)"
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
          className="dshbm-avatar"
          style={{ marginLeft: index === 0 ? 0 : -5 }}
        >
          {initials(name)}
        </span>
      ))}
      {names.length > max ? (
        <span className="dshbm-ml-1 dshbm-text-[11px] dshbm-text-muted-foreground">
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
      className="dshbm-flex dshbm-min-w-0 dshbm-items-center dshbm-gap-1 dshbm-text-[11.5px] dshbm-text-muted-foreground"
      title={labels.join(', ')}
    >
      {labels.slice(0, max).map((label, index) => (
        <span key={label} className="dshbm-flex dshbm-min-w-0 dshbm-items-center dshbm-gap-1">
          {index > 0 ? (
            <span aria-hidden="true" className="dshbm-text-[var(--dsw-alias-label-tertiary)]">
              ·
            </span>
          ) : null}
          <span className="dshbm-max-w-[92px] dshbm-truncate">{label}</span>
        </span>
      ))}
      {labels.length > max ? (
        <span className="dshbm-text-[var(--dsw-alias-label-tertiary)]">+{labels.length - max}</span>
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
          ? 'var(--dsw-alias-state-business-primary)'
          : 'var(--dsw-alias-label-tertiary)';
  return (
    <span
      className="dshbm-inline-flex dshbm-items-center dshbm-gap-1 dshbm-text-[11px] dshbm-text-muted-foreground"
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
        className="dshbm-h-1.5 dshbm-w-1.5 dshbm-flex-none dshbm-rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />
      <span className="dshbm-connText">{label}</span>
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
