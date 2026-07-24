import { useMemo, useState } from "react";
import { JsonEditor } from "./JsonEditor.tsx";
import { ParamsForm } from "./ParamsForm.tsx";
import { ApiError } from "./createW6wApi.ts";
import { useW6wApi } from "./provider.tsx";
import type { ActionDef, ThemeMode } from "./types.ts";

export interface ActionTestFormProps {
  /** App the action belongs to. */
  appId: string;
  /** The app's actions — the caller already has them from the app detail. */
  actions: ActionDef[];
  /** Fixed connection to run against; its credential is resolved server-side. */
  connectionId?: string;
  /**
   * Pre-selected action (controlled). When provided the built-in action
   * `<select>` is hidden — the caller is already driving the selection.
   */
  action?: ActionDef | null;
  /** Theme hint, accepted for parity with other ui-lib components. */
  theme?: ThemeMode;
}

/** Pull default values out of declared params so the form starts populated. */
function defaultParamsFor(action: ActionDef | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of action?.params ?? []) {
    if (p.key && p.default !== undefined) out[p.key] = p.default;
  }
  return out;
}

/** A rendered action error: a plain-language headline, an optional fix hint, and the raw provider detail. */
interface InvokeError {
  headline: string;
  hint?: string;
  detail?: string;
}

/**
 * Pull the provider's own human-readable message out of a raw error string. App
 * actions often throw like `SendGrid list index returned 403: {"errors":[{"message":"…"}]}`
 * — parse the trailing JSON and surface just the human message, keeping the
 * `"<App> … returned <status>"` prefix.
 */
function extractProviderMessage(msg: string): string {
  const brace = msg.indexOf("{");
  if (brace >= 0) {
    try {
      const j = JSON.parse(msg.slice(brace)) as {
        errors?: { message?: string }[];
        error?: { message?: string } | string;
        message?: string;
      };
      const m =
        j?.errors?.[0]?.message ??
        (typeof j?.error === "object" ? j.error?.message : j?.error) ??
        j?.message;
      if (typeof m === "string" && m.trim()) {
        const prefix = msg.slice(0, brace).replace(/[:\s]+$/, "");
        return prefix ? `${prefix}: ${m.trim()}` : m.trim();
      }
    } catch {
      // Not JSON — fall through and return the message as-is.
    }
  }
  return msg;
}

/**
 * Turn a thrown invoke error into a user-facing message. A permission/credential
 * failure at the underlying provider (HTTP 401/403, or the message mentions
 * scopes/forbidden/unauthorized) is stated plainly with what to fix, so the user
 * isn't left staring at a raw upstream JSON blob.
 */
function describeInvokeError(e: unknown): InvokeError {
  if (!(e instanceof ApiError)) {
    return { headline: (e as Error)?.message ?? "The action failed to run." };
  }
  const detail = extractProviderMessage(e.message);
  const haystack = `${e.status} ${e.code} ${e.message}`.toLowerCase();
  const isPermission =
    e.status === 401 ||
    e.status === 403 ||
    /\b(401|403)\b|forbidden|unauthorized|not authorized|permission|scope|access denied|invalid api key|invalid credential/.test(
      haystack,
    );
  if (isPermission) {
    return {
      headline:
        "Permission denied by the provider — this is a credential/scope problem, not a w6w error.",
      hint:
        "The connection's API key is missing the permissions this action needs. Fix it at the " +
        "provider — e.g. SendGrid → Settings → API Keys → give the key the required scopes (or Full " +
        "Access), or create a new key — then update this connection's credential and try again.",
      detail,
    };
  }
  return { headline: "The action returned an error.", detail };
}

/**
 * Schema-driven form to test/run a single action against a connection. Renders
 * the action's declared params through {@link ParamsForm} (the same primitive
 * the step builder uses) instead of a raw JSON textarea, invokes the action via
 * `useW6wApi().invokeAction`, and shows the returned value or error.
 *
 * The selected action is either controlled by the caller (`action` prop) or
 * chosen from a built-in `<select>` over `actions`. Param values reset whenever
 * the selected action changes.
 */
