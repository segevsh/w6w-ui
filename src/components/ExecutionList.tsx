import type { ReactNode } from "react";
import { ListItem } from "./ListItem.tsx";
import type { ExecutionStatus } from "./StepStatusPill.tsx";
import { StepStatusPill } from "./StepStatusPill.tsx";
import { formatDurationMs, formatExecutionTime } from "./execution-format.ts";

/** What kind of callable a run belongs to. A thin LOCAL literal — the same
 * deliberate duplication `StepStatusPill`'s unions keep. */
export type ExecutionKind = "function" | "endpoint" | "workflow";

/** One past execution's display row — an already-mapped slice of the host's
 * history payload. The HOST maps its own record into this shape (the same
 * "host owns the data, the list is presentational" split `ExecutionLogPanel`
 * establishes): this component never fetches, paginates or reaches for an SDK. */
export interface ExecutionListItem {
  /** Stable id for this row — what `onSelect` reports and `selectedId` matches. */
  id: string;
  kind: ExecutionKind;
  /** The callable's name/key this run belongs to. */
  callableName: string;
  status: ExecutionStatus;
  /** ISO-8601 instant the run started. */
  startedAt: string;
  /** Wall-clock duration once the run has finished; `null` while it is still
   * queued/running (rendered as `—`). */
  durationMs: number | null;
}

export interface ExecutionListProps {
  /** The page of past executions, rendered in exactly this order — never re-sorted. */
  items: ExecutionListItem[];
  /** The row to highlight as current. `null`/omitted ⇒ no row is active. */
  selectedId?: string | null;
  /** Supplied ⇒ rows are clickable and report their id here. Omitted ⇒ every
   * row is a plain, non-interactive row. */
  onSelect?: (id: string) => void;
  /**
   * `true` ⇒ each row's title is the callable's name and its subtitle carries
   * the kind + start time (the project-wide history view). `false` ⇒ the title
   * is the start time and the subtitle is the run id (the per-callable view,
   * where the callable is already known). Defaults to `false`.
   */
  showCallable?: boolean;
  /** `true` ⇒ the loading branch while there is nothing to show yet. */
  loading?: boolean;
  /** Shown instead of the list when `items` is empty. */
  emptyLabel?: ReactNode;
  /** Whether a previous page exists — drives the pager's `Previous` state. */
  hasPrev?: boolean;
  /** Whether a next page exists — drives the pager's `Next` state. */
  hasNext?: boolean;
  /** Supplied ⇒ the pager renders and `Previous` calls this. */
  onPrev?: () => void;
  /** Supplied ⇒ the pager renders and `Next` calls this. */
  onNext?: () => void;
}

/** Row subtitle's kind prefix, in the `showCallable` view. */
const KIND_LABEL: Record<ExecutionKind, string> = {
  function: "Function",
  endpoint: "Endpoint",
  workflow: "Workflow",
};

/**
 * A paged list of past executions: one row per run, click-to-select, with a
 * prev/next pager.
 *
 * A pure display leaf — no fetching, no polling, no sorting, no local
 * selection state. It renders `items` in the order given, reports a click, and
 * reports a page request; the host owns which page is loaded and which row is
 * selected.
 */
export function ExecutionList({
  items,
  selectedId = null,
  onSelect,
  showCallable = false,
  loading = false,
  emptyLabel,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: ExecutionListProps) {
  // Rendered in EVERY branch below, deliberately: a host that reports it can
  // go back to a previous page must still offer that control from an empty
  // page (the state reached by paging past the last run) and while a page is
  // loading.
  const pager =
    onPrev || onNext ? (
      <div className="w6w-execution-list-pager">
        <button
          type="button"
          className="w6w-btn w6w-btn-ghost"
          data-testid="execution-list-prev"
          disabled={!hasPrev}
          onClick={onPrev}
        >
          Previous
        </button>
        <button
          type="button"
          className="w6w-btn w6w-btn-ghost"
          data-testid="execution-list-next"
          disabled={!hasNext}
          onClick={onNext}
        >
          Next
        </button>
      </div>
    ) : null;

  let body: ReactNode;
  if (loading && items.length === 0) {
    body = <p data-testid="execution-list-loading">Loading…</p>;
  } else if (items.length === 0) {
    body = <p data-testid="execution-list-empty">{emptyLabel ?? "No executions yet."}</p>;
  } else {
    body = (
      <ul className="w6w-execution-list-rows">
        {items.map((item) => (
          <li key={item.id} data-testid="execution-row" data-execution-id={item.id}>
            <ListItem
              icon={<StepStatusPill state={item.status} />}
              title={showCallable ? item.callableName : formatExecutionTime(item.startedAt)}
              subtitle={
                showCallable
                  ? `${KIND_LABEL[item.kind]} · ${formatExecutionTime(item.startedAt)}`
                  : item.id
              }
              trailing={formatDurationMs(item.durationMs)}
              active={item.id === selectedId}
              onClick={onSelect ? () => onSelect(item.id) : undefined}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="w6w-execution-list" data-testid="execution-list">
      {body}
      {pager}
    </div>
  );
}
