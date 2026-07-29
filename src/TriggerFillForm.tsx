import { useMemo, useState } from "react";
import { PropertyEntryForm } from "./PropertyEntryForm.tsx";
import { requiredParamsFilled } from "./StepBuilderModal.tsx";
import { useW6wApi, useWorkflowProject } from "./provider.tsx";
import { asFieldDefs, fieldsToParams, seedValues } from "./trigger-fields.ts";

type TestState =
  | { status: "running" }
  | { status: "done"; value: unknown; logs?: string[] }
  | { status: "error"; error: string; errorCode?: string; logs?: string[] };

/**
 * The Test-tab widget for a manual/webhook trigger. A trigger's configured
 * `fields` ARE the run's starting state, so testing it means **filling those
 * fields**, not running the raw config (which is why the trigger's output used to
 * come back `{}` — the invoke never carried an `input`).
 *
 * It projects the trigger's `fields` into params (see `./trigger-fields.ts`) and
 * hands them to {@link PropertyEntryForm} — the one property-entry surface, which
 * gives it the per-field widgets, per-field `ƒx`, and the fields ⇄ raw-JSON
 * toggle. This component keeps only the *run*: it enforces each field's
 * `required` via {@link requiredParamsFilled} before enabling Test, and invokes
 * with `{ input: {…filled} }` so the handler (which passes `params.input`
 * through) returns the populated values as the trigger's output state.
 *
 * A trigger with no declared fields (e.g. a webhook, whose payload is arbitrary)
 * gets the raw JSON payload editor — that is the entry form's own empty-params
 * path, not a second code path here — so the operator can still supply a
 * starting state, and the same `{ input }` projection applies.
 */
export function TriggerFillForm({
  app,
  action,
  fields,
}: {
  app: string;
  action: string;
  /** The trigger's `fields` param value (an array of field definitions). */
  fields: unknown;
}) {
  const api = useW6wApi();
  // The workflow's selected project scopes document-expression resolution in the
  // trigger test (undefined outside the editor → server default project).
  const project = useWorkflowProject();
  const defs = useMemo(() => asFieldDefs(fields), [fields]);
  const params = useMemo(() => fieldsToParams(defs), [defs]);
  const hasFields = params.length > 0;

  // One value bag for both paths: declared fields fill it by key, a webhook's
  // raw payload replaces it wholesale.
  const [values, setValues] = useState<Record<string, unknown>>(() => seedValues(defs));

  const [state, setState] = useState<TestState | null>(null);

  // With no declared params this is vacuously true — a webhook payload has
  // nothing to require. An invalid JSON draft never reaches here: the entry form
  // only emits values that parse.
  const canRun = requiredParamsFilled(params, values);

  const run = async () => {
    setState({ status: "running" });
    try {
      // The filled values become the trigger's output/run-input — the handler
      // reads `params.input` and returns it verbatim.
      const result = await api.invokeAction(app, action, { input: values }, { project });
      setState({
        status: "done",
        value: result.value,
        logs: (result as { logs?: string[] }).logs,
      });
    } catch (e) {
      const err = e as { message?: string; code?: string; logs?: string[] };
      setState({
        status: "error",
        error: err.message ?? String(e),
        errorCode: err.code,
        logs: err.logs,
      });
    }
  };

  const logs = state && state.status !== "running" ? state.logs : undefined;

  return (
    <div className="w6w-stack">
      <PropertyEntryForm params={params} values={values} onChange={setValues} />
      {!hasFields && (
        <span className="w6w-hint">
          This trigger declares no fields — provide a sample payload to test with. It becomes the
          trigger's output state (<code>input</code>).
        </span>
      )}

      <div className="w6w-steptest">
        <div className="w6w-steptest-bar">
          <button
            type="button"
            className="w6w-btn w6w-btn-ghost"
            disabled={!canRun || state?.status === "running"}
            onClick={run}
          >
            {state?.status === "running" ? "Running…" : "▶ Test run"}
          </button>
          {!canRun && (
            <span className="w6w-muted w6w-small">Fill the required fields to test.</span>
          )}
        </div>
        {state?.status === "error" && (
          <div className="w6w-result w6w-error">
            {state.errorCode && (
              <div className="w6w-small" style={{ opacity: 0.75, marginBottom: 4 }}>
                <code>{state.errorCode}</code>
              </div>
            )}
            {state.error}
          </div>
        )}
        {state?.status === "done" && (
          <div className="w6w-testout">
            <div className="w6w-testout-label">Output state (filled values)</div>
            <pre
              className="w6w-result"
              style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto", margin: 0 }}
            >
              {JSON.stringify(state.value, null, 2)}
            </pre>
          </div>
        )}
        {logs && logs.length > 0 && (
          <div className="w6w-testout">
            <div className="w6w-testout-label">Console output</div>
            <pre
              className="w6w-result w6w-testout-console"
              style={{ whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", margin: 0 }}
            >
              {logs.join("\n")}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
