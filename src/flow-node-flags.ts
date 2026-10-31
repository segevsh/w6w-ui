// Per-node run flags the node toolbar toggles: PAUSE and DISABLE.
//
// - `disabled` is a definition field the engine reads (`Node.disabled` in @w6w/workflow-types):
//   the node is skipped in EVERY run, published and triggered included, and its outgoing edges
//   are skipped, so a node that depends only on it does not run either.
// - `ui.paused` is editor metadata the engine never reads. Only a test run started from a node's
//   ▶ honours it: the editor sends every paused id as that run's `stopAt`, and the run stops
//   BEFORE each one (it does not execute). A published or triggered run never sees it.
//
// Both are written as `true` or left out — never `false`, never an empty `ui: {}` — so toggling a
// flag on and off again leaves a definition byte-identical to the one it started from.
import type { FlowStep } from "./flow-types.ts";

export const PAUSED_LABEL = "Paused — test runs stop before this node";
export const DISABLED_LABEL = "Disabled — skipped in every run";

export function isPausedStep(step: FlowStep): boolean {
  return step.ui?.paused === true;
}

export function isDisabledStep(step: FlowStep): boolean {
  return step.disabled === true;
}

/** `step` with `ui.paused` set (on) or removed (off); an emptied `ui` is dropped. */
export function withPaused(step: FlowStep, on: boolean): FlowStep {
  const { ui, ...rest } = step;
  const { paused: _paused, ...otherUi } = ui ?? {};
  const nextUi = on ? { ...otherUi, paused: true as const } : otherUi;
  return Object.keys(nextUi).length > 0 ? { ...rest, ui: nextUi } : rest;
}

/** `step` with `disabled: true` (on) or without the key (off). */
export function withDisabled(step: FlowStep, on: boolean): FlowStep {
  const { disabled: _disabled, ...rest } = step;
  return on ? { ...rest, disabled: true } : rest;
}

/**
 * The `stopAt` of a run started from `startId`'s ▶: every paused node except the start itself
 * (pressing ▶ on a paused node runs it — the pause stops runs that ARRIVE at it).
 */
export function pausedStopAt(steps: readonly FlowStep[], startId: string): string[] {
  return steps.filter((s) => s.id !== startId && isPausedStep(s)).map((s) => s.id);
}
