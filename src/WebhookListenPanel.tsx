import { useCallback, useEffect, useRef, useState } from "react";
import { Copyable } from "./components/Copyable.tsx";
import { ResultViewer } from "./components/ResultViewer.tsx";
import { WEBHOOK_APP } from "./flow-types.ts";
import { useW6WApi } from "./provider.tsx";
import type { SubscriptionSummary, WebhookListenSession } from "./types.ts";

/** The captured call a webhook trigger emits as its output. */
export type CapturedWebhookRequest = NonNullable<WebhookListenSession["request"]>;

/**
 * The `@w6w/webhook` subscription that feeds `stepId`: the one bound to that node, else the
 * workflow's first webhook subscription (one not bound to any node — the URL panel's own pick).
 */
export function pickWebhookSubscription(
  subs: SubscriptionSummary[],
  stepId: string,
): SubscriptionSummary | null {
  const hooks = subs.filter((s) => s.appId === WEBHOOK_APP);
  return hooks.find((s) => s.nodeId === stepId) ?? hooks.find((s) => !s.nodeId) ?? hooks[0] ?? null;
}

/** Header names whose values are never shown, on top of the server's own credential masking. */
const SECRET_HEADER_RE = /auth|token|secret|passw|cookie|api[-_]?key|signature|session/i;
const MASK = "••••••";

/** Headers for display: secret-looking values masked. */
export function displayHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k] = SECRET_HEADER_RE.test(k) ? MASK : v;
  return out;
}

/** One long-poll's hold, in seconds (the server caps it at 25). */
const POLL_WAIT_S = 20;

type ListenState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "waiting"; session: WebhookListenSession }
  | { phase: "captured"; session: WebhookListenSession; request: CapturedWebhookRequest }
  | { phase: "expired" }
  | { phase: "error"; message: string };

/**
 * "Listen for test event" — the webhook trigger's primary Test action. Opens a short-lived listen
 * session on the node's webhook subscription, so the receive URL captures the next request even
 * while the workflow is unpublished (the caller gets a test acknowledgement and no run starts),
 * and long-polls it. A captured request is shown — method, time, query, headers (secret-looking
 * ones masked), pretty body — and **Use as test data** hands it to `onUse`, which makes it this
 * trigger's output and saved test.
 */
