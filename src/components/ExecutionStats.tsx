import type { ReactNode } from "react";
import { formatDurationMs } from "./execution-format.ts";

/**
 * The aggregate numbers of a history view — the same rows the list shows,
 * rolled up (D1: stats are computed over the same visibility the list uses, so
 * the two can never disagree about who may see what).
 *
 * `succeeded`/`canceled` are carried even though the strip renders no card for
 * them today: the host's payload has them, the breakdown is what a host needs
 * for a chart or a chip row, and a host re-deriving them from the list would be
 * computing the same total a second time.
 */
export interface ExecutionStatsValue {
  /** Every run in the current filter — the denominator of `successRate`. */
  total: number;
  succeeded: number;
  failed: number;
  canceled: number;
  /** Runs that are queued or running right now. `> 0` is what makes the
   * `In flight` card exist at all. */
  inFlight: number;
  /** `0…1`, or `null` when the host has no rate to report (no runs at all —
   * a rate over zero runs is not 0%). */
  successRate: number | null;
  /** Mean wall-clock duration of the FINISHED runs, or `null` when none has
   * finished. */
  avgDurationMs: number | null;
}

export interface ExecutionStatsProps {
  /** The aggregate, or `null` while nothing has loaded yet — rendered as `—`
   * per card rather than as a spinner, so the strip never changes height. */
  stats: ExecutionStatsValue | null;
  /** Caption above the cards, e.g. the window they cover ("Last 7 days").
   * Omitted ⇒ no node at all. */
  label?: ReactNode;
}

/** What an absent/unknown number renders as — never `0`, which would read as a
 * measured result. Same em dash `execution-format.ts` uses for the same
 * reason. */
const UNKNOWN = "—";

interface Card {
  testid: string;
  label: string;
  value: string;
}

/**
 * A headline strip of run aggregates: one big value over a muted label per
 * card.
 *
 * Promotes studio `DashboardPage.tsx`'s page-local `StatCard` into `ui`, with
 * two differences that come from this being a shared component rather than one
 * page's private helper: the values are pre-formatted here (a rate as `67%`, a
 * duration through `formatDurationMs`) so every consumer renders the same
 * string, and each card carries `data-stat-value` so a host can assert on the
 * value without re-parsing its own formatting.
 */
export function ExecutionStats({ stats, label }: ExecutionStatsProps) {
  const cards: Card[] = [
    {
      testid: "execution-stat-total",
      label: "Executions",
      value: stats ? String(stats.total) : UNKNOWN,
    },
    {
      testid: "execution-stat-success-rate",
      label: "Success rate",
      value: formatSuccessRate(stats?.successRate),
    },
    {
      testid: "execution-stat-failed",
      label: "Failed",
      value: stats ? String(stats.failed) : UNKNOWN,
    },
    {
      testid: "execution-stat-avg-duration",
      label: "Avg duration",
      value: stats ? formatDurationMs(stats.avgDurationMs) : UNKNOWN,
    },
  ];

  // The one CONDITIONAL card: a zero in-flight count is the steady state, and a
  // permanent "In flight 0" would draw the eye to the least interesting number
  // in the strip. A missing `stats` counts as zero, so the strip keeps four
  // cards while loading instead of five-then-four.
  if (stats && stats.inFlight > 0) {
    cards.push({
      testid: "execution-stat-in-flight",
      label: "In flight",
      value: String(stats.inFlight),
    });
  }

  return (
    <section className="w6w-execution-stats" data-testid="execution-stats">
      {label != null && <p className="w6w-execution-stats-label">{label}</p>}
      <div className="w6w-execution-stats-cards">
        {cards.map((card) => (
          <div key={card.testid} className="w6w-execution-stat" data-testid={card.testid}>
            <span className="w6w-execution-stat-value" data-stat-value={card.value}>
              {card.value}
            </span>
            <span className="w6w-execution-stat-label">{card.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * A `0…1` rate as a whole-percent string (`0.666…` → `"67%"`, rounded rather
 * than floored so `2/3` does not read as `66%`).
 *
 * `null` (nothing to report) and a non-finite rate (a host dividing by zero
 * somewhere upstream) are both `—` — the same totality `formatDurationMs`
 * keeps, so no input can render `NaN%`.
 */
function formatSuccessRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return UNKNOWN;
  return `${Math.round(rate * 100)}%`;
}
