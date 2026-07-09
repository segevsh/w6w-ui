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

import type { ActionParam } from "./types.ts";

/** The canonical control app id — steps under this app render differently. */
export const CONTROL_APP = "@w6w/control";

/** Semantic label the editor shows for known control actions. */
export const CONTROL_LABELS: Record<string, string> = {
  if: "If",
  foreach: "For each",
  parallel: "Parallel",
  wait: "Wait",
  script: "Run script",
  data: "Data",
};

/**
 * Config schema for each built-in control, expressed as `ActionParam[]` — the
 * same shape an app's action declares. This lets control steps render through
 * the shared dynamic form (`ParamsForm`) instead of bespoke UI, so `script`
 * gets the `code` editor element and `data` the `vars` table, both reusable by
 * any app that declares those param types.
 */
export const CONTROL_PARAMS: Record<string, ActionParam[]> = {
  if: [
    {
      key: "condition",
      type: "json",
      label: "Condition",
      required: true,
      default: true,
      hint: 'A boolean, or an expression binding like { "$": "steps.x.output.ok" }.',
    },
  ],
  foreach: [
    {
      key: "items",
      type: "json",
      label: "Items",
      required: true,
      default: [],
      hint: "An array to iterate, or an expression binding to one.",
    },
  ],
  parallel: [],
  wait: [{ key: "ms", type: "number", label: "Wait (ms)", required: true, default: 1000 }],
  script: [
    {
      key: "code",
      type: "code",
      label: "Script",
      required: true,
      default: "// Runs as a function body. Return the step's output.\nreturn input;",
      hint: "JavaScript function body; return the step's output.",
    },
  ],
  data: [
    {
      key: "vars",
      type: "vars",
      label: "Variables",
      default: [],
      hint: "Typed key/value variables for downstream steps to reference.",
    },
  ],
};

/** Build a control step's default `with` from its param schema defaults. */
export function controlDefaults(action: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of CONTROL_PARAMS[action] ?? []) {
    if (p.default !== undefined) out[p.key] = p.default;
  }
  return out;
}
