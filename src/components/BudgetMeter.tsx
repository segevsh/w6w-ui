// BudgetMeter — a one-line usage-vs-limit meter for model budgets.
//
// Purely presentational: the host owns the numbers and decides what "the
// budget" is (tokens, requests, currency). `format` is the host's hook for
// rendering those numbers in its own unit; without it the raw values are
// printed.
//
// `role="meter"` (not `progressbar`) is the ARIA role for a measurement within
// a known range, and the accessible name is the `label` prop. The bar is drawn
// from two segments — `used` and, when non-zero, `reserved` — because a
// reserved-but-not-yet-spent amount is a distinct quantity from spend and must
// stay legible next to it. At or past the limit the root carries
// `w6w-budget-meter-over`, which is the only hook styles use to switch the bar
// to the danger colour.

const defaultFormat = (n: number): string => String(n);

/** Clamp a 0..100 percentage and keep it to a stable number of decimals so the
 * inline `width` style does not wobble between renders. */
function pct(value: number): number {
  const clamped = Math.min(100, Math.max(0, value));
  return Number(clamped.toFixed(4));
}

export interface BudgetMeterProps {
  /** Accessible name and the visible caption. */
  label: string;
  /** Amount already consumed. */
  used: number;
  /** Upper bound `used` is measured against. */
  limit: number;
  /** Amount held back but not yet spent. The segment renders only when > 0. */
  reserved?: number;
  /** Formats every number the meter prints (visible text and aria-valuetext). */
  format?: (n: number) => string;
  className?: string;
  testId?: string;
}

export function BudgetMeter({
  label,
  used,
  limit,
  reserved = 0,
  format,
  className,
  testId,
}: BudgetMeterProps) {
  const fmt = format ?? defaultFormat;
  const hasReserved = Number.isFinite(reserved) && reserved > 0;
  const usedPct = limit > 0 ? pct((used / limit) * 100) : 100;
  // A reservation can never push the bar past a full track, so it only fills
  // what `used` leaves over.
  const reservedPct =
    hasReserved && limit > 0 ? pct(Math.min(100 - usedPct, (reserved / limit) * 100)) : 0;
  const over = used >= limit;
  const valueText = `${fmt(used)} / ${fmt(limit)}`;

  const classes = ["w6w-budget-meter"];
  if (over) classes.push("w6w-budget-meter-over");
  if (className) classes.push(className);

  return (
    <div
      role="meter"
      className={classes.join(" ")}
      aria-label={label}
      aria-valuemin={0}
      aria-valuenow={used}
      aria-valuemax={limit}
      aria-valuetext={valueText}
      data-testid={testId}
    >
      <div className="w6w-budget-meter-head">
        <span className="w6w-budget-meter-label">{label}</span>
        <span className="w6w-budget-meter-value">{valueText}</span>
      </div>
      <div className="w6w-budget-meter-track">
        <div className="w6w-budget-meter-used" style={{ width: `${usedPct}%` }} />
        {hasReserved && (
          <div className="w6w-budget-meter-reserved" style={{ width: `${reservedPct}%` }} />
        )}
      </div>
    </div>
  );
}
