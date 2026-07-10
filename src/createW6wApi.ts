/**
 * Default fetch-based W6wApi client. Convenience for partners without their
 * own HTTP client — studio wires react-query around its own implementation
 * and doesn't use this. Every method calls the w6w server directly and
 * throws `ApiError` on non-OK responses so callers can surface the message.
 */
import type { W6wApi } from "./provider.tsx";
import type { ActionDef, AppSummary, AuthDef, ConnectionSummary } from "./types.ts";

export interface CreateW6wApiOptions {
  /** Absolute URL or path prefix — e.g. `"https://w6w.example.com"` or `"/api"`. */
  baseUrl: string;
  /**
   * Bearer token to send. Accepts a string (static) or a function so a JWT
   * that rotates on refresh is fetched fresh on every request.
   */
  token?: string | (() => string | null | undefined);
  /** Optional fetch replacement — handy for tests. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Build a fetch-based W6wApi client bound to a base URL + token supplier. */
export function createW6wApi(opts: CreateW6wApiOptions): W6wApi {
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  const doFetch = opts.fetch ?? globalThis.fetch;
  const getToken = () => (typeof opts.token === "function" ? opts.token() : opts.token);

  async function req<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    const token = getToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");

    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, { ...init, headers });
    } catch (e) {
      // A failed fetch throws a bare `TypeError: Failed to fetch` — wrap it with
      // the target so callers can tell the server is down vs. a real API error.
      throw new ApiError(
        0,
        "network_error",
        `Could not reach the w6w server (${init?.method ?? "GET"} ${baseUrl}${path}). ` +
          `It may be down or unreachable. (${(e as Error).message})`,
      );
    }
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        if (!res.ok) {
          throw new ApiError(
            res.status,
            "bad_response",
            `Server returned a non-JSON ${res.status} response: ${text.slice(0, 200)}`,
          );
        }
      }
    }
    if (!res.ok) {
      const err = ((data as { error?: { code?: string; message?: string } } | null)?.error ??
        {}) as { code?: string; message?: string };
      throw new ApiError(res.status, err.code ?? "error", err.message ?? res.statusText);
    }
    return data as T;
  }

  return {
    listApps: () => req<{ apps: AppSummary[] }>("/apps").then((r) => r.apps),

    getAppAuth: async (id: string) => {
      const r = await req<{ auths: AuthDef[] }>(`/apps/${encodeURIComponent(id)}/auths`);
      return r.auths ?? [];
    },

    createConnection: (appId, body) =>
      req<{ connection: ConnectionSummary }>(`/apps/${encodeURIComponent(appId)}/connections`, {
        method: "POST",
        body: JSON.stringify(body),
      }).then((r) => r.connection),

    startAppOAuthFlow: (appId, authKey, body) =>
      req<{ authorizationUrl: string }>(
        `/apps/${encodeURIComponent(appId)}/oauth-config/${encodeURIComponent(authKey)}/authorize-url`,
        { method: "POST", body: JSON.stringify(body) },
      ),

    getAppActions: (appId) =>
      req<{ actions: ActionDef[] }>(`/apps/${encodeURIComponent(appId)}`).then(
        (r) => r.actions ?? [],
      ),

    listConnectionsForApp: (appId) =>
      req<{ connections: ConnectionSummary[] }>(
        `/apps/${encodeURIComponent(appId)}/connections`,
      ).then((r) => r.connections ?? []),

    listConnections: () =>
      req<{ connections: ConnectionSummary[] }>("/connections").then((r) => r.connections ?? []),

    invokeAction: (appId, actionKey, params, opts = {}) =>
      req<{ value: unknown }>(
        `/apps/${encodeURIComponent(appId)}/actions/${encodeURIComponent(actionKey)}/invoke`,
        { method: "POST", body: JSON.stringify({ params, ...opts }) },
      ),
  };
}
