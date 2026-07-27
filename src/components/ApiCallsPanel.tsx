import type { ReactNode } from "react";
import type { ApiCallRecord } from "../types.ts";

export interface ApiCallsPanelProps {
  /** The captured outbound calls to render, in the order they were made. */
  calls: ApiCallRecord[];
  /**
   * Open every call's `<details>` on first render. Default `false` — the wire
   * log is ground truth you reach for, not something to read on every run. A
   * host that already landed the user on ONE specific call (e.g. a drill-down
   * that scoped the list to it) passes `true` so the user isn't made to click
   * twice through their own target.
   */
  defaultOpen?: boolean;
  /**
   * React `key` for each call. Defaults to method + url + array index, which is
   * stable within a single run because captured calls carry no id of their own.
   * A host rendering PERSISTED rows (which do have an id) across a paginated
   * list must pass its own — index keys collide between pages and React then
   * reuses the wrong `<details>` open-state.
   */
  keyOf?: (call: ApiCallRecord, index: number) => string;
  /**
   * Section header. Defaults to `API call(s) (N)`. Pass `false` to suppress it
   * entirely when the host already owns the heading — same idiom as
   * `ActionTestForm`'s `embedded` prop, which suppresses its own pop-out chrome
   * because the host provides it. Any other node replaces the default text.
   */
  title?: ReactNode | false;
}

/** Pretty-print a captured body when it is JSON; otherwise show it verbatim. */
function formatBody(body: string | null | undefined): string {
  if (!body) return "";
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

/** Captured calls have no id of their own; index is stable within a run. */
function defaultKeyOf(call: ApiCallRecord, index: number): string {
  return `${call.method}-${call.url ?? call.host}-${index}`;
}

/**
 * The wire log for a run: each outbound HTTP call the action made, with the
 * request we sent and the response we got back. Collapsed by default — it is the
 * ground truth you open when the result looks wrong (e.g. a template variable
 * that came through unrendered), not something to read on every run.
 *
 * Purely presentational: it renders exactly what it is given, with no fetching,
 * no context, and no derivation of state from the calls. Credential redaction
 * happens server-side at capture time (request AND response headers); nothing
 * here re-inspects or re-redacts them.
 */
export function ApiCallsPanel({ calls, defaultOpen, keyOf, title }: ApiCallsPanelProps) {
  if (calls.length === 0) return null;
  const key = keyOf ?? defaultKeyOf;
  return (
    <div className="w6w-stack" style={{ gap: 4 }}>
      {title !== false && (
        <strong className="w6w-small">
          {title ?? (
            <>
              API {calls.length === 1 ? "call" : "calls"} ({calls.length})
            </>
          )}
        </strong>
      )}
      {calls.map((call, i) => (
        <details
          key={key(call, i)}
          open={defaultOpen}
          className="w6w-result"
          style={{ padding: 8 }}
        >
          <summary style={{ cursor: "pointer" }}>
            <span className="w6w-small">
              {call.method} {call.url ?? call.host} →{" "}
              <strong>{call.error ? "failed" : call.status}</strong>
              {call.durationMs !== undefined && (
                <span className="w6w-muted"> · {call.durationMs}ms</span>
              )}
            </span>
          </summary>
          <div className="w6w-stack" style={{ gap: 6, marginTop: 8 }}>
            {call.error && <div className="w6w-error w6w-small">{call.error}</div>}
            <div className="w6w-muted w6w-small">Request headers</div>
            <pre className="w6w-result">{JSON.stringify(call.requestHeaders ?? {}, null, 2)}</pre>
            {call.requestBody && (
              <>
                <div className="w6w-muted w6w-small">Request body</div>
                <pre className="w6w-result">{formatBody(call.requestBody)}</pre>
              </>
            )}
            <div className="w6w-muted w6w-small">Response headers</div>
            <pre className="w6w-result">{JSON.stringify(call.responseHeaders ?? {}, null, 2)}</pre>
            {call.responseBody && (
              <>
                <div className="w6w-muted w6w-small">Response body</div>
                <pre className="w6w-result">{formatBody(call.responseBody)}</pre>
              </>
            )}
            {call.truncated && (
              <div className="w6w-muted w6w-small">
                A captured body exceeded the size cap and was truncated.
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
