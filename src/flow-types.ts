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

// ── Internal pseudo-app nodes (see core rfcs/node-types.md) ─────────────────
//
// A node's kind + processor are derived from `uses.app`. The reserved `@w6w/*`
// namespace holds internal pseudo-apps the platform runs itself: `@w6w/control`
// (engine-native flow control), `@w6w/script`/`@w6w/data` (host-run compute),
// and `@w6w/trigger` (the entry node). They render as pill nodes and configure
// through the same dynamic form as apps.

/** Reserved namespace for internal pseudo-apps. */
export const INTERNAL_APP_PREFIX = "@w6w/";
/** Engine-native flow control (if/foreach/parallel/wait). */
export const CONTROL_APP = "@w6w/control";
/** Host-run inline JS. */
export const SCRIPT_APP = "@w6w/script";
/** Host-run typed key/value data. */
export const DATA_APP = "@w6w/data";
/** The workflow's entry/trigger node. */
export const TRIGGER_APP = "@w6w/trigger";

/** True when `app` is a reserved internal pseudo-app id (`@w6w/*`). */
export function isInternalApp(app: string): boolean {
  return app.startsWith(INTERNAL_APP_PREFIX);
}

/** True when a node is an engine-native flow-control node (can't run standalone). */
export function isControlApp(app: string): boolean {
  return app === CONTROL_APP;
}

/** A palette entry for an internal node: its id, label, group, and config schema. */
export interface InternalNodeDef {
  app: string;
  action: string;
  label: string;
  group: "trigger" | "control" | "compute";
  /** Config schema (same `ActionParam[]` shape apps declare) rendered by ParamsForm. */
  params: ActionParam[];
}

/** The built-in internal nodes, in palette order. */
export const INTERNAL_NODES: InternalNodeDef[] = [
  { app: TRIGGER_APP, action: "manual", label: "Manual trigger", group: "trigger", params: [] },
  {
    app: CONTROL_APP,
    action: "if",
    label: "If",
    group: "control",
    params: [
      {
        key: "condition",
        type: "json",
        label: "Condition",
        required: true,
        default: true,
        hint: 'A boolean, or an expression binding like { "$": "steps.x.output.ok" }.',
      },
    ],
  },
  {
    app: CONTROL_APP,
    action: "foreach",
    label: "For each",
    group: "control",
    params: [
      {
        key: "items",
        type: "json",
        label: "Items",
        required: true,
        default: [],
        hint: "An array to iterate, or an expression binding to one.",
      },
    ],
  },
  { app: CONTROL_APP, action: "parallel", label: "Parallel", group: "control", params: [] },
  {
    app: CONTROL_APP,
    action: "wait",
    label: "Wait",
    group: "control",
    params: [{ key: "ms", type: "number", label: "Wait (ms)", required: true, default: 1000 }],
  },
  {
    app: SCRIPT_APP,
    action: "run",
    label: "Run script",
    group: "compute",
    params: [
      {
        key: "code",
        type: "code",
        label: "Script",
        required: true,
        default: "// Runs as a function body. Return the step's output.\nreturn input;",
        hint: "JavaScript function body; return the step's output.",
      },
    ],
  },
  {
    app: DATA_APP,
    action: "set",
    label: "Data",
    group: "compute",
    params: [
      {
        key: "vars",
        type: "vars",
        label: "Variables",
        default: [],
        hint: "Typed key/value variables for downstream steps to reference.",
      },
    ],
  },
];

/** Look up an internal node's definition by its (app, action) pair. */
export function internalNodeDef(app: string, action: string): InternalNodeDef | undefined {
  return INTERNAL_NODES.find((n) => n.app === app && n.action === action);
}

/** The label the editor shows for an internal node (falls back to the action key). */
export function internalNodeLabel(app: string, action: string): string {
  return internalNodeDef(app, action)?.label ?? action;
}

/** The config schema for an internal node (empty when unknown). */
export function internalNodeParams(app: string, action: string): ActionParam[] {
  return internalNodeDef(app, action)?.params ?? [];
}

/** Build an internal node's default `with` from its param schema defaults. */
export function internalNodeDefaults(app: string, action: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of internalNodeParams(app, action)) {
    if (p.default !== undefined) out[p.key] = p.default;
  }
  return out;
}
