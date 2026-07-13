/**
 * Wire types the components consume. These mirror the shapes the w6w server
 * returns over HTTP. They are intentionally a local copy so consumers who
 * don't use `@w6w/types` (partners, non-TypeScript backends) don't need it.
 */

/** Summary of a registered app as returned by GET /apps. */
export interface AppSummary {
  id: string;
  displayName: string;
  version?: string;
  description?: string;
  categories?: string[];
  sourceRef?: string;
  importedAt?: string;
  /** Inlined data: URI (or absolute URL) for the app's icon. */
  iconSvg?: string;
  /** Optional dark-mode variant. */
  iconSvgDark?: string;
  brandColor?: string;
  brandColorDark?: string;
  versionCount?: number;
  maturity?: string;
  visibility?: string;
  successor?: string;
}

/** One field on an Auth method's connection form. Drives the input widgets. */
export interface AuthField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "secret" | string;
  required?: boolean;
  default?: unknown;
  hint?: string;
}

/**
 * One declared parameter of an action, as returned by GET /apps/:id (the
 * `actions[].params` array). Drives the guided step-builder form. Same shape as
 * an app manifest's action param — a superset of `AuthField` (adds `text`/`json`
 * widget types).
 */
export interface ActionParam {
  key: string;
  label?: string;
  /**
   * Widget to render for this param. Beyond the scalar types, `text` is a
   * textarea, `json`/`group` an inline JSON editor, `code` a code editor, and
   * `vars` a dynamic typed key/value table.
   */
  type:
    | "string"
    | "text"
    | "number"
    | "boolean"
    | "select"
    | "multiselect"
    | "array"
    | "json"
    | "group"
    | "secret"
    | "code"
    | "vars"
    | "section"
    | string;
  required?: boolean;
  default?: unknown;
  hint?: string;
  /** Placeholder text for the input (e.g. the trailing prompt on a multiselect). */
  placeholder?: string;
  /**
   * Move this (optional) param under the collapsed "Additional parameters"
   * section. Required + non-advanced params show up front. Ignored for required
   * params (they always show).
   */
  advanced?: boolean;
  /**
   * Lay this param out on a shared row with adjacent params carrying the same
   * `row` id — e.g. a username/password pair side by side.
   */
  row?: string;
  /** Element schema when `type: "array"` (a scalar list or a list of objects). */
  item?: ParamArrayItem;
  /**
   * Conditional visibility — the param renders only when this predicate holds
   * against a sibling field's value. Lets a schema declare conditional sections
   * (e.g. Basic-auth fields shown only when `auth` is `"basic"`).
   */
  showIf?: ParamCondition;
  /**
   * Constrained choices. Renders as a single-select dropdown for `select` (or any
   * param with options), and as a multi-select pill picker for `multiselect`.
   */
  options?: ParamOption[];
  /** Type-specific render/behavior options. */
  config?: ParamConfig;
  /**
   * Nested params, walked by the renderer for `type: "group"` (nested object)
   * and `type: "section"` (layout-only container whose children write to the
   * ENCLOSING form values, not under this param's key).
   */
  children?: ActionParam[];
  /**
   * `type: "section"` only — the container behavior. `"collapsible"` renders a
   * titled, collapsed-by-default disclosure; `"group"` a `layout` row/stack.
   */
  section?: "collapsible" | "group";
  /** `section: "collapsible"` only — the `<summary>` heading. */
  title?: string;
  /** `section: "collapsible"` only — an optional secondary summary line. */
  subtitle?: string;
  /** `section: "group"` only — `"row"` side by side, `"stack"` vertical (default). */
  layout?: "row" | "stack";
  /** `section: "collapsible"` only — start collapsed (default `true`). */
  collapsed?: boolean;
}

/** A single choice for a param rendered as a dropdown. */
export interface ParamOption {
  value: string | number;
  label: string;
}

/**
 * The element schema for a `type: "array"` param. Either a scalar list
 * (`type: "string" | "number"`, each item a single value) or a list of objects
 * (`type: "object"` with `fields`, each item a `{ [key]: value }` record whose
 * fields render side by side).
 */
export interface ParamArrayItem {
  type: "string" | "number" | "object" | string;
  /** For object items — the fields of each element (rendered inline in a row). */
  fields?: ActionParam[];
  /** Placeholder for a scalar item's input. */
  placeholder?: string;
}

