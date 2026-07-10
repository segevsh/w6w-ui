import { useMemo, useState } from "react";
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

  // Param values, re-seeded from defaults whenever the selected action changes.
  const selectedKey = selectedAction?.key ?? null;
  const [valuesByAction, setValuesByAction] = useState<{
    key: string | null;
    values: Record<string, unknown>;
  }>(() => ({ key: selectedKey, values: defaultParamsFor(selectedAction) }));
  if (valuesByAction.key !== selectedKey) {
    // Selection changed (controlled or via the picker) — reset the form.
    setValuesByAction({ key: selectedKey, values: defaultParamsFor(selectedAction) });
  }
  const values = valuesByAction.values;
  const setValues = (next: Record<string, unknown>) =>
    setValuesByAction({ key: selectedKey, values: next });

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(undefined);

  const run = async () => {
    if (!selectedAction) return;
    setRunning(true);
    setError(null);
    setResult(undefined);
    try {
      const r = await api.invokeAction(appId, selectedAction.key, values, { connectionId });
      setResult(r.value);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message);
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

          <ParamsForm params={selectedAction.params ?? []} values={values} onChange={setValues} />

          <div>
            <button type="button" className="w6w-btn" disabled={running} onClick={run}>
              {running ? "Running…" : "Run action"}
            </button>
          </div>

          {error && <div className="w6w-result w6w-error">{error}</div>}
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
