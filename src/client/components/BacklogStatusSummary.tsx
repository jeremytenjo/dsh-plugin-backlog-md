/**
 * The panel's one data strip: how the backlog divides by status, and the
 * fastest way to narrow the list. Counts are computed from the rows the
 * current search and filters leave, and the strip selects the status filter.
 */
export function BacklogStatusSummary({
  statuses,
  counts,
  total,
  selected,
  onSelect,
}: {
  statuses: string[];
  counts: Map<string, number>;
  total: number;
  selected: string;
  onSelect: (status: string) => void;
}) {
  return (
    <div className="dshbm-statusStrip" role="group" aria-label="Filter tasks by status">
      <button
        type="button"
        className="dshbm-statusTab"
        aria-pressed={!selected}
        onClick={() => onSelect('')}
      >
        All
        <span className="dshbm-statusCount">{total}</span>
      </button>
      {statuses.map((status) => {
        const active = selected === status;
        return (
          <button
            key={status}
            type="button"
            className="dshbm-statusTab"
            aria-pressed={active}
            onClick={() => onSelect(active ? '' : status)}
            title={active ? 'Show every status' : `Filter by ${status}`}
          >
            {status}
            <span className="dshbm-statusCount">{counts.get(status) ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
