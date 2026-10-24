import {
  type ExpandedState,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BacklogTaskList } from '../../src/client/components/BacklogTaskList';
import { BacklogTaskTable } from '../../src/client/components/BacklogTaskTable';
import { useBacklogColumns } from '../../src/client/components/columns';
import { buildTaskTree } from '../../src/client/lib/utils';
import type { BacklogTask } from '../../src/client/types';

const statuses = ['To Do', 'In Progress', 'Done'];
const tasks: BacklogTask[] = [
  {
    id: 'TASK-1',
    title: 'Zulu parent',
    status: 'In Progress',
    assignee: ['alice'],
    labels: ['ui'],
    dependencies: [],
    createdDate: '2026-10-24T19:00:00Z',
    ordinal: 1000,
  },
  {
    id: 'TASK-1.1',
    title: 'Child A',
    status: 'Done',
    assignee: [],
    labels: [],
    dependencies: [],
    createdDate: '2026-10-24T19:01:00Z',
    parentTaskId: 'TASK-1',
    ordinal: 1000,
  },
  {
    id: 'TASK-1.2',
    title: 'Child B',
    status: 'To Do',
    assignee: [],
    labels: [],
    dependencies: [],
    createdDate: '2026-10-24T19:02:00Z',
    parentTaskId: 'TASK-1',
    ordinal: 2000,
  },
  {
    id: 'TASK-2',
    title: 'Alpha solo',
    status: 'To Do',
    assignee: ['bob'],
    labels: [],
    dependencies: [],
    createdDate: '2026-10-24T19:03:00Z',
    ordinal: 500,
  },
];

function Harness({
  onOpen,
  initialSorting = [],
}: {
  onOpen: (task: BacklogTask) => void;
  initialSorting?: SortingState;
}) {
  const hierarchy = React.useMemo(() => buildTaskTree(tasks), []);
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const columns = useBacklogColumns({
    statuses,
    milestones: [],
    children: hierarchy.children,
    onOpen,
    onSendToChat: vi.fn(),
    onArchive: vi.fn(),
    onNewSubtask: vi.fn(),
  });
  const table = useReactTable({
    data: hierarchy.tree,
    columns,
    state: { sorting, expanded, rowSelection },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });
  return (
    <div>
      <BacklogTaskTable table={table} onRowOpen={onOpen} />
      <BacklogTaskList
        table={table}
        statuses={statuses}
        onRowOpen={onOpen}
        onSendToChat={vi.fn()}
        onArchive={vi.fn()}
        onNewSubtask={vi.fn()}
      />
    </div>
  );
}

describe('responsive task presentations', () => {
  it('renders both presentations from one table instance and switches via CSS container queries', () => {
    const { container } = render(<Harness onOpen={vi.fn()} />);
    expect(container.querySelector('.dshbm-wide')).not.toBeNull();
    expect(container.querySelector('.dshbm-narrow')).not.toBeNull();
    expect(container.querySelectorAll('.dshbm-table tbody tr')).toHaveLength(2);
    expect(container.querySelectorAll('.dshbm-compactRow')).toHaveLength(2);
    expect(screen.getAllByText('1/2')).toHaveLength(2);
  });

  it('shares expansion state between the table and the compact list', () => {
    const { container } = render(<Harness onOpen={vi.fn()} />);
    fireEvent.click(screen.getAllByLabelText('Expand subtasks')[0]);
    expect(container.querySelectorAll('.dshbm-table tbody tr')).toHaveLength(4);
    expect(container.querySelectorAll('.dshbm-compactRow')).toHaveLength(4);
    expect(screen.getAllByText('Child A').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Child B').length).toBeGreaterThanOrEqual(2);
  });

  it('sorts through the TanStack headless model and keeps both views in sync', () => {
    const { container } = render(<Harness onOpen={vi.fn()} />);
    const sortButton = [...container.querySelectorAll('.dshbm-table thead .dshbm-sortButton')].find(
      (button) => button.textContent?.startsWith('Title'),
    ) as HTMLButtonElement;
    fireEvent.click(sortButton);
    const rowTitles = () =>
      [...container.querySelectorAll('.dshbm-table tbody tr')].map(
        (row) => row.querySelector('.dshbm-rowTitleText')?.textContent,
      );
    expect(rowTitles()).toEqual(['Alpha solo', 'Zulu parent']);
  });

  it('defaults to In Progress first and To Do after it', () => {
    const { container } = render(
      <Harness onOpen={vi.fn()} initialSorting={[{ id: 'status', desc: false }]} />,
    );
    const titles = [...container.querySelectorAll('.dshbm-compactRow .dshbm-compactTitle')].map(
      (node) => node.textContent,
    );
    expect(titles).toEqual(['Zulu parent', 'Alpha solo']);
  });

  it('opens task details from a row click without losing the shared state', () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    fireEvent.click(screen.getAllByText('Zulu parent')[0]);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'TASK-1' }));
  });
});
