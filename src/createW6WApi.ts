/**
 * Default fetch-based W6WApi client. Convenience for partners without their
 * own HTTP client — studio wires react-query around its own implementation
 * and doesn't use this. Every method calls the w6w server directly and
 * throws `ApiError` on non-OK responses so callers can surface the message.
 */
import type { StepTest, TestRunSummary, W6WApi } from "./provider.tsx";
import type {
  ActionDef,
  ApiCallRecord,
  AppSummary,
  AuthDef,
  ConnectionSummary,
  SavedTest,
} from "./types.ts";

export interface CreateW6WApiOptions {
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
    /**
     * The parsed error response body, when the server sent one. Carries the
     * fields that ride alongside an error — e.g. an invoke's `logs` and
     * `apiCalls` — which the message alone would drop.
     */
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Build a fetch-based W6WApi client bound to a base URL + token supplier. */
export function createW6WApi(opts: CreateW6WApiOptions): W6WApi {
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
      throw new ApiError(res.status, err.code ?? "error", err.message ?? res.statusText, data);
    }
    return data as T;
  }

  return {
    // A bare GET only returns the server's default page (50) — every consumer
    // of this client treats the result as the complete catalog, so page
    // through it here. Capped at 20 pages as a runaway backstop.
    listApps: async () => {
      const apps: AppSummary[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 20; page++) {
        const qs = new URLSearchParams({ limit: "200" });
        if (cursor) qs.set("cursor", cursor);
        const r = await req<{ apps: AppSummary[]; nextCursor?: string }>(`/apps?${qs}`);
        apps.push(...r.apps);
        if (!r.nextCursor) break;
        cursor = r.nextCursor;
      }
      return apps;
    },

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
      req<{ value: unknown; logs?: string[]; apiCalls?: ApiCallRecord[] }>(
        `/apps/${encodeURIComponent(appId)}/actions/${encodeURIComponent(actionKey)}/invoke`,
        // This body is built KEY BY KEY, not by spreading `opts` — so every new
        // option has to be named here or it is silently dropped before the wire
        // (the caller compiles, the UI looks right, the field never leaves the
        // page). `project` scopes document-expression resolution to the
        // workflow's selected project; `state` is the start state upstream step
        // outputs are seeded from, so `{{ steps.<id>.output.<f> }}` resolves.
        // Undefined keys are dropped by JSON.stringify, so an absent project or
        // state leaves the request byte-identical to one that never had them.
        {
          method: "POST",
          body: JSON.stringify({
            params,
            connectionId: opts.connectionId,
            project: opts.project,
            state: opts.state,
          }),
        },
      ),

    listSavedTests: (connectionId) =>
      req<{ savedTests: SavedTest[] }>(
        `/connections/${encodeURIComponent(connectionId)}/saved-tests`,
      ).then((r) => r.savedTests ?? []),

    createSavedTest: (connectionId, body) =>
      req<{ savedTest: SavedTest }>(
        `/connections/${encodeURIComponent(connectionId)}/saved-tests`,
        { method: "POST", body: JSON.stringify(body) },
      ).then((r) => r.savedTest),

    updateSavedTest: (connectionId, id, patch) =>
      req<{ savedTest: SavedTest }>(
        `/connections/${encodeURIComponent(connectionId)}/saved-tests/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      ).then((r) => r.savedTest),

    deleteSavedTest: (connectionId, id) =>
      req<void>(
        `/connections/${encodeURIComponent(connectionId)}/saved-tests/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      ).then(() => undefined),

    recordTestRun: (connId, body) =>
      req<{ run: unknown }>(`/connections/${encodeURIComponent(connId)}/test-runs`, {
        method: "POST",
        body: JSON.stringify(body),
      }).then(() => undefined),

    listTestRuns: (connectionId) =>
      req<{ runs: TestRunSummary[] }>(
        `/connections/${encodeURIComponent(connectionId)}/test-runs`,
      ).then((r) => r.runs ?? []),

    saveStepTest: (workflowId, stepId, body) =>
      req<{ stepTest: StepTest }>(
        `/workflows/${encodeURIComponent(workflowId)}/steps/${encodeURIComponent(stepId)}/tests`,
        { method: "POST", body: JSON.stringify(body) },
      ).then((r) => r.stepTest),

    listStepTests: (workflowId, stepId) =>
      req<{ stepTests: StepTest[] }>(
        `/workflows/${encodeURIComponent(workflowId)}/steps/${encodeURIComponent(stepId)}/tests`,
      ).then((r) => r.stepTests ?? []),

    recordStepTestRun: (workflowId, stepId, body) =>
      req<{ run: unknown }>(
        `/workflows/${encodeURIComponent(workflowId)}/steps/${encodeURIComponent(stepId)}/test-runs`,
        { method: "POST", body: JSON.stringify(body) },
      ).then(() => undefined),
  };
}
