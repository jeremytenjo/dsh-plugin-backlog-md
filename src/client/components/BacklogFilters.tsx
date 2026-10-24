import { Check, Columns3, Search, SlidersHorizontal, X } from 'lucide-react';
import * as React from 'react';

import type { BacklogFilters } from '../types';
import { EMPTY_FILTERS } from '../types';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

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
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={allValue(value)} onValueChange={(next) => onChange(fromAllValue(next))}>
      <SelectTrigger aria-label={label} className="dshbm-h-7 dshbm-text-[12px]">
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
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="dshbm-filterField">
      <span className="dshbm-filterFieldLabel">{label}</span>
      {children}
    </label>
  );
}

const SUMMARY_FIELDS: Array<[keyof BacklogFilters, string]> = [
  ['excludeStatus', 'Exclude'],
  ['priority', 'Priority'],
  ['milestone', 'Milestone'],
  ['label', 'Label'],
  ['assignee', 'Assignee'],
];

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
  const [open, setOpen] = React.useState(false);
  const active = SUMMARY_FIELDS.filter(([key]) => Boolean(filters[key]));
  const clear = () => onChange(EMPTY_FILTERS);
  const set = (patch: Partial<BacklogFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="dshbm-flex dshbm-flex-none dshbm-flex-col">
      <div className="dshbm-toolbar">
        <div className="dshbm-searchField">
          <Search className="dshbm-searchIcon" strokeWidth={1.8} aria-hidden="true" />
          <input
            type="search"
            value={filters.query}
            onChange={(event) => set({ query: event.target.value })}
            placeholder="Search tasks"
            aria-label="Search tasks"
            className="dshbm-searchInput [&::-webkit-search-cancel-button]:dshbm-hidden"
          />
          {filters.query ? (
            <button
              type="button"
              className="dshbm-searchClear"
              onClick={() => set({ query: '' })}
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="dshbm-filterToggle dshbm-flex-none"
          data-open={open ? 'true' : undefined}
          data-filter-toggle=""
          aria-expanded={open}
          aria-controls="backlog-filter-panel"
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal size={12} strokeWidth={1.8} />
          Filters
          {active.length > 0 ? <span className="dshbm-filterCount">{active.length}</span> : null}
        </Button>
        <ColumnMenu
          columnVisibility={columnVisibility}
          onChange={onColumnVisibilityChange}
          columns={columns}
        />
      </div>

      {open ? (
        <div id="backlog-filter-panel" className="dshbm-filterPanel" data-filter-panel="">
          <FilterField label="Exclude status">
            <FilterSelect
              label="Exclude status"
              value={filters.excludeStatus}
              options={statuses.map((status) => ({ value: status, label: status }))}
              onChange={(excludeStatus) => set({ excludeStatus })}
            />
          </FilterField>
          <FilterField label="Priority">
            <FilterSelect
              label="Priority"
              value={filters.priority}
              options={priorities.map((priority) => ({ value: priority, label: priority }))}
              onChange={(priority) => set({ priority })}
            />
          </FilterField>
          <FilterField label="Milestone">
            <FilterSelect
              label="Milestone"
              value={filters.milestone}
              options={milestones.map((milestone) => ({ value: milestone, label: milestone }))}
              onChange={(milestone) => set({ milestone })}
            />
          </FilterField>
          <FilterField label="Label">
            <FilterSelect
              label="Label"
              value={filters.label}
              options={labels.map((label) => ({ value: label, label }))}
              onChange={(label) => set({ label })}
            />
          </FilterField>
          <FilterField label="Assignee">
            <FilterSelect
              label="Assignee"
              value={filters.assignee}
              options={assignees.map((assignee) => ({ value: assignee, label: assignee }))}
              onChange={(assignee) => set({ assignee })}
            />
          </FilterField>
          {active.length > 0 || filters.query ? (
            <div className="dshbm-filterPanelActions">
              <Button type="button" variant="ghost" size="xs" onClick={clear}>
                Clear filters
              </Button>
            </div>
          ) : null}
        </div>
      ) : active.length > 0 ? (
        <div className="dshbm-filterSummary">
          <span className="dshbm-filterSummaryText">
            {active.map(([key, label]) => `${label}: ${String(filters[key])}`).join(' · ')}
          </span>
          <Button type="button" variant="ghost" size="xs" onClick={clear}>
            Clear
          </Button>
        </div>
      ) : null}
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
    <div className="dshbm-relative dshbm-flex-none">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            onClick={() => setOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Show columns"
          >
            <Columns3 size={14} strokeWidth={1.7} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Show columns</TooltipContent>
      </Tooltip>
      {open ? (
        <>
          <div
            className="dshbm-fixed dshbm-inset-0 dshbm-z-[2147483000]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="dshbm-popoverContent dshbm-absolute dshbm-right-0 dshbm-top-8 dshbm-z-[2147483001] dshbm-w-[190px] dshbm-p-1"
          >
            <div className="dshbm-px-2 dshbm-py-1.5 dshbm-text-[11.5px] dshbm-text-muted-foreground">
              Show columns
            </div>
            {columns.map((column) => {
              const shown = columnVisibility[column.id] !== false;
              return (
                <button
                  key={column.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={shown}
                  onClick={() => onChange({ ...columnVisibility, [column.id]: !shown })}
                  className="dshbm-flex dshbm-w-full dshbm-items-center dshbm-gap-2 dshbm-rounded-sm dshbm-px-2 dshbm-py-1.5 dshbm-text-left dshbm-text-[12px] dshbm-text-foreground hover:dshbm-bg-accent"
                >
                  <span className="dshbm-flex dshbm-h-3.5 dshbm-w-3.5 dshbm-flex-none dshbm-items-center dshbm-justify-center dshbm-rounded-[4px] dshbm-border dshbm-border-border">
                    {shown ? <Check size={10} strokeWidth={2.6} /> : null}
                  </span>
                  {column.label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
