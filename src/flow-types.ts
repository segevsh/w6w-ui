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
/** Host-run outbound HTTP(S) request. */
export const HTTP_APP = "@w6w/http";

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
  /**
   * Human display name (mirrors an app's `displayName`). Defaults conceptually
   * to `label`; kept explicit so internal pseudo-apps carry the same info an app
   * does. Shown wherever an app's name would be.
   */
  displayName: string;
  group: "trigger" | "control" | "compute" | "request";
  /**
   * Inline SVG *inner* markup (paths / circles / polylines) for this primitive's
   * glyph — internal pseudo-apps have no icon asset dir, so the glyph is bundled
   * here. Drawn on a 24×24 `viewBox`, stroked with `currentColor` (theme-aware),
   * so both app nodes and internal nodes display a consistent icon on the canvas.
   */
  icon: string;
  /** Config schema (same `ActionParam[]` shape apps declare) rendered by ParamsForm. */
  params: ActionParam[];
}

// Feather-style 24×24 stroked glyphs (inner markup only; the card supplies the
// <svg> wrapper). One clean, recognizable glyph per internal primitive.
/** Lightning bolt — a trigger firing. */
const ICON_TRIGGER = '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />';
/** Git-branch — a conditional split. */
const ICON_IF =
  '<line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />';
/** Repeat arrows — iterate over items. */
const ICON_FOREACH =
  '<polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />';
/** Concurrent lanes — parallel execution. */
const ICON_PARALLEL =
  '<line x1="6" y1="4" x2="6" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /><line x1="18" y1="4" x2="18" y2="20" />';
/** Clock — a timed wait. */
const ICON_WAIT = '<circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />';
/** Angle brackets — inline code. */
const ICON_SCRIPT = '<polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />';
/** Database cylinder — typed data. */
const ICON_DATA =
  '<ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />';
/** Globe — an outbound HTTP(S) request. */
const ICON_HTTP =
  '<circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />';

/** The built-in internal nodes, in palette order. */
export const INTERNAL_NODES: InternalNodeDef[] = [
  {
    app: TRIGGER_APP,
    action: "manual",
    label: "Manual trigger",
    displayName: "Manual trigger",
    group: "trigger",
    icon: ICON_TRIGGER,
    params: [],
  },
  {
    app: CONTROL_APP,
    action: "if",
    label: "If",
    displayName: "If",
    group: "control",
    icon: ICON_IF,
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
    displayName: "For each",
    group: "control",
    icon: ICON_FOREACH,
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
  {
    app: CONTROL_APP,
    action: "parallel",
    label: "Parallel",
    displayName: "Parallel",
    group: "control",
    icon: ICON_PARALLEL,
    params: [],
  },
  {
    app: CONTROL_APP,
    action: "wait",
    label: "Wait",
    displayName: "Wait",
    group: "control",
    icon: ICON_WAIT,
    params: [
      {
        key: "duration",
        type: "string",
        label: "Duration",
        required: true,
        default: "PT1S",
        hint: "ISO-8601 duration, e.g. PT30S or PT5M. (Or set `until` to an ISO timestamp.)",
      },
    ],
  },
  {
    app: SCRIPT_APP,
    action: "run",
    label: "Run script",
    displayName: "Run script",
    group: "compute",
    icon: ICON_SCRIPT,
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
    displayName: "Data set",
    group: "compute",
    icon: ICON_DATA,
    params: [
      {
        // `required` surfaces the table in the form directly (not hidden under
        // the optional disclosure). The value may be an empty array — a Data
        // node with no vars yet is valid.
        key: "vars",
        type: "vars",
        label: "Variables",
        required: true,
        default: [],
        hint: "Typed key/value variables for downstream steps to reference.",
      },
    ],
  },
  {
    app: HTTP_APP,
    action: "request",
    label: "HTTP request",
    displayName: "HTTP",
    group: "request",
    icon: ICON_HTTP,
    params: [
      {
        key: "method",
        type: "string",
        label: "Method",
        required: true,
        default: "GET",
        options: [
          { value: "GET", label: "GET" },
          { value: "POST", label: "POST" },
          { value: "PUT", label: "PUT" },
          { value: "PATCH", label: "PATCH" },
          { value: "DELETE", label: "DELETE" },
        ],
        hint: "HTTP method for the request.",
      },
      {
        key: "url",
        type: "string",
        label: "URL",
        required: true,
        default: "",
        hint: "Full request URL, e.g. https://api.example.com/v1/things.",
      },
      {
        key: "headers",
        type: "json",
        label: "Headers",
        default: {},
        hint: "Object of header name → value.",
      },
      {
        key: "query",
        type: "json",
        label: "Query params",
        default: {},
        hint: "Object of query-string name → value, appended to the URL.",
      },
      {
        key: "body",
        type: "text",
        label: "Body",
        default: "",
        hint: "Request body (raw text or a JSON string). Ignored for GET/HEAD.",
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

/**
 * The inline SVG glyph markup for an internal node (empty when unknown). Lets a
 * node retrieve its icon from just the (app, action) pair — same lookup path as
 * `internalNodeLabel`.
 */
export function internalNodeIcon(app: string, action: string): string {
  return internalNodeDef(app, action)?.icon ?? "";
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
