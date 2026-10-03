import type { ExecutionKind } from "./ExecutionList.tsx";
import type { ExecutionStatus } from "./StepStatusPill.tsx";

/**
 * The filter/search state of the history view — one plain object, owned by the
 * HOST. This component is fully controlled: it holds no state of its own, it
 * only renders `value` and reports the next one. Same "host owns the data, the
 * control is presentational" split `ExecutionList` establishes, and the same
 * reason: the host owns where the filters live (URL search params today, a
 * query cache tomorrow) and this leaf must not disagree with it.
 */
export interface ExecutionFilterValue {
  /** `""` = "no status filter" (the `Any status` option), never `null`. */
  status: ExecutionStatus | "";
  /** `""` = "no kind filter" (the `Any type` option). Only reachable when the
   * host renders the kind select (`showKind`). */
  kind: ExecutionKind | "";
  /** Inclusive lower bound on the run's start, as `YYYY-MM-DD` — exactly what
   * `input[type=date]` reports and accepts. `""` = unbounded. */
  from: string;
  /** Inclusive upper bound on the run's start, same format. `""` = unbounded. */
  to: string;
  /** Free-text query. D3: the server matches execution id + callable name/key,
   * never payload JSON. */
  q: string;
}

export interface ExecutionFiltersProps {
  /** The current filter state — rendered verbatim, never re-derived. */
  value: ExecutionFilterValue;
  /** Called ONCE per user interaction with the ONE field that changed:
   * `{ ...value, <that field>: next }`. No debounce, no batching — the host
   * decides when a request is worth making (it may debounce `q` itself). */
  onChange: (next: ExecutionFilterValue) => void;
  /** `true` ⇒ the kind select renders between the status select and the date
   * bounds. Defaults to `false`: the per-callable history view already knows
   * the kind, so a kind filter there would be a control of one option. */
  showKind?: boolean;
  /** Placeholder for the search box. Defaults to `"Search by id or name"` —
   * the same two fields D3 pins the server-side search to. */
  searchPlaceholder?: string;
  /** `true` ⇒ every control (the clear button included) renders disabled — the
   * state a host uses while a request is already in flight. */
  disabled?: boolean;
}

/** The "nothing filtered" state — what Clear reports, and what a host starts
 * from. Kept module-local: it is one object literal, and a host that needs its
 * own initial value should own it (it must be encoded into a URL anyway). */
const EMPTY: ExecutionFilterValue = { status: "", kind: "", from: "", to: "", q: "" };

/** `""` first (the "any" option), then one entry per run state, capitalised. */
const STATUS_OPTIONS: Array<{ value: ExecutionStatus | ""; label: string }> = [
  { value: "", label: "Any status" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
  { value: "canceled", label: "Canceled" },
];

const KIND_OPTIONS: Array<{ value: ExecutionKind | ""; label: string }> = [
  { value: "", label: "Any type" },
  { value: "function", label: "Function" },
  { value: "endpoint", label: "Endpoint" },
  { value: "workflow", label: "Workflow" },
];

/**
 * The history view's filter/search bar: free text, status, (optionally) kind,
 * and a start-date window, plus a Clear control that appears only once there is
 * something to clear.
 *
 * A pure controlled leaf. Every change reports exactly one field's new value,
 * spread over the value it was given — a control that rebuilt the whole object
 * would silently drop a sibling filter the moment the two are edited close
 * together, and the host is the only party that knows the authoritative value.
 *
 * Each control carries its own `aria-label`: the visible layout is one dense
 * row of heterogeneous controls (a search box, three or four dropdowns, two
 * date pickers) with no room for a label per control, so the accessible name is
 * what tells them apart.
 */
export function ExecutionFilters({
  value,
  onChange,
  showKind = false,
  searchPlaceholder = "Search by id or name",
  disabled = false,
}: ExecutionFiltersProps) {
  const clearable =
    value.status !== "" ||
    value.kind !== "" ||
    value.from !== "" ||
    value.to !== "" ||
    value.q !== "";

  return (
    <div className="w6w-execution-filters" data-testid="execution-filters">
      <input
        type="search"
        className="w6w-execution-filters-search"
        data-testid="execution-filter-q"
        aria-label="Search executions"
        placeholder={searchPlaceholder}
        value={value.q}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, q: e.target.value })}
      />
      <select
        className="w6w-execution-filters-select"
        data-testid="execution-filter-status"
        aria-label="Status"
        value={value.status}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, status: e.target.value as ExecutionStatus | "" })}
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {showKind && (
        <select
          className="w6w-execution-filters-select"
          data-testid="execution-filter-kind"
          aria-label="Type"
          value={value.kind}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, kind: e.target.value as ExecutionKind | "" })}
        >
          {KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      <input
        type="date"
        className="w6w-execution-filters-date"
        data-testid="execution-filter-from"
        aria-label="From date"
        value={value.from}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
      />
      <input
        type="date"
        className="w6w-execution-filters-date"
        data-testid="execution-filter-to"
        aria-label="To date"
        value={value.to}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
      />
      {clearable && (
        <button
          type="button"
          className="w6w-btn w6w-btn-ghost w6w-execution-filters-clear"
          data-testid="execution-filter-clear"
          disabled={disabled}
          onClick={() => onChange({ ...EMPTY })}
        >
          Clear
        </button>
      )}
    </div>
  );
}