export function WebhookListenPanel({
  workflowId,
  stepId,
  stepWith,
  readOnly,
  onUse,
  using,
}: {
  workflowId: string;
  stepId: string;
  /** The node's current config — the params a newly created subscription starts from. */
  stepWith: Record<string, unknown> | undefined;
  readOnly?: boolean;
  onUse: (request: CapturedWebhookRequest) => void;
  /** `onUse`'s save is in flight. */
  using?: boolean;
}) {
  const api = useW6WApi();
  // `undefined` while the list is in flight; `null` once resolved with none.
  const [sub, setSub] = useState<SubscriptionSummary | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [state, setState] = useState<ListenState>({ phase: "idle" });
  const [now, setNow] = useState(() => Date.now());
  // The live session and its poll's abort handle — refs, so unmount and Stop see the latest.
  const live = useRef<{ subId: string; sessionId: string; abort: AbortController } | null>(null);

  useEffect(() => {
    const list = api.listSubscriptionsForWorkflow;
    if (!list) return;
    let canceled = false;
    list(workflowId)
      .then((subs) => !canceled && setSub(pickWebhookSubscription(subs, stepId)))
      .catch((e) => !canceled && setState({ phase: "error", message: (e as Error).message }));
    return () => {
      canceled = true;
    };
  }, [api, workflowId, stepId]);

  const halt = useCallback(
    (remote: boolean) => {
      const cur = live.current;
      live.current = null;
      if (!cur) return;
      cur.abort.abort();
      if (remote) api.stopWebhookListen?.(cur.subId, cur.sessionId).catch(() => {});
    },
    [api],
  );

  // Leaving the Test tab (or closing the modal) stops listening on the server too.
  useEffect(() => () => halt(true), [halt]);

  // The countdown only ticks while waiting.
  useEffect(() => {
    if (state.phase !== "waiting") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.phase]);

  const createUrl = () => {
    const create = api.createSubscription;
    if (!create) return;
    setCreating(true);
    create(WEBHOOK_APP, "webhook", { workflowId, connectionId: null, params: stepWith ?? {} })
      .then((created) => setSub(created))
      .catch((e) => setState({ phase: "error", message: (e as Error).message }))
      .finally(() => setCreating(false));
  };

  const listen = async () => {
    const start = api.startWebhookListen;
    const poll = api.pollWebhookListen;
    if (!sub || !start || !poll) return;
    halt(true);
    setState({ phase: "starting" });
    let opened: WebhookListenSession;
    try {
      opened = (await start(sub.id)).session;
    } catch (e) {
      setState({ phase: "error", message: (e as Error).message });
      return;
    }
    const abort = new AbortController();
    const mine = { subId: sub.id, sessionId: opened.id, abort };
    live.current = mine;
    setNow(Date.now());
    setState({ phase: "waiting", session: opened });
    for (;;) {
      let s: WebhookListenSession;
      try {
        s = await poll(sub.id, opened.id, { waitSeconds: POLL_WAIT_S, signal: abort.signal });
      } catch (e) {
        if (live.current !== mine) return; // stopped / superseded / unmounted
        live.current = null;
        setState({ phase: "error", message: (e as Error).message });
        return;
      }
      if (live.current !== mine) return;
      if (s.status === "captured" && s.request) {
        live.current = null;
        setState({ phase: "captured", session: s, request: s.request });
        return;
      }
      if (s.status === "expired") {
        live.current = null;
        api.stopWebhookListen?.(sub.id, opened.id).catch(() => {});
        setState({ phase: "expired" });
        return;
      }
    }
  };

  const stop = () => {
    halt(true);
    setState({ phase: "idle" });
  };

  if (!api.startWebhookListen || !api.pollWebhookListen) return null;
  const url = sub?.webhookUrl;
  const left =
    state.phase === "waiting"
      ? Math.max(0, Math.ceil((Date.parse(state.session.expiresAt) - now) / 1000))
      : 0;

  return (
    <div className="w6w-stack w6w-listen" data-testid="webhook-listen">
      {sub === undefined ? (
        <p className="w6w-muted w6w-small">Loading…</p>
      ) : !url ? (
        <div className="w6w-stack">
          <p className="w6w-muted w6w-small">
            This webhook has no URL yet. Create one, then listen for a test request.
          </p>
          {!readOnly && api.createSubscription && (
            <button type="button" className="w6w-btn" disabled={creating} onClick={createUrl}>
              {creating ? "Creating…" : "Create webhook URL"}
            </button>
          )}
        </div>
      ) : (
        <>
          <Copyable value={url} readOnly>
            <input type="text" readOnly value={url} aria-label="Webhook URL" />
          </Copyable>
          {state.phase === "waiting" || state.phase === "starting" ? (
            <div className="w6w-listen-waiting">
              <span className="w6w-listen-pulse" aria-hidden="true" />
              <output className="w6w-small">
                Waiting for a request to <code>{url}</code>…
                {state.phase === "waiting" && (
                  <span className="w6w-muted"> {formatLeft(left)} left</span>
                )}
              </output>
              <button type="button" className="w6w-btn w6w-btn-ghost" onClick={stop}>
                Stop
              </button>
            </div>
          ) : (
            <div className="w6w-steptest-bar">
              <button
                type="button"
                className="w6w-btn"
                disabled={readOnly}
                onClick={() => void listen()}
              >
                {state.phase === "captured" ? "Listen again" : "Listen for test event"}
              </button>
              {state.phase === "idle" && (
                <span className="w6w-muted w6w-small">
                  Send a request to this URL — it works before you publish, and starts no run.
                </span>
              )}
            </div>
          )}
        </>
      )}

      {state.phase === "expired" && (
        <p className="w6w-muted w6w-small">
          No request arrived in time. Listen again, then send the request.
        </p>
      )}
      {state.phase === "error" && <div className="w6w-result w6w-error">{state.message}</div>}

      {state.phase === "captured" && (
        <CapturedRequest
          request={state.request}
          receivedAt={state.session.receivedAt}
          readOnly={readOnly}
          using={using}
          onUse={() => onUse(state.request)}
          stepId={stepId}
        />
      )}
    </div>
  );
}

function formatLeft(s: number): string {
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

function CapturedRequest({
  request,
  receivedAt,
  readOnly,
  using,
  onUse,
  stepId,
}: {
  stepId: string;
  request: CapturedWebhookRequest;
  receivedAt?: string;
  readOnly?: boolean;
  using?: boolean;
  onUse: () => void;
}) {
  const hasQuery = Object.keys(request.query ?? {}).length > 0;
  return (
    <div className="w6w-testout w6w-listen-captured" data-testid="webhook-captured">
      <div className="w6w-testout-label">
        Request received
        {receivedAt && (
          <span className="w6w-muted"> · {new Date(receivedAt).toLocaleTimeString()}</span>
        )}
      </div>
      <div className="w6w-small">
        <code>{request.method}</code> <code>{request.path}</code>
      </div>
      {hasQuery && (
        <>
          <div className="w6w-testout-label">Query</div>
          <ResultViewer value={request.query} maxHeight={120} />
        </>
      )}
      <div className="w6w-testout-label">Headers</div>
      <ResultViewer value={displayHeaders(request.headers ?? {})} maxHeight={160} />
      <div className="w6w-testout-label">Body</div>
      <ResultViewer value={request.body} maxHeight={240} />
      {!readOnly && (
        <div className="w6w-steptest-bar">
          <button type="button" className="w6w-btn" disabled={using} onClick={onUse}>
            {using ? "Saving…" : "Use as test data"}
          </button>
          <span className="w6w-muted w6w-small">
            Becomes this trigger's output, so later steps can use{" "}
            <code>{`{{ nodes.${stepId}.output.body… }}`}</code>.
          </span>
        </div>
      )}
    </div>
  );
}
