import { flexRender, type Table as TanStackTable } from '@tanstack/react-table';

import type { TaskNode } from '../types';

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
                return (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className={
                      optional ? 'dshbm-col-optional' : wide ? 'dshbm-col-wide' : undefined
                    }
                    data-compact={
                      header.column.id === 'select' || header.column.id === 'actions'
                        ? 'true'
                        : undefined
                    }
                    style={{ textAlign: header.column.id === 'select' ? 'center' : 'left' }}
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
                return (
                  <td
                    key={cell.id}
                    data-primary={cell.column.id === 'title' ? 'true' : undefined}
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
