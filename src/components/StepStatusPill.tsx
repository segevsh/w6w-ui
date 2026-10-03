import type { ReactNode } from "react";

/**
 * The five states a workflow step's execution can be in — a thin LOCAL copy
 * of the workflow spec's `StepStatus` union
 * (`packages/w6w-workflow/packages/types/mod.ts`). `@w6w/ui` deliberately
 * keeps a small literal type here rather than depend on `@w6w/workflow-types`,
 * so this stays a pure-presentation leaf with no transport/spec coupling —
 * the same precedent `HealthStatusPill`'s `HealthPillState` establishes.
 */
export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

/**
 * The five states a whole EXECUTION (an invocation, an endpoint call, a
 * workflow run) can be in — the run-level sibling of `StepStatus`, and again a
 * thin LOCAL literal rather than an import of any spec/wire type. The two
 * unions differ exactly where runs and steps differ: a run can be `queued`
 * before it starts and `canceled` after it started, while a step inside a run
 * can be `pending` or `skipped` (a run is never either). They are deliberately
 * NOT merged into one five/six-member union — `ExecutionList` and the step
 * panel must each accept only their own vocabulary.
 */
export type ExecutionStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface StepStatusPillProps {
  /**
   * Which state to render — drives the colour + default label. Accepts both
   * vocabularies: a workflow step's `StepStatus` and a whole run's
   * `ExecutionStatus` (the pill is only a coloured label, so it does not care
   * which of the two a host is describing).
   */
  state: StepStatus | ExecutionStatus;
  /** Override the visible text (defaults to a humanised form of `state`). */
  label?: ReactNode;
  /** Accessible label for the pill (falls back to the visible text). */
  ariaLabel?: string;
}

const DEFAULT_LABELS: Record<StepStatus | ExecutionStatus, string> = {
  pending: "Pending",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  skipped: "Skipped",
  queued: "Queued",
  canceled: "Canceled",
};

/**
 * A small, theme-aware status pill for one workflow step's execution state.
 *
 * Mirrors `HealthStatusPill` shape for shape: a state union, a
 * `DEFAULT_LABELS` record, a coloured dot + text label using one
 * `--w6w-step-color` custom property per modifier class, and the
 * `w6w-step-pill w6w-step-pill-${state}` className convention. Colour is
 * never the only signal — the text label carries the same meaning for
 * accessibility. Five states rather than `HealthStatusPill`'s four, so this
 * is a mirror of that shape, not a shared implementation.
 *
 * Renders BOTH vocabularies through the one prop: `StepStatus` (a step inside
 * a run) and `ExecutionStatus` (a whole run). The union is widened at the
 * PROP only — `StepStatus` itself is unchanged, so the step panel's own type
 * cannot silently grow run-only states.
 */
export function StepStatusPill({ state, label, ariaLabel }: StepStatusPillProps) {
  const text = label ?? DEFAULT_LABELS[state];

  return (
    <span className={`w6w-step-pill w6w-step-pill-${state}`} aria-label={ariaLabel}>
      <span className="w6w-step-pill-dot" aria-hidden="true" />
      <span className="w6w-step-pill-label">{text}</span>
    </span>
  );
}
