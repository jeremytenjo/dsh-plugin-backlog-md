import * as React from 'react';

import type { BacklogFilters } from '../types';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

function allValue(value: string) {
  return value || '__all__';
}

function fromAllValue(value: string) {
  return value === '__all__' ? '' : value;
}

interface SelectOption {
  value: string;
  label: string;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  width = 'dshbm-w-[120px]',
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  width?: string;
}) {
  return (
    <label className="dshbm-inline-flex dshbm-items-center dshbm-gap-1.5">
      <span className="dshbm-text-2xs dshbm-text-muted-foreground">{label}</span>
      <Select value={allValue(value)} onValueChange={(next) => onChange(fromAllValue(next))}>
        <SelectTrigger aria-label={label} className={`dshbm-h-6 ${width} dshbm-text-2xs`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function BacklogFilters({
  filters,
  onChange,
  statuses,
  priorities,
  milestones,
  labels,
  assignees,
  columnVisibility,
  onColumnVisibilityChange,
  columns,
}: {
  filters: BacklogFilters;
  onChange: (next: BacklogFilters) => void;
  statuses: string[];
  priorities: string[];
  milestones: string[];
  labels: string[];
  assignees: string[];
  columnVisibility: Record<string, boolean>;
  onColumnVisibilityChange: (next: Record<string, boolean>) => void;
  columns: Array<{ id: string; label: string }>;
}) {
  const activeCount = React.useMemo(
    () =>
      Object.entries(filters).filter(([key, value]) => {
        if (key === 'query') return false;
        return Boolean(value);
      }).length + (filters.query.trim() ? 1 : 0),
    [filters],
  );
  const set = (patch: Partial<BacklogFilters>) => onChange({ ...filters, ...patch });
  const clear = () =>
    onChange({
      query: '',
      status: '',
      excludeStatus: '',
      priority: '',
      milestone: '',
      label: '',
      assignee: '',
    });

  return (
    <div className="dshbm-flex dshbm-flex-none dshbm-flex-col dshbm-gap-1.5 dshbm-border-b dshbm-border-border dshbm-px-3 dshbm-py-2">
      <div className="dshbm-flex dshbm-flex-wrap dshbm-items-center dshbm-gap-1.5">
        <div className="dshbm-relative dshbm-min-w-[150px] dshbm-flex-1">
          <svg
            className="dshbm-pointer-events-none dshbm-absolute dshbm-left-2 dshbm-top-1/2 dshbm-h-3 dshbm-w-3 dshbm--translate-y-1/2 dshbm-text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={filters.query}
            onChange={(event) => set({ query: event.target.value })}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="dshbm-h-7 dshbm-w-full dshbm-rounded-md dshbm-border dshbm-border-border dshbm-bg-transparent dshbm-pl-7 dshbm-pr-2 dshbm-text-xs dshbm-text-foreground placeholder:dshbm-text-muted-foreground focus-visible:dshbm-outline-none focus-visible:dshbm-ring-1 focus-visible:dshbm-ring-ring"
          />
        </div>
        <FilterSelect
          label="Status"
          value={filters.status}
          options={statuses.map((status) => ({ value: status, label: status }))}
          onChange={(status) => set({ status })}
        />
        <FilterSelect
          label="Exclude"
          value={filters.excludeStatus}
          options={statuses.map((status) => ({ value: status, label: status }))}
          onChange={(excludeStatus) => set({ excludeStatus })}
        />
        <FilterSelect
          label="Priority"
          value={filters.priority}
          options={priorities.map((priority) => ({ value: priority, label: priority }))}
          onChange={(priority) => set({ priority })}
          width="dshbm-w-[104px]"
        />
        <FilterSelect
          label="Milestone"
          value={filters.milestone}
          options={milestones.map((milestone) => ({ value: milestone, label: milestone }))}
          onChange={(milestone) => set({ milestone })}
          width="dshbm-w-[130px]"
        />
        <FilterSelect
          label="Label"
          value={filters.label}
          options={labels.map((label) => ({ value: label, label }))}
          onChange={(label) => set({ label })}
          width="dshbm-w-[110px]"
        />
        <FilterSelect
          label="Assignee"
          value={filters.assignee}
          options={assignees.map((assignee) => ({ value: assignee, label: assignee }))}
          onChange={(assignee) => set({ assignee })}
          width="dshbm-w-[120px]"
        />
      </div>
      <div className="dshbm-flex dshbm-items-center dshbm-gap-2">
        {activeCount > 0 ? (
          <Button type="button" variant="ghost" size="xs" onClick={clear}>
            Clear {activeCount} {activeCount === 1 ? 'filter' : 'filters'}
          </Button>
        ) : (
          <span className="dshbm-text-2xs dshbm-text-muted-foreground">
            Filters combine. Search matches IDs, titles, labels, and assignees.
          </span>
        )}
        <div className="dshbm-ml-auto">
          <ColumnMenu
            columnVisibility={columnVisibility}
            onChange={onColumnVisibilityChange}
            columns={columns}
          />
        </div>
      </div>
    </div>
  );
}

function ColumnMenu({
  columnVisibility,
  onChange,
  columns,
}: {
  columnVisibility: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  columns: Array<{ id: string; label: string }>;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="dshbm-relative">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Columns
      </Button>
      {open ? (
        <>
          <div
            className="dshbm-fixed dshbm-inset-0 dshbm-z-[2147483000]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="dshbm-popoverContent dshbm-absolute dshbm-right-0 dshbm-top-7 dshbm-z-[2147483001] dshbm-w-[170px] dshbm-p-1"
          >
            {columns.map((column) => (
              <label
                key={column.id}
                className="dshbm-flex dshbm-cursor-pointer dshbm-items-center dshbm-gap-2 dshbm-rounded-sm dshbm-px-2 dshbm-py-1.5 dshbm-text-xs hover:dshbm-bg-accent"
              >
                <input
                  type="checkbox"
                  checked={columnVisibility[column.id] !== false}
                  onChange={(event) =>
                    onChange({ ...columnVisibility, [column.id]: event.target.checked })
                  }
                  className="dshbm-h-3 dshbm-w-3 dshbm-accent-[var(--dsw-alias-brand-primary)]"
                />
                {column.label}
              </label>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
