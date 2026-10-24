import { flexRender, type Table as TanStackTable } from '@tanstack/react-table';

import type { TaskNode } from '../types';

const NUMERIC_COLUMNS = new Set(['ordinal', 'created']);

export function BacklogTaskTable({
  table,
  onRowOpen,
}: {
  table: TanStackTable<TaskNode>;
  onRowOpen: (task: TaskNode) => void;
}) {
  const rows = table.getRowModel().rows;
  return (
    <div className="dshbm-wide dshbm-scroll dshbm-flex-1">
      <table className="dshbm-table" role="grid" aria-label="Backlog tasks">
        <colgroup>
          {table.getVisibleLeafColumns().map((column) => {
            const optional = ['ordinal', 'labels', 'assignee'].includes(column.id);
            const wide = ['milestone', 'created'].includes(column.id);
            return (
              <col
                key={column.id}
                className={
                  optional ? 'dshbm-col-optionalCol' : wide ? 'dshbm-col-wideCol' : undefined
                }
                style={{
                  width: column.id === 'title' ? 'auto' : column.getSize(),
                }}
              />
            );
          })}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const optional = ['ordinal', 'labels', 'assignee'].includes(header.column.id);
                const wide = ['milestone', 'created'].includes(header.column.id);
                const numeric = NUMERIC_COLUMNS.has(header.column.id);
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    scope="col"
                    colSpan={header.colSpan}
                    data-column={header.column.id}
                    data-numeric={numeric ? 'true' : undefined}
                    data-sorted={sorted ? 'true' : 'false'}
                    className={
                      optional ? 'dshbm-col-optional' : wide ? 'dshbm-col-wide' : undefined
                    }
                    data-compact={
                      header.column.id === 'select' || header.column.id === 'actions'
                        ? 'true'
                        : undefined
                    }
                    aria-sort={
                      header.column.getCanSort()
                        ? sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : 'none'
                        : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-selected={row.getIsSelected() ? 'true' : undefined}
              data-state={row.getIsExpanded() ? 'open' : undefined}
              aria-selected={row.getIsSelected()}
              tabIndex={0}
              onClick={() => onRowOpen(row.original)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onRowOpen(row.original);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              {row.getVisibleCells().map((cell) => {
                const optional = ['ordinal', 'labels', 'assignee'].includes(cell.column.id);
                const wide = ['milestone', 'created'].includes(cell.column.id);
                const numeric = NUMERIC_COLUMNS.has(cell.column.id);
                return (
                  <td
                    key={cell.id}
                    data-column={cell.column.id}
                    data-primary={cell.column.id === 'title' ? 'true' : undefined}
                    data-numeric={numeric ? 'true' : undefined}
                    data-compact={
                      cell.column.id === 'select' || cell.column.id === 'actions'
                        ? 'true'
                        : undefined
                    }
                    className={
                      optional ? 'dshbm-col-optional' : wide ? 'dshbm-col-wide' : undefined
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
