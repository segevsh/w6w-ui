// Pure fan-out decisions for the "Run next steps" control and card badge.
import type { Edge } from "@xyflow/react";
import { edgeLane } from "./flow-connect.ts";
import type { FlowStep } from "./flow-types.ts";

export type FanOutMode = "sequential" | "parallel";

/**
 * `count` is the largest number of outgoing edges the step has in any ONE lane
 * (success / error); fan-out only means something at `count >= 2`.
 */
export function fanOutState(
  stepId: string,
  edges: readonly Edge[],
): { enabled: boolean; count: number } {
  const per = { success: 0, error: 0 };
  for (const e of edges) if (e.source === stepId) per[edgeLane(e)]++;
  const count = Math.max(per.success, per.error);
  return { enabled: count >= 2, count };
}

/** Sequential is the default, so it is expressed by the key's ABSENCE. */
export function setFanOut(step: FlowStep, mode: FanOutMode): FlowStep {
  const { fanOut: _drop, ...rest } = step;
  return mode === "parallel" ? { ...rest, fanOut: "parallel" } : rest;
}
