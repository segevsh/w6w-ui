import type { ReactNode } from "react";

/**
 * The four health states a probe can report — a thin LOCAL copy of the RFC's
 * `HealthReport.state` union. `@w6w/ui` deliberately keeps a small literal type
 * here rather than depend on `@w6w/types`, so the display component stays a
 * pure-presentation leaf with no transport/spec coupling.
 */
export type HealthPillState = "ok" | "degraded" | "down" | "unknown";

export interface HealthStatusPillProps {
  /** Which health state to render — drives the colour + default label. */
  state: HealthPillState;
  /** Override the visible text (defaults to a humanised form of `state`). */
  label?: ReactNode;
  /** Accessible label for the pill (falls back to the visible text). */
  ariaLabel?: string;
}

const DEFAULT_LABELS: Record<HealthPillState, string> = {
  ok: "Operational",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown",
};

/**
 * A small, theme-aware status pill for a single health state.
 *
 * Renders a coloured dot + label using the `--w6w-health-*` tokens, so a host
 * can restyle every state by overriding those custom properties (see
 * `styles.css`). Colour is never the only signal — the text label carries the
 * same meaning for accessibility.
 */
export function HealthStatusPill({ state, label, ariaLabel }: HealthStatusPillProps) {
  const text = label ?? DEFAULT_LABELS[state];

  return (
    <span className={`w6w-health-pill w6w-health-pill-${state}`} aria-label={ariaLabel}>
      <span className="w6w-health-pill-dot" aria-hidden="true" />
      <span className="w6w-health-pill-label">{text}</span>
    </span>
  );
}
