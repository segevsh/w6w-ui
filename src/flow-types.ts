/**
 * Minimal Workflow shape the flow editor operates on. Deliberately a subset of
 * `@w6w/workflow-types` so the ui lib doesn't pin partners to a specific engine
 * package version — consumers who already have `Workflow` from
 * `@w6w/workflow-types` are structurally compatible.
 */

export interface FlowStep {
  id: string;
  uses: { app: string; action: string; connection?: string | null };
  with?: Record<string, unknown>;
  retry?: {
    maxAttempts: number;
    backoff?: "fixed" | "exponential";
    delayMs?: number;
  };
  onError?: "fail" | "continue";
}

export interface FlowEdge {
  from: string;
  to: string;
}

export interface FlowWorkflow {
  manifestVersion: string;
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  variables?: Array<{ key: string; type?: string; required?: boolean; default?: unknown }>;
  steps: FlowStep[];
  edges?: FlowEdge[];
}

/** The canonical control app id — steps under this app render differently. */
export const CONTROL_APP = "@w6w/control";

/** Semantic label the editor shows for known control actions. */
export const CONTROL_LABELS: Record<string, string> = {
  if: "If",
  foreach: "For each",
  parallel: "Parallel",
  wait: "Wait",
};
