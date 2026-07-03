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
