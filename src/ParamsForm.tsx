import { useEffect, useState } from "react";
import { CodeEditor } from "./CodeEditor.tsx";
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

  // `code` — an inline script/snippet, edited in a real code editor.
  if (param.type === "code") {
    const current = (value ?? param.default ?? "") as string;
    return (
      <div className="w6w-field">
        <span>
          {label}
          {req}
        </span>
        <CodeEditor
          value={String(current)}
          readOnly={readOnly}
          minHeight="180px"
          aria-label={`${param.key} code`}
          onChange={(next) => onChange(param.key, next)}
        />
        {param.hint && <span className="w6w-hint">{param.hint}</span>}
      </div>
    );
  }

  // `vars` — a dynamic table of typed key/value variables.
  if (param.type === "vars") {
    return <VarsField param={param} value={value} onChange={onChange} readOnly={readOnly} />;
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

  const isSecret = param.type === "secret";
  // Secrets are credentials, not login passwords: never `type="password"` (which
  // triggers the browser's save-password prompt + suggestions). Mask with CSS.
  const inputType = param.type === "number" ? "number" : "text";
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
        className={isSecret ? "w6w-secret-input" : undefined}
        value={display}
        readOnly={readOnly}
        name={isSecret ? `w6w-cred-${param.key}` : undefined}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore="true"
        data-lpignore="true"
        data-bwignore="true"
        data-form-type="other"
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

/** One typed key/value entry in a `vars` param. */
export interface DataVar {
  key: string;
  type: "string" | "number" | "boolean" | "json";
  value: unknown;
}

const DATA_VAR_TYPES: DataVar["type"][] = ["string", "number", "boolean", "json"];

/** Coerce a text input into the variable's declared type (best-effort). */
function coerceVarValue(type: DataVar["type"], raw: string): unknown {
  if (type === "number") {
    if (raw.trim() === "") return "";
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (type === "boolean") return raw === "true";
  if (type === "json") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/** Render a stored variable value back into an editable string. */
function varValueToText(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * A `vars`-typed param: a dynamic table of typed key/value variables. The value
 * is an array of `{ key, type, value }`, collected into the step's `with`.
 */
function VarsField({
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
  const vars: DataVar[] = Array.isArray(value)
    ? (value as DataVar[])
    : Array.isArray(param.default)
      ? (param.default as DataVar[])
      : [];
  const commit = (next: DataVar[]) => onChange(param.key, next);
  const patch = (i: number, p: Partial<DataVar>) =>
    commit(vars.map((v, idx) => (idx === i ? { ...v, ...p } : v)));

  return (
    <div className="w6w-field">
      <span>
        {param.label ?? param.key}
        {param.required ? " *" : ""}
      </span>
      <div className="w6w-stack">
        {vars.length === 0 && (
          <p className="w6w-muted w6w-small">No variables yet — add one below.</p>
        )}
        {vars.map((v, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; keys/values are user-edited
          <div className="w6w-datavar-row" key={i}>
            <input
              type="text"
              placeholder="key"
              value={v.key}
              readOnly={readOnly}
              onChange={(e) => patch(i, { key: e.target.value })}
            />
            <select
              value={v.type}
              disabled={readOnly}
              onChange={(e) => {
                const type = e.target.value as DataVar["type"];
                patch(i, { type, value: coerceVarValue(type, varValueToText(v.value)) });
              }}
            >
              {DATA_VAR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {v.type === "boolean" ? (
              <select
                value={v.value === true ? "true" : "false"}
                disabled={readOnly}
                onChange={(e) => patch(i, { value: e.target.value === "true" })}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                type={v.type === "number" ? "number" : "text"}
                placeholder="value"
                value={varValueToText(v.value)}
                readOnly={readOnly}
                onChange={(e) => patch(i, { value: coerceVarValue(v.type, e.target.value) })}
              />
            )}
            {!readOnly && (
              <button
                type="button"
                className="w6w-btn w6w-btn-ghost"
                aria-label={`Remove variable ${v.key || i + 1}`}
                title="Remove"
                onClick={() => commit(vars.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button
            type="button"
            className="w6w-btn w6w-btn-ghost"
            onClick={() => commit([...vars, { key: "", type: "string", value: "" }])}
          >
            + Add variable
          </button>
        )}
      </div>
      {param.hint && <span className="w6w-hint">{param.hint}</span>}
    </div>
  );
}
