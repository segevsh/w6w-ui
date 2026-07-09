import { useEffect, useState } from "react";
import { JsonEditor } from "./JsonEditor.tsx";
import type { ActionParam } from "./types.ts";

export interface ParamsFormProps {
  /** Declared params of the selected action. */
  params: ActionParam[];
  /** Current values, keyed by param `key`. Becomes the step's `with`. */
  values: Record<string, unknown>;
  /** Fired with the next values object on every edit. */
  onChange: (values: Record<string, unknown>) => void;
  readOnly?: boolean;
}

/**
 * Renders an action's declared params as a form. Required params are always
 * shown; optional ones collapse under a disclosure so the common path stays
 * tidy. Widget is chosen by `param.type` — same field-driven approach as
 * `AuthFieldsForm`, extended with `text` (textarea) and `json` (JsonEditor).
 *
 * Values are collected into a plain object suitable for a step's `with`. For
 * expression bindings (`{ $: "steps.x.output.y" }`) authors drop to the JSON
 * view; this form deals in literals.
 */
export function ParamsForm({ params, values, onChange, readOnly }: ParamsFormProps) {
  const required = params.filter((p) => p.required);
  const optional = params.filter((p) => !p.required);
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  if (params.length === 0) {
    return <p className="w6w-muted w6w-small">This action takes no parameters.</p>;
  }

  return (
    <div className="w6w-stack">
      {required.map((p) => (
        <ParamField
          key={p.key}
          param={p}
          value={values[p.key]}
          onChange={set}
          readOnly={readOnly}
        />
      ))}
      {optional.length > 0 && (
        <details className="w6w-params-optional">
          <summary className="w6w-muted w6w-small">Optional parameters ({optional.length})</summary>
          <div className="w6w-stack" style={{ marginTop: 8 }}>
            {optional.map((p) => (
              <ParamField
                key={p.key}
                param={p}
                value={values[p.key]}
                onChange={set}
                readOnly={readOnly}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ParamField({
  param,
  value,
  onChange,
  readOnly,
}: {
  param: ActionParam;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}) {
  const label = param.label ?? param.key;
  const req = param.required ? " *" : "";

  if (param.type === "boolean") {
    const current = Boolean(value ?? param.default ?? false);
    return (
      <label className="w6w-field">
        <span>
          <input
            type="checkbox"
            checked={current}
            disabled={readOnly}
            onChange={(e) => onChange(param.key, e.target.checked)}
          />{" "}
          {label}
          {req}
        </span>
        {param.hint && <span className="w6w-hint">{param.hint}</span>}
      </label>
    );
  }

  // `json` and `group` params hold objects/arrays. Edit them as JSON so the
  // value round-trips faithfully instead of collapsing to "[object Object]".
  if (param.type === "json" || param.type === "group") {
    return <JsonParamField param={param} value={value} onChange={onChange} readOnly={readOnly} />;
  }

  if (param.type === "text") {
    const current = (value ?? param.default ?? "") as string;
    return (
      <label className="w6w-field">
        <span>
          {label}
          {req}
        </span>
        <textarea
          rows={3}
          value={String(current)}
          readOnly={readOnly}
          onChange={(e) => onChange(param.key, e.target.value)}
        />
        {param.hint && <span className="w6w-hint">{param.hint}</span>}
      </label>
    );
  }

  const inputType =
    param.type === "secret" ? "password" : param.type === "number" ? "number" : "text";
  const raw = value ?? param.default ?? "";
  // Guard against object/array values landing in a text field (they'd render as
  // "[object Object]"); show them JSON-stringified instead.
  const display = typeof raw === "object" && raw !== null ? JSON.stringify(raw) : String(raw ?? "");
  return (
    <label className="w6w-field">
      <span>
        {label}
        {req}
      </span>
      <input
        type={inputType}
        value={display}
        readOnly={readOnly}
        autoComplete={param.type === "secret" ? "new-password" : "off"}
        onChange={(e) =>
          onChange(param.key, param.type === "number" ? Number(e.target.value) : e.target.value)
        }
      />
      {param.hint && <span className="w6w-hint">{param.hint}</span>}
    </label>
  );
}

/**
 * A `json`-typed param edited through the JsonEditor. Holds its own text state
 * (seeded from the incoming value) and only pushes back to the form when the
 * text parses — an invalid draft doesn't corrupt the collected values.
 */
function JsonParamField({
  param,
  value,
  onChange,
  readOnly,
}: {
  param: ActionParam;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}) {
  const seed = value ?? param.default;
  const [text, setText] = useState(() => (seed === undefined ? "" : JSON.stringify(seed, null, 2)));
  const [invalid, setInvalid] = useState(false);

  // Re-seed only when the field identity changes (a different param selected).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reseed keyed on param identity, not draft value
  useEffect(() => {
    setText(seed === undefined ? "" : JSON.stringify(seed, null, 2));
    setInvalid(false);
  }, [param.key]);

  return (
    <div className="w6w-field">
      <span>
        {param.label ?? param.key}
        {param.required ? " *" : ""}
      </span>
      <JsonEditor
        value={text}
        onChange={setText}
        readOnly={readOnly}
        minHeight="120px"
        aria-label={`${param.key} JSON`}
        onValidChange={(parsed) => {
          setInvalid(false);
          onChange(param.key, parsed);
        }}
        onValidityChange={({ valid }) => setInvalid(!valid)}
      />
      {invalid && (
        <span className="w6w-hint" style={{ color: "var(--w6w-danger)" }}>
          Invalid JSON
        </span>
      )}
      {param.hint && <span className="w6w-hint">{param.hint}</span>}
    </div>
  );
}
