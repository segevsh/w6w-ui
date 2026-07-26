import { useMemo, useState } from "react";
import { JsonEditor } from "./JsonEditor.tsx";
import { ParamsForm } from "./ParamsForm.tsx";
import { requiredParamsFilled } from "./StepBuilderModal.tsx";
import { useW6wApi, useWorkflowProject } from "./provider.tsx";
import type { ActionParam } from "./types.ts";

/**
 * One field configured on a manual (`@w6w/trigger`) or webhook (`@w6w/webhook`)
 * trigger — the `fields` param stores an array of these *definitions*
 * (`{ key, type, default, required }`), not values. The Test tab derives a
 * fillable form from them (see {@link TriggerFillForm}).
 */
interface TriggerFieldDef {
  key?: string;
  /** Declared value type — maps to an existing `ParamsForm` widget. */
  type?: string;
  /** Author-declared default (stored as text on the trigger config). */
  default?: unknown;
  required?: boolean;
}

/** Read a trigger's `fields` param value as an array of field definitions. */
function asFieldDefs(fields: unknown): TriggerFieldDef[] {
  return Array.isArray(fields) ? (fields as TriggerFieldDef[]) : [];
}

/** Map a field def's declared type onto one of the `ParamsForm` scalar widgets. */
function fieldWidget(type: string | undefined): ActionParam["type"] {
  return type === "number" || type === "boolean" || type === "json" ? type : "string";
}

/**
 * Coerce a field's author-declared default (stored as text) into a value of the
 * field's declared type, so the derived form seeds a sensible starting value and
 * the required gate sees it as filled. Returns `undefined` for an empty/invalid
 * default (the operator then supplies the value).
 */
function coerceDefault(type: string | undefined, raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === "boolean") return raw === true || raw === "true";
  if (type === "json") {
    try {
      return JSON.parse(String(raw));
    } catch {
      return undefined;
    }
  }
  return String(raw);
}

/**
 * Project a trigger's `fields` definitions into a `ParamsForm`-compatible param
 * list — one input per declared field, keyed by the field's `key`, rendered with
 * the existing per-type widget. Unnamed fields are skipped.
 */
function fieldsToParams(defs: TriggerFieldDef[]): ActionParam[] {
  return defs
    .filter((f) => typeof f.key === "string" && f.key.trim() !== "")
    .map((f) => ({
      key: f.key as string,
      label: f.key as string,
      type: fieldWidget(f.type),
      required: !!f.required,
    }));
}

/** Seed the fill-form values from each declared field's (coerced) default. */
function seedValues(defs: TriggerFieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of defs) {
    if (typeof f.key !== "string" || f.key.trim() === "") continue;
    const v = coerceDefault(f.type, f.default);
    if (v !== undefined) out[f.key] = v;
  }
  return out;
}

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
 * It derives a value form from the trigger's `fields` (reusing the existing
 * per-type field renderers via {@link ParamsForm}), enforces each field's
 * `required` via {@link requiredParamsFilled} before enabling Test, and invokes
 * with `{ input: {…filled} }` so the handler (which passes `params.input`
 * through) returns the populated values as the trigger's output state.
 *
 * A trigger with no declared fields (e.g. a webhook, whose payload is arbitrary)
 * falls back to a raw JSON payload editor so the operator can still supply a
 * starting state — the same `{ input }` projection applies.
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

  // Declared-field path: one input per field, gated on `required`.
  const [values, setValues] = useState<Record<string, unknown>>(() => seedValues(defs));
  // No-fields path (webhook / empty trigger): a raw JSON payload.
  const [payloadText, setPayloadText] = useState("{}");
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [payloadValid, setPayloadValid] = useState(true);

  const [state, setState] = useState<TestState | null>(null);

  const filled = hasFields ? values : payload;
  const canRun = hasFields ? requiredParamsFilled(params, values) : payloadValid;

  const run = async () => {
    setState({ status: "running" });
    try {
      // The filled values become the trigger's output/run-input — the handler
      // reads `params.input` and returns it verbatim.
      const result = await api.invokeAction(app, action, { input: filled }, { project });
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
      {hasFields ? (
        <ParamsForm params={params} values={values} onChange={setValues} />
      ) : (
        <div className="w6w-field">
          <span>Payload</span>
          <JsonEditor
            value={payloadText}
            onChange={setPayloadText}
            minHeight="140px"
            aria-label="Trigger payload JSON"
            onValidChange={(p) => {
              const ok = !!p && typeof p === "object" && !Array.isArray(p);
              setPayloadValid(ok);
              if (ok) setPayload(p as Record<string, unknown>);
            }}
          />
          <span className="w6w-hint">
            This trigger declares no fields — provide a sample payload to test with. It becomes the
            trigger's output state (<code>input</code>).
          </span>
        </div>
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
            <span className="w6w-muted w6w-small">
              {hasFields
                ? "Fill the required fields to test."
                : "Enter a valid JSON payload to test."}
            </span>
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
