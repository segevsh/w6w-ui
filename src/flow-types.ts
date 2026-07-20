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
  /**
   * What to do when this step errors:
   * - `fail` — stop the run (default)
   * - `continue` — swallow the error and keep going
   * - `continue-record` — keep going, but record the error into the run's end state
   */
  onError?: "fail" | "continue" | "continue-record";
  /** Free-form author notes for this step. Not executed. */
  notes?: string;
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
/** Inbound HTTP(S) webhook trigger (entry node; provisions a receive URL). */
export const WEBHOOK_APP = "@w6w/webhook";
/** "Respond to Webhook" — shapes the HTTP response for `responseMode: responseNode`. */
export const RESPOND_APP = "@w6w/respond";

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
  /**
   * Connection ports: how many inbound (entry) and outbound (exit) connections
   * this node accepts. A port is the ability to receive/emit a connection —
   * rendered as a React Flow Handle. Defaults to one of each (`{ in: 1, out: 1 }`)
   * when omitted; a trigger overrides to `{ in: 0, out: 1 }` (nothing flows into
   * the entry node). Fixed for now — not user-editable.
   */
  ports?: NodePorts;
  /** Config schema (same `ActionParam[]` shape apps declare) rendered by ParamsForm. */
  params: ActionParam[];
}

/** Inbound (entry) and outbound (exit) connection-port counts for a node. */
export interface NodePorts {
  in: number;
  out: number;
}

/** The default a node gets when it declares no explicit `ports`: 1 in, 1 out. */
export const DEFAULT_NODE_PORTS: NodePorts = { in: 1, out: 1 };

/**
 * Resolve a node's connection ports. Internal nodes may declare `ports`
 * (triggers do, to drop the entry port); everything else — including every
 * external app step — gets the `{ in: 1, out: 1 }` default.
 */
