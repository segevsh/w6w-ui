/**
 * The four states a single day of the strip can be in — a thin LOCAL copy of the
 * RFC's `HealthReport.state` union, exactly as `HealthStatusPill` keeps one. The
 * duplication is deliberate: it keeps `@w6w/ui` a pure-presentation leaf with no
 * transport/spec coupling, so nothing here has to move when the spec package does.
 *
 * There is no fifth state. A day on which the account made no calls at all is
 * `unknown`, never `ok` — an unverified day must never be presented as a healthy
 * one (`rfcs/healthcheck.md`: `unknown` ranks above `ok` for that reason).
 */
export type UptimeCellState = "ok" | "degraded" | "down" | "unknown";

/** One cell: the day it stands for, and the state already decided for it. */
export interface UptimeDay {
  /** The day this cell represents, e.g. `2026-07-27`. Shown verbatim in the tooltip. */
  day: string;
  /** The state for that day. The strip renders it; it never decides it. */
  state: UptimeCellState;
  /** Tooltip override. Defaults to `<day> — <state label>`. */
  label?: string;
}

export interface UptimeStripProps {
  /**
   * The days to render, oldest first, one cell each. The component makes no
   * assumption about how many there are — a caller showing a 30-day window
   * passes 30, and a younger account can pass fewer.
   */
  days: UptimeDay[];
  /**
   * Accessible label for the strip as a whole (it is exposed as one image, not
   * as N unlabelled boxes). Defaults to `<n>-day status`.
   */
  ariaLabel?: string;
}

const STATE_LABELS: Record<UptimeCellState, string> = {
  ok: "Operational",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown",
};

/**
 * A fixed-height strip of one cell per day, for "how has this service behaved
 * lately" at a glance.
 *
 * Purely presentational — it is handed an array of ALREADY-DECIDED states and
 * renders exactly those. No rules, no roll-up and no judgement about what counts
 * as broken live in this package; whatever decided the states owns that.
 *
 * Colour is never the only signal (same rule as `HealthStatusPill`, which pairs
 * its dot with a text label). Thirty cells cannot carry thirty labels, so the
 * strip signals twice in two other ways:
 *   - every cell carries a `title` with its day and state, and
 *   - the FILL HEIGHT encodes severity, so the row survives greyscale and
 *     colour-blind viewing: `ok` is a short baseline bar, `degraded` a taller
 *     one, `down` fills the cell, and `unknown` is a hatched outline with no
 *     solid fill at all (nothing was measured — it is not a good day and not a
 *     bad one).
 *
 * Colour itself comes from the shared `--w6w-health-*` tokens through the single
 * `--w6w-health-color` indirection the health pill uses, so a host that
 * overrides a token restyles the pill and the strip together.
 */
export function UptimeStrip({ days, ariaLabel }: UptimeStripProps) {
  if (days.length === 0) return null;

  return (
    <div
      className="w6w-uptime-strip"
      role="img"
      aria-label={ariaLabel ?? `${days.length}-day status`}
    >
      {days.map((entry, i) => (
        <span
          // Days are expected to be unique, but the index keeps the key stable
          // even if a caller repeats one — same guard as `ApiCallsPanel`.
          key={`${entry.day}-${i}`}
          className={`w6w-uptime-cell w6w-uptime-cell-${entry.state}`}
          title={entry.label ?? `${entry.day} — ${STATE_LABELS[entry.state]}`}
        />
      ))}
    </div>
  );
}
