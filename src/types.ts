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
    | "json"
    | "group"
    | "secret"
    | "code"
    | "vars"
    | string;
  required?: boolean;
  default?: unknown;
  hint?: string;
  /** Placeholder text for the input (e.g. the trailing prompt on a multiselect). */
  placeholder?: string;
  /**
   * Constrained choices. Renders as a single-select dropdown for `select` (or any
   * param with options), and as a multi-select pill picker for `multiselect`.
   */
  options?: ParamOption[];
  /** Type-specific render/behavior options. */
  config?: ParamConfig;
}

/** A single choice for a param rendered as a dropdown. */
export interface ParamOption {
  value: string | number;
  label: string;
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