export function nodePorts(app: string, action: string): NodePorts {
  return internalNodeDef(app, action)?.ports ?? DEFAULT_NODE_PORTS;
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
/** Connected nodes — an inbound webhook. */
const ICON_WEBHOOK =
  '<circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />';
/** Reply arrow — respond to the caller. */
const ICON_RESPOND = '<polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" />';

/** The built-in internal nodes, in palette order. */
export const INTERNAL_NODES: InternalNodeDef[] = [
  {
    app: TRIGGER_APP,
    action: "manual",
    label: "Manual trigger",
    displayName: "Manual trigger",
    group: "trigger",
    icon: ICON_TRIGGER,
    ports: { in: 0, out: 1 },
    params: [
      {
        key: "fields",
        label: "Fields",
        type: "array",
        default: [],
        hint: 'The fields this trigger emits into the run. Reference them downstream as {"$": "steps.<trigger>.output.<key>"}.',
        item: {
          type: "object",
          fields: [
            { key: "key", label: "Key", type: "string", placeholder: "e.g. email" },
            {
              key: "type",
              label: "Type",
              type: "select",
              default: "string",
              options: [
                { value: "string", label: "String" },
                { value: "number", label: "Number" },
                { value: "boolean", label: "Boolean" },
                { value: "json", label: "JSON" },
              ],
            },
            { key: "default", label: "Default", type: "string", placeholder: "optional" },
            { key: "required", label: "Required", type: "boolean", default: false },
          ],
        },
      },
    ],
  },
  {
    app: WEBHOOK_APP,
    action: "webhook",
    label: "Webhook",
    displayName: "Webhook",
    group: "trigger",
    icon: ICON_WEBHOOK,
    ports: { in: 0, out: 1 },
    params: [
      {
        key: "methods",
        label: "HTTP Methods",
        type: "multiselect",
        required: true,
        default: ["POST"],
        hint: "Which HTTP methods this webhook accepts.",
        options: [
          { value: "GET", label: "GET" },
          { value: "POST", label: "POST" },
          { value: "PUT", label: "PUT" },
          { value: "PATCH", label: "PATCH" },
          { value: "DELETE", label: "DELETE" },
          { value: "HEAD", label: "HEAD" },
        ],
      },
      {
        key: "auth",
        label: "Authentication",
        type: "select",
        default: "none",
        hint: "How incoming requests are authenticated.",
        options: [
          { value: "none", label: "None" },
          { value: "basic", label: "Basic auth" },
          { value: "header", label: "Header auth" },
          { value: "jwt", label: "JWT (HMAC)" },
        ],
      },
      {
        key: "basicUser",
        label: "Username",
        type: "string",
        row: "basic-auth",
        showIf: { field: "auth", equals: "basic" },
      },
      {
        key: "basicPassword",
        label: "Password",
        type: "secret",
        row: "basic-auth",
        showIf: { field: "auth", equals: "basic" },
      },
      {
        key: "headerName",
        label: "Header name",
        type: "string",
        row: "header-auth",
        placeholder: "e.g. X-Api-Key",
        showIf: { field: "auth", equals: "header" },
      },
      {
        key: "headerValue",
        label: "Header value",
        type: "secret",
        row: "header-auth",
        showIf: { field: "auth", equals: "header" },
      },
      {
        key: "jwtSecret",
        label: "JWT secret",
        type: "secret",
        showIf: { field: "auth", equals: "jwt" },
      },
      {
        key: "responseMode",
        label: "Respond",
        type: "select",
        default: "onReceived",
        hint: "When and how to respond to the caller.",
        options: [
          { value: "onReceived", label: "Immediately (ASAP)" },
          { value: "lastNode", label: "When the run finishes" },
          { value: "responseNode", label: "Using a Response node" },
          { value: "streaming", label: "Streaming" },
        ],
      },
      {
        key: "responseCode",
        label: "Response status code",
        type: "number",
        default: 200,
        showIf: { field: "responseMode", notIn: ["responseNode"] },
      },
      {
        key: "responseData",
        label: "Response body (immediate)",
        type: "text",
        hint: 'Body for "Immediately" responses. Empty = { "message": "Workflow was started" }.',
        showIf: { field: "responseMode", equals: "onReceived" },
      },
      { key: "rawBody", label: "Raw body", type: "boolean", default: false, advanced: true },
      { key: "ignoreBots", label: "Ignore bots", type: "boolean", default: false, advanced: true },
      {
        key: "ipAllowList",
        label: "IP allow list",
        type: "array",
        advanced: true,
        item: { type: "string", placeholder: "e.g. 203.0.113.4" },
        hint: "Client IPs allowed to call this webhook. Empty = allow all.",
      },
      { key: "binaryPropertyName", label: "Binary field name", type: "string", advanced: true },
      { key: "cors", label: "CORS allowed origin", type: "string", advanced: true },
      {
        key: "responseHeaders",
        label: "Response headers",
        type: "array",
        default: [],
        advanced: true,
        item: {
          type: "object",
          fields: [
            { key: "name", label: "Name", type: "string" },
            { key: "value", label: "Value", type: "string" },
          ],
        },
      },
    ],
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
  {
    app: RESPOND_APP,
    action: "respond",
    label: "Respond to Webhook",
    displayName: "Respond to Webhook",
    group: "request",
    icon: ICON_RESPOND,
    params: [
      {
        key: "respondWith",
        label: "Respond with",
        type: "select",
        default: "json",
        hint: "Shape of the response returned to the webhook caller.",
        options: [
          { value: "json", label: "JSON" },
          { value: "text", label: "Text" },
          { value: "noData", label: "No body" },
        ],
      },
      { key: "responseCode", label: "Response status code", type: "number", default: 200 },
      {
        key: "responseBody",
        label: "Response body",
        type: "json",
        default: {},
        hint: "Body to return (object for JSON, string for Text).",
      },
      {
        key: "responseHeaders",
        label: "Response headers",
        type: "array",
        default: [],
        item: {
          type: "object",
          fields: [
            { key: "name", label: "Name", type: "string" },
            { key: "value", label: "Value", type: "string" },
          ],
        },
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