/**
 * A conditional-visibility predicate tested against a sibling param's value.
 * Exactly one of `equals` / `in` / `notIn` / `truthy` is used (checked in that
 * order). The compared value falls back to the sibling's `default` when unset.
 */
export interface ParamCondition {
  /** Sibling param key whose value is tested. */
  field: string;
  /** Visible when the field's value strictly equals this. */
  equals?: string | number | boolean;
  /** Visible when the field's value is one of these. */
  in?: Array<string | number | boolean>;
  /** Visible when the field's value is NOT one of these. */
  notIn?: Array<string | number | boolean>;
  /** Visible when the field's value is truthy (`true`) or falsy (`false`). */
  truthy?: boolean;
}

/** Type-specific render/behavior options for a param. */
export interface ParamConfig {
  /** Render as a multi-line textarea. Implied by `type: "text"`. */
  multiline?: boolean;
}

/** Summary of an action an app exposes, as returned by GET /apps/:id. */
export interface ActionDef {
  key: string;
  type?: string;
  title?: string;
  description?: string;
  params?: ActionParam[];
  output?: unknown;
}

/** Auth method declaration as exposed by an app's manifest. */
export interface AuthDef {
  key: string;
  type: "oauth2" | "apiKey" | "basic" | "bearer" | "custom" | string;
  displayName?: string;
  description?: string;
  connectionLabel?: string;
  fields?: AuthField[];
  /** OAuth2 endpoints (only present when type === "oauth2"). */
  oauth2?: Record<string, unknown>;
  /**
   * False when the method requires per-host configuration that hasn't been
   * provided yet (e.g. an oauth2 method with no client credentials set up).
   * The picker hides entries with `available === false`.
   */
  available?: boolean;
  /** Names of host-side config keys this method needs, when applicable. */
  requiresHostConfig?: string[];
}

/** Public summary of a stored connection — never carries the credential. */
export interface ConnectionSummary {
  id: string;
  appId: string;
  authKey: string;
  owner?: string;
  displayName?: string;
  state?: "pending" | "connected" | "needs_refresh" | "broken" | "revoked" | string;
  profile?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/** Effective theme hint passed to icon components to pick a light/dark variant. */
export type ThemeMode = "light" | "dark";

/*
 * ---------------------------------------------------------------------------
 * Value model — the multipart/expression + secret envelopes for a step's
 * `with` block. Mirrored (shape-for-shape) from `@w6w/types` `value.ts` so
 * consumers who don't depend on `@w6w/types` don't have to. Keep in sync with
 * core: packages/core/packages/types/src/value.ts.
 * ---------------------------------------------------------------------------
 */

/** The segment kinds an {@link ExprValue} part can take. */
export type ExprPartKind = "text" | "var" | "secret" | "expr";

/**
 * One segment of an {@link ExprValue}. The populated field depends on `kind`:
 *   - `text`   → `value` holds a literal string chunk.
 *   - `var`    → `ref` names a project variable.
 *   - `secret` → `ref` names a vault secret (surfaced via the secret picker).
 *   - `expr`   → `expr` holds inline JSONLogic evaluated against the run scope.
 */
export interface ExprPart {
  kind: ExprPartKind;
  /** Literal chunk, for `kind: "text"`. */
  value?: string;
  /** Name of the referenced variable/secret, for `kind: "var" | "secret"`. */
  ref?: string;
  /** Inline JSONLogic, for `kind: "expr"`. */
  expr?: unknown;
}

/**
 * A multipart value: an ordered list of {@link ExprPart} segments that
 * concatenate to a string at resolve time.
 */
export interface ExprValue {
  type: "expr";
  parts: ExprPart[];
}

/**
 * The at-rest form of a secret-typed scalar field: AES-GCM ciphertext + IV
 * (both base64). Decrypted server-side; never decrypted in the client — the UI
 * renders it as `***`.
 */
export interface SecretValue {
  type: "secret";
  ciphertext: string;
  iv: string;
}

/** `true` if `v` is an {@link ExprValue} envelope. Safe on `unknown`. */
export function isExprValue(v: unknown): v is ExprValue {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (v as { type?: unknown }).type === "expr" &&
    Array.isArray((v as { parts?: unknown }).parts)
  );
}

/** `true` if `v` is a {@link SecretValue} envelope. Safe on `unknown`. */
export function isSecretValue(v: unknown): v is SecretValue {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (v as { type?: unknown }).type === "secret" &&
    typeof (v as { ciphertext?: unknown }).ciphertext === "string" &&
    typeof (v as { iv?: unknown }).iv === "string"
  );
}