export function ActionTestForm({ appId, actions, connectionId, action }: ActionTestFormProps) {
  const api = useW6wApi();

  // Actions sorted for the built-in picker (only used when uncontrolled).
  const sortedActions = useMemo(() => {
    const list = [...actions];
    list.sort((a, b) => (a.title || a.key).localeCompare(b.title || b.key));
    return list;
  }, [actions]);

  // Internal selection, used only when the caller doesn't control `action`.
  const [pickedKey, setPickedKey] = useState<string>(action?.key ?? "");
  const selectedAction: ActionDef | null =
    action ?? actions.find((a) => a.key === pickedKey) ?? null;

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<InvokeError | null>(null);
  const [result, setResult] = useState<unknown>(undefined);

  // Params view: the schema-driven form, or the whole `values` object as raw JSON.
  const [viewMode, setViewMode] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState("");
  const [jsonInvalid, setJsonInvalid] = useState(false);

  // Param values, re-seeded from defaults whenever the selected action changes.
  const selectedKey = selectedAction?.key ?? null;
  const [valuesByAction, setValuesByAction] = useState<{
    key: string | null;
    values: Record<string, unknown>;
  }>(() => ({ key: selectedKey, values: defaultParamsFor(selectedAction) }));
  if (valuesByAction.key !== selectedKey) {
    // Selection changed (controlled or via the picker, without a remount) — reset the
    // form values AND clear any stale result/error carried over from the previously
    // selected action (a 403 from `list-get` must not linger while `mail-send` shows).
    setValuesByAction({ key: selectedKey, values: defaultParamsFor(selectedAction) });
    setError(null);
    setResult(undefined);
  }
  const values = valuesByAction.values;
  const setValues = (next: Record<string, unknown>) =>
    setValuesByAction({ key: selectedKey, values: next });

  // Entering the JSON view seeds the editor from the current values; edits that
  // parse to a plain object round-trip straight back into `values`.
  const enterJsonView = () => {
    setJsonText(JSON.stringify(values, null, 2));
    setJsonInvalid(false);
    setViewMode("json");
  };

  const run = async () => {
    if (!selectedAction) return;
    setRunning(true);
    setError(null);
    setResult(undefined);
    try {
      const r = await api.invokeAction(appId, selectedAction.key, values, { connectionId });
      setResult(r.value);
    } catch (e) {
      setError(describeInvokeError(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="w6w-stack">
      {/* Action picker — only when the caller isn't controlling the selection. */}
      {!action &&
        (actions.length === 0 ? (
          <p className="w6w-muted w6w-small">This app exposes no actions.</p>
        ) : (
          <label className="w6w-field">
            <span>Action{selectedKey ? "" : " *"}</span>
            <select value={pickedKey} onChange={(e) => setPickedKey(e.target.value)}>
              <option value="">— pick an action —</option>
              {sortedActions.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.title ?? a.key} ({a.key})
                </option>
              ))}
            </select>
          </label>
        ))}

      {selectedAction ? (
        <>
          <div>
            <strong>
              {selectedAction.title ?? selectedAction.key}{" "}
              <code className="w6w-muted">{selectedAction.key}</code>
            </strong>
            {selectedAction.description && (
              <p className="w6w-muted w6w-small" style={{ margin: "2px 0 0" }}>
                {selectedAction.description}
              </p>
            )}
          </div>

          <div className="w6w-stack" style={{ gap: 6 }}>
            <div
              className="w6w-field-labelrow"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span className="w6w-muted w6w-small">Parameters</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  className={`w6w-btn w6w-btn-sm w6w-btn-ghost${
                    viewMode === "form" ? " active" : ""
                  }`}
                  aria-pressed={viewMode === "form"}
                  onClick={() => setViewMode("form")}
                >
                  Form
                </button>
                <button
                  type="button"
                  className={`w6w-btn w6w-btn-sm w6w-btn-ghost${
                    viewMode === "json" ? " active" : ""
                  }`}
                  aria-pressed={viewMode === "json"}
                  onClick={enterJsonView}
                >
                  JSON
                </button>
              </div>
            </div>

            {viewMode === "form" ? (
              <ParamsForm
                params={selectedAction.params ?? []}
                values={values}
                onChange={setValues}
              />
            ) : (
              <>
                <JsonEditor
                  value={jsonText}
                  onChange={setJsonText}
                  minHeight="200px"
                  aria-label="Params JSON"
                  onValidChange={(parsed) => {
                    // Only a JSON object maps onto the params `values` record; ignore a
                    // bare array/scalar so `values` stays a plain key→value object.
                    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
                      setValues(parsed as Record<string, unknown>);
                    }
                  }}
                  onValidityChange={({ valid }) => setJsonInvalid(!valid)}
                />
                {jsonInvalid && (
                  <span className="w6w-hint" style={{ color: "var(--w6w-danger)" }}>
                    Invalid JSON
                  </span>
                )}
              </>
            )}
          </div>

          <div>
            <button type="button" className="w6w-btn" disabled={running} onClick={run}>
              {running ? "Running…" : "Run action"}
            </button>
          </div>

          {error && (
            <div className="w6w-result w6w-error">
              <strong>{error.headline}</strong>
              {error.hint && <div style={{ marginTop: 6 }}>{error.hint}</div>}
              {error.detail && (
                <div
                  className="w6w-muted w6w-small"
                  style={{ marginTop: 6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {error.detail}
                </div>
              )}
            </div>
          )}
          {result !== undefined && (
            <div className="w6w-stack" style={{ gap: 4 }}>
              <strong className="w6w-small">Result</strong>
              <pre className="w6w-result">{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </>
      ) : (
        !action && <p className="w6w-muted w6w-small">Pick an action above to test it.</p>
      )}
    </div>
  );
}
