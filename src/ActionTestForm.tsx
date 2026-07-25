import { useEffect, useMemo, useState } from "react";
import { JsonEditor } from "./JsonEditor.tsx";
import { ParamsForm } from "./ParamsForm.tsx";
import { Modal } from "./components/Modal.tsx";
import { ApiError } from "./createW6wApi.ts";
import { useW6wApi } from "./provider.tsx";
import type { ActionDef, SavedTest, ThemeMode } from "./types.ts";

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
  /**
   * Studio-integration seam: when provided (and its reference changes) the
   * current action's params are seeded from a shallow copy of this object, so a
   * host page can "open" a saved test pre-filled. The stored object is never
   * mutated; a subsequent user edit is free to diverge. Optional — existing
   * consumers keep compiling.
   */
  seedValues?: Record<string, unknown> | null;
  /**
   * Studio-integration seam: fired after a successful saved-test create/delete
   * so the host page can invalidate its own `["saved-tests", connId]` query.
   * The modal rail still refreshes its own list independently. Optional.
   */
  onSavedTestsChanged?: () => void;
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
export function ActionTestForm({
  appId,
  actions,
  connectionId,
  action,
  seedValues,
  onSavedTestsChanged,
}: ActionTestFormProps) {
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

  // Pop-out: when open, the params region moves into a larger `Modal` canvas.
  // It is the SAME region bound to the SAME `values`/`setValues`, just relocated,
  // so edits stay in sync with the inline view.
  const [modalOpen, setModalOpen] = useState(false);

  // Param values, re-seeded from defaults whenever the selected action changes.
  // On a FRESH MOUNT with `seedValues` present (e.g. a deep-linked saved test),
  // seed from a shallow copy of it rather than defaults — otherwise the seed guard
  // below never fires on first render (`lastSeed` inits to the same ref) and the
  // seeded values are dropped.
  const selectedKey = selectedAction?.key ?? null;
  const [valuesByAction, setValuesByAction] = useState<{
    key: string | null;
    values: Record<string, unknown>;
  }>(() => ({
    key: selectedKey,
    values: seedValues ? { ...seedValues } : defaultParamsFor(selectedAction),
  }));

  // The id of the saved test currently being edited, or `null` for an unsaved
  // test. Drives the PATCH-vs-POST decision in `submitSaveTest`: a set id updates
  // that row in place, `null` creates a new named row.
  const [editingTestId, setEditingTestId] = useState<string | null>(null);

  if (valuesByAction.key !== selectedKey) {
    // Selection changed (controlled or via the picker, without a remount) — reset the
    // form values AND clear any stale result/error carried over from the previously
    // selected action (a 403 from `list-get` must not linger while `mail-send` shows).
    // Switching actions starts a fresh unsaved test, so drop any editing id.
    setValuesByAction({ key: selectedKey, values: defaultParamsFor(selectedAction) });
    setEditingTestId(null);
    setError(null);
    setResult(undefined);
  }

  // Studio seam: when a new `seedValues` reference arrives (e.g. "open a saved
  // test"), seed the current action's params from a SHALLOW COPY of it. Applied
  // as a render-phase guard like the action-change reseed above; the passed
  // object is never mutated and later edits are free to diverge.
  const [lastSeed, setLastSeed] = useState<Record<string, unknown> | null | undefined>(seedValues);
  if (seedValues !== lastSeed) {
    setLastSeed(seedValues);
    if (seedValues) {
      setValuesByAction({ key: selectedKey, values: { ...seedValues } });
      setError(null);
      setResult(undefined);
    }
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

  // The single invoke path — used by "Run action" and by re-running a saved test.
  const runWith = async (params: Record<string, unknown>) => {
    if (!selectedAction) return;
    setRunning(true);
    setError(null);
    setResult(undefined);
    try {
      const r = await api.invokeAction(appId, selectedAction.key, params, { connectionId });
      setResult(r.value);
    } catch (e) {
      setError(describeInvokeError(e));
    } finally {
      setRunning(false);
    }
  };
  const run = () => runWith(values);

  // Saved tests for this connection. `nonce` re-triggers the fetch after a
  // create/delete so the rail reflects the change without a full remount.
  const [savedTests, setSavedTests] = useState<SavedTest[] | null>(null);
  const [savedTestsError, setSavedTestsError] = useState<string | null>(null);
  const [savedTestsNonce, setSavedTestsNonce] = useState(0);
  // Name-a-saved-test dialog (in-app Modal — never the browser's prompt()).
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const refreshSavedTests = () => setSavedTestsNonce((n) => n + 1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `savedTestsNonce` is a deliberate re-fetch trigger, not read inside the effect.
  useEffect(() => {
    if (!connectionId) {
      setSavedTests(null);
      return;
    }
    let canceled = false;
    setSavedTestsError(null);
    api
      .listSavedTests(connectionId)
      .then((list) => !canceled && setSavedTests(list))
      .catch((e) => !canceled && setSavedTestsError((e as Error).message));
    return () => {
      canceled = true;
    };
  }, [api, connectionId, savedTestsNonce]);

  // Only this action's saved tests belong on the rail.
  const railTests = selectedKey
    ? (savedTests ?? []).filter((t) => t.actionKey === selectedKey)
    : [];

  // Open the in-app name dialog to save the current params as a named test.
  const openSaveModal = () => {
    if (!connectionId || !selectedAction) return;
    setPendingName("");
    setSavedTestsError(null);
    setNameModalOpen(true);
  };
  // Persist the current params. When a saved test is loaded for editing
  // (`editingTestId` set), PATCH that row in place — updating only `values` keeps
  // its name and sidesteps the 409 duplicate-name guard a re-POST would trip.
  // With no editing id, create a new named row from the dialog and remember its
  // id so the next save updates in place rather than spawning a second row.
  const submitSaveTest = async () => {
    if (!connectionId || !selectedAction) return;
    try {
      if (editingTestId) {
        await api.updateSavedTest(connectionId, editingTestId, { values });
      } else {
        const name = pendingName.trim();
        if (!name) return;
        const created = await api.createSavedTest(connectionId, {
          actionKey: selectedAction.key,
          name,
          values,
        });
        setEditingTestId(created.id);
      }
      setNameModalOpen(false);
      setPendingName("");
      refreshSavedTests();
      onSavedTestsChanged?.();
    } catch (e) {
      setSavedTestsError((e as Error).message);
    }
  };

  // Load a saved test's values into the form (shallow copy — never mutate the
  // stored row). "Run" additionally re-invokes with those values.
  const loadSavedTest = (t: SavedTest) => {
    setValuesByAction({ key: selectedKey, values: { ...t.values } });
    // Remember which row is being edited so a subsequent save PATCHes it in place.
    setEditingTestId(t.id);
    setViewMode("form");
    setError(null);
    setResult(undefined);
  };
  const runSavedTest = (t: SavedTest) => {
    const params = { ...t.values };
    setValuesByAction({ key: selectedKey, values: params });
    setViewMode("form");
    return runWith(params);
  };
  const removeSavedTest = async (t: SavedTest) => {
    if (!connectionId) return;
    try {
      await api.deleteSavedTest(connectionId, t.id);
      refreshSavedTests();
      onSavedTestsChanged?.();
    } catch (e) {
      setSavedTestsError((e as Error).message);
    }
  };

  // The params region: the form↔JSON toggle plus the ParamsForm/JsonEditor block.
  // Rendered in exactly one place at a time — inline when the pop-out is closed,
  // inside the `Modal` when it's open — so there's a single instance bound to the
  // single `values`/`setValues` state (no copy-on-open, edits stay in sync).
  const paramsRegion = (
    <div className="w6w-stack" style={{ gap: 6 }}>
      <div
        className="w6w-field-labelrow"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <span className="w6w-muted w6w-small">Parameters</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            className={`w6w-btn w6w-btn-sm w6w-btn-ghost${viewMode === "form" ? " active" : ""}`}
            aria-pressed={viewMode === "form"}
            onClick={() => setViewMode("form")}
          >
            Form
          </button>
          <button
            type="button"
            className={`w6w-btn w6w-btn-sm w6w-btn-ghost${viewMode === "json" ? " active" : ""}`}
            aria-pressed={viewMode === "json"}
            onClick={enterJsonView}
          >
            JSON
          </button>
          <button
            type="button"
            className="w6w-btn w6w-btn-sm w6w-btn-ghost"
            aria-pressed={modalOpen}
            title={
              modalOpen ? "Collapse the params editor" : "Open the params editor in a larger view"
            }
            aria-label={
              modalOpen ? "Collapse the params editor" : "Open the params editor in a larger view"
            }
            onClick={() => setModalOpen((v) => !v)}
          >
            {modalOpen ? "⤡" : "⤢"}
          </button>
        </div>
      </div>

      {viewMode === "form" ? (
        <ParamsForm params={selectedAction?.params ?? []} values={values} onChange={setValues} />
      ) : (
        <>
          <JsonEditor
            value={jsonText}
            onChange={setJsonText}
            minHeight={modalOpen ? "50vh" : "200px"}
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
  );

  // The saved-tests rail — the right pane of the pop-out. Only meaningful when a
  // connection is fixed; hidden entirely otherwise (guarded on `connectionId`).
  const savedTestsRail = connectionId ? (
    <div className="w6w-stack" style={{ gap: 6 }}>
      <div
        className="w6w-field-labelrow"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <span className="w6w-muted w6w-small">Saved tests</span>
        <button type="button" className="w6w-btn w6w-btn-sm w6w-btn-ghost" onClick={openSaveModal}>
          Save test
        </button>
      </div>
      {savedTestsError && (
        <span className="w6w-hint" style={{ color: "var(--w6w-danger)" }}>
          {savedTestsError}
        </span>
      )}
      {railTests.length === 0 ? (
        <p className="w6w-muted w6w-small">No saved tests for this action yet.</p>
      ) : (
        <ul className="w6w-stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6 }}>
          {railTests.map((t) => (
            <li
              key={t.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                className="w6w-small"
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={t.name}
              >
                {t.name}
              </span>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  className="w6w-btn w6w-btn-sm w6w-btn-ghost"
                  onClick={() => loadSavedTest(t)}
                >
                  Load
                </button>
                <button
                  type="button"
                  className="w6w-btn w6w-btn-sm w6w-btn-ghost"
                  disabled={running}
                  onClick={() => runSavedTest(t)}
                >
                  Run
                </button>
                <button
                  type="button"
                  className="w6w-btn w6w-btn-sm w6w-btn-ghost"
                  onClick={() => removeSavedTest(t)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : null;

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

          {(() => {
            // The tester body: params editor + Run/Save actions + result. Rendered
            // inline when the modal is closed, and inside the pop-out modal (left
            // pane, with the saved-tests rail on the right) when open — so Run and
            // Save are available in BOTH views.
            const body = (
              <div className="w6w-stack" style={{ gap: 12 }}>
                {paramsRegion}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="w6w-btn" disabled={running} onClick={run}>
                    {running ? "Running…" : "Run action"}
                  </button>
                  {connectionId && (
                    <button type="button" className="w6w-btn w6w-btn-ghost" onClick={openSaveModal}>
                      Save test
                    </button>
                  )}
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
              </div>
            );
            return modalOpen ? (
              <Modal
                title={`Edit params — ${selectedAction.title ?? selectedAction.key}`}
                onClose={() => setModalOpen(false)}
                size="full"
              >
                {savedTestsRail ? (
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>{body}</div>
                    <div style={{ width: 260, flexShrink: 0 }}>{savedTestsRail}</div>
                  </div>
                ) : (
                  body
                )}
              </Modal>
            ) : (
              body
            );
          })()}

          {nameModalOpen && (
            <Modal title="Save test" onClose={() => setNameModalOpen(false)}>
              <form
                className="w6w-stack"
                style={{ gap: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitSaveTest();
                }}
              >
                <label className="w6w-field">
                  <span>Name this saved test</span>
                  <input
                    type="text"
                    value={pendingName}
                    placeholder="e.g. valid sender"
                    onChange={(e) => setPendingName(e.target.value)}
                  />
                </label>
                {savedTestsError && (
                  <span className="w6w-hint" style={{ color: "var(--w6w-danger)" }}>
                    {savedTestsError}
                  </span>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="w6w-btn w6w-btn-ghost"
                    onClick={() => setNameModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="w6w-btn" disabled={!pendingName.trim()}>
                    Save
                  </button>
                </div>
              </form>
            </Modal>
          )}
        </>
      ) : (
        !action && <p className="w6w-muted w6w-small">Pick an action above to test it.</p>
      )}
    </div>
  );
}
