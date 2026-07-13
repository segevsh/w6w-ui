import { type ReactNode, useEffect, useState } from "react";
import { CodeEditor } from "./CodeEditor.tsx";
import { JsonEditor } from "./JsonEditor.tsx";
import { ExpressionInput } from "./components/ExpressionInput.tsx";
import { Modal } from "./components/Modal.tsx";
import type { ActionParam, ExprValue, SecretValue } from "./types.ts";

/**
 * Evaluate a param's `showIf` predicate. `getValue` resolves a sibling field's
 * current value (falling back to its default). Params with no `showIf` always show.
 */
function isParamVisible(param: ActionParam, getValue: (key: string) => unknown): boolean {
  const c = param.showIf;
  if (!c) return true;
  const v = getValue(c.field);
  if (c.equals !== undefined) return v === c.equals;
  if (c.in) return c.in.some((x) => x === v);
  if (c.notIn) return !c.notIn.some((x) => x === v);
  if (c.truthy !== undefined) return c.truthy ? !!v : !v;
  return true;
}

/**
 * Render a param list, laying adjacent params that share a `row` id side by side
 * in a flex row; everything else stacks normally.
 */
/**
 * Flatten a param list, descending into `section` children (which write their
 * values flat at the enclosing form level). Used to resolve declared defaults
 * for `showIf` across sections. Non-section `children` (e.g. a nested `group`
 * object) are left alone — those values live nested under the parent key.
 */
function flattenParams(list: ActionParam[]): ActionParam[] {
  const out: ActionParam[] = [];
  for (const p of list) {
    out.push(p);
    if (p.type === "section" && p.children) out.push(...flattenParams(p.children));
  }
  return out;
}

function renderFieldRows(
  list: ActionParam[],
  renderOne: (p: ActionParam) => ReactNode,
): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < list.length; ) {
    const rowId = list[i].row;
    if (rowId) {
      const group: ActionParam[] = [];
      while (i < list.length && list[i].row === rowId) group.push(list[i++]);
      out.push(
        <div className="w6w-field-row" key={`row:${rowId}`}>
          {group.map(renderOne)}
        </div>,
      );
    } else {
      out.push(renderOne(list[i]));
      i++;
    }
  }
  return out;
}

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
  // Effective value of a field for `showIf` checks: the entered value, else the
  // field's declared default (so conditions hold before the user touches it).
  // Section/group children write flat at the enclosing level, so flatten them
  // too — otherwise a `showIf` referencing a section child sees `undefined` for
  // its declared default until the user edits it.
  const flat = flattenParams(params);
  const effective = (key: string) =>
    values[key] !== undefined ? values[key] : flat.find((p) => p.key === key)?.default;
  const visible = params.filter((p) => isParamVisible(p, effective));
  // Split by `advanced` (not by required): required + non-advanced show up front;
  // only fields flagged `advanced` collapse under "Additional parameters".
  const main = visible.filter((p) => p.required || !p.advanced);
  const additional = visible.filter((p) => !p.required && p.advanced);
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  if (params.length === 0) {
    return <p className="w6w-muted w6w-small">This action takes no parameters.</p>;
  }

  // A `section` is a layout-only container: it renders its children through this
  // SAME pipeline (so child `row`/`showIf`/nested sections still work) and —
  // crucially — passes the TOP-LEVEL `set`/`values` down, so section children
  // write to the enclosing form values, not nested under the section key. Note a
  // section IS the disclosure, so a child's `advanced` flag is not re-split here.
  const renderOne = (p: ActionParam): ReactNode =>
    p.type === "section" ? (
      <SectionField key={p.key} param={p} effective={effective} renderOne={renderOne} />
    ) : (
      <ParamField key={p.key} param={p} value={values[p.key]} onChange={set} readOnly={readOnly} />
    );

  return (
    <div className="w6w-stack">
      {renderFieldRows(main, renderOne)}
      {additional.length > 0 && (
        <details className="w6w-params-optional">
          <summary className="w6w-muted w6w-small">
            Additional parameters ({additional.length})
          </summary>
          <div className="w6w-stack" style={{ marginTop: 8 }}>
            {renderFieldRows(additional, renderOne)}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * A `section`-typed param — a layout-only container of `children`. Two shapes:
 * `section: "collapsible"` renders a titled, collapsed-by-default `<details>`
 * disclosure (the app-authored per-cluster disclosure, distinct from the single
 * global "Additional parameters" one); `section: "group"` lays the children out
 * per `layout` — `"row"` side by side (reusing `.w6w-field-row`), else stacked.
 *
 * Children render through the SAME `renderOne` pipeline the enclosing form uses,
 * so their values are written flat at the enclosing form level (a section does
 * NOT nest its value object), and child `row`/`showIf`/nested sections keep
 * working. A child's `advanced` flag is ignored inside a section — the section
 * itself is the disclosure, so children are shown inline within it.
 */
function SectionField({
  param,
  effective,
  renderOne,
}: {
  param: ActionParam;
  effective: (key: string) => unknown;
  renderOne: (p: ActionParam) => ReactNode;
}) {
  const visibleChildren = (param.children ?? []).filter((c) => isParamVisible(c, effective));

  if (param.section === "collapsible") {
    return (
      <details className="w6w-section" open={param.collapsed === false}>
        <summary className="w6w-section-summary">
          <span className="w6w-section-title">{param.title ?? param.label ?? param.key}</span>
          {param.subtitle && <span className="w6w-section-subtitle">{param.subtitle}</span>}
        </summary>
        <div className="w6w-stack w6w-section-body">
          {renderFieldRows(visibleChildren, renderOne)}
        </div>
      </details>
    );
  }

  // group: side by side (`layout: "row"`) or stacked (default). The row wrapper
  // reuses the existing `.w6w-field-row` rule so each child `.w6w-field` sits
  // side by side; stack still honors child `row` grouping via renderFieldRows.
  if (param.layout === "row") {
    return <div className="w6w-field-row">{visibleChildren.map(renderOne)}</div>;
  }
  return <div className="w6w-stack">{renderFieldRows(visibleChildren, renderOne)}</div>;
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
  // A checkbox always carries a value (true/false), so "required" has no meaning
  // for it — don't decorate booleans with the required asterisk.
  const req = param.required && param.type !== "boolean" ? " *" : "";

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

  // Multi-line text: either the dedicated `text` type or any field the app
  // flagged `config.multiline` (e.g. a `string` message body as a textarea).
  if (param.type === "text" || param.config?.multiline) {
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

  // Multi-select: pick several options from a dropdown; each becomes a removable
  // pill. Value is an array of the chosen option values.
  if (param.type === "multiselect") {
    return <MultiSelectField param={param} value={value} onChange={onChange} readOnly={readOnly} />;
  }

  // `array` — a list control: a row per item (a scalar input, or an object's
  // fields side by side), with add/remove buttons.
  if (param.type === "array") {
    return <ArrayField param={param} value={value} onChange={onChange} readOnly={readOnly} />;
  }

  // A constrained set of choices renders as a dropdown — even for a `string`
  // param (e.g. an HTTP method). Driven by `param.options` in the config.
  if (Array.isArray(param.options) && param.options.length > 0) {
    const current = value ?? param.default ?? param.options[0]?.value ?? "";
    const isNumber = param.type === "number";
    return (
      <label className="w6w-field">
        <span>
          {label}
          {req}
        </span>
        <select
          value={String(current)}
          disabled={readOnly}
          onChange={(e) => onChange(param.key, isNumber ? Number(e.target.value) : e.target.value)}
        >
          {param.options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        {param.hint && <span className="w6w-hint">{param.hint}</span>}
      </label>
    );
  }

  // `secret` — an encrypted / expression-capable field. Rendered via the
  // segmented ExpressionInput (masked): the value may be a plain string, an
  // `{type:"expr"}` envelope, or an at-rest `{type:"secret"}` (shown as `***`,
  // never the ciphertext). The var/secret picker data source is wired later
  // (task 3.2) via the `options` prop.
  // TODO(expr-mode): opt string/text fields into expression mode by rendering
  // ExpressionInput here too (e.g. when `param.config?.expression` is set),
  // keeping the plain input as the default for now.
  if (param.type === "secret") {
    const current = (value ?? param.default) as ExprValue | string | SecretValue | undefined;
    return (
      <div className="w6w-field">
        <span>
          {label}
          {req}
        </span>
        <ExpressionInput
          value={current}
          masked
          readOnly={readOnly}
          aria-label={label}
          onChange={(next) => onChange(param.key, next)}
        />
        {param.hint && <span className="w6w-hint">{param.hint}</span>}
      </div>
    );
  }

  // Plain text / number input for everything else.
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
        value={display}
        readOnly={readOnly}
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
  const [expanded, setExpanded] = useState(false);

  // Re-seed only when the field identity changes (a different param selected).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reseed keyed on param identity, not draft value
  useEffect(() => {
    setText(seed === undefined ? "" : JSON.stringify(seed, null, 2));
    setInvalid(false);
  }, [param.key]);

  const onEdit = (next: string) => {
    setText(next);
  };
  const onValid = (parsed: unknown) => {
    setInvalid(false);
    onChange(param.key, parsed);
  };
  const label = param.label ?? param.key;

  return (
    <div className="w6w-field">
      <span className="w6w-field-labelrow">
        <span>
          {label}
          {param.required ? " *" : ""}
        </span>
        <button
          type="button"
          className="w6w-icon-btn w6w-btn-sm"
          title="Open in full view"
          aria-label={`Open ${label} in full view`}
          onClick={() => setExpanded(true)}
        >
          {/* diagonal expand arrows on a 24×24 viewBox */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </span>
      {/* Inline: content-sized, grows with content up to maxHeight, then scrolls
          internally (so it never overlaps the next field). Full view via button. */}
      <JsonEditor
        value={text}
        onChange={onEdit}
        readOnly={readOnly}
        minHeight="34px"
        maxHeight="260px"
        aria-label={`${param.key} JSON`}
        onValidChange={onValid}
        onValidityChange={({ valid }) => setInvalid(!valid)}
      />
      {invalid && (
        <span className="w6w-hint" style={{ color: "var(--w6w-danger)" }}>
          Invalid JSON
        </span>
      )}
      {param.hint && <span className="w6w-hint">{param.hint}</span>}

      {expanded && (
        <Modal
          title={label}
          subtitle={<code>JSON</code>}
          size="wide"
          onClose={() => setExpanded(false)}
        >
          <div className="w6w-json-fullview">
            <JsonEditor
              value={text}
              onChange={onEdit}
              readOnly={readOnly}
              height="100%"
              minHeight="360px"
              aria-label={`${param.key} JSON (full view)`}
              onValidChange={onValid}
              onValidityChange={({ valid }) => setInvalid(!valid)}
            />
          </div>
          {invalid && (
            <span className="w6w-hint" style={{ color: "var(--w6w-danger)" }}>
              Invalid JSON
            </span>
          )}
        </Modal>
      )}
    </div>
  );
}

/**
 * A `multiselect` param — a Material-style chips input: the chosen options render
 * as removable chips *inside* a single input-like box, followed by a dropdown
 * (reading as placeholder text) that appends more. Value is an array of the
 * chosen option values; the dropdown only lists options not already selected.
 */
function MultiSelectField({
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
  const options = Array.isArray(param.options) ? param.options : [];
  const selected: Array<string | number> = Array.isArray(value)
    ? (value as Array<string | number>)
    : Array.isArray(param.default)
      ? (param.default as Array<string | number>)
      : [];
  const selectedKeys = new Set(selected.map(String));
  const available = options.filter((o) => !selectedKeys.has(String(o.value)));
  const labelFor = (v: string | number) =>
    options.find((o) => String(o.value) === String(v))?.label ?? String(v);

  const add = (raw: string) => {
    if (!raw || selectedKeys.has(raw)) return;
    const opt = options.find((o) => String(o.value) === raw);
    onChange(param.key, [...selected, opt ? opt.value : raw]);
  };
  const remove = (v: string | number) =>
    onChange(
      param.key,
      selected.filter((x) => String(x) !== String(v)),
    );

  const placeholder =
    typeof param.placeholder === "string" && param.placeholder ? param.placeholder : "Select…";

  return (
    <div className="w6w-field">
      <span>
        {param.label ?? param.key}
        {param.required ? " *" : ""}
      </span>
      {/* One input-like box: chips inline, then the dropdown as the trailing
          placeholder — chips appear to live inside the field's boundaries. */}
      <div className={`w6w-multiselect${readOnly ? " is-readonly" : ""}`}>
        {selected.map((v) => (
          <span className="w6w-chip" key={String(v)}>
            {labelFor(v)}
            {!readOnly && (
              <button
                type="button"
                className="w6w-chip-x"
                aria-label={`Remove ${labelFor(v)}`}
                title="Remove"
                onClick={() => remove(v)}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!readOnly && (
          // Controlled to "" so it always reads as the trailing placeholder;
          // picking an option appends a chip and resets.
          <select
            className="w6w-multiselect-add"
            value=""
            disabled={available.length === 0}
            aria-label={`Add to ${param.label ?? param.key}`}
            onChange={(e) => add(e.target.value)}
          >
            <option value="">
              {available.length > 0
                ? selected.length
                  ? "Add more…"
                  : placeholder
                : "All selected"}
            </option>
            {available.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {param.hint && <span className="w6w-hint">{param.hint}</span>}
    </div>
  );
}

/** A single input inside an `array` object-item row (placeholder = the field label). */
function ArrayItemInput({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: ActionParam;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly?: boolean;
}) {
  const ph = field.placeholder ?? field.label ?? field.key;
  if (Array.isArray(field.options) && field.options.length > 0) {
    return (
      <select
        className="w6w-array-input"
        value={String(value ?? field.default ?? field.options[0]?.value ?? "")}
        disabled={readOnly}
        aria-label={field.label ?? field.key}
        onChange={(e) => onChange(e.target.value)}
      >
        {field.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  const isNumber = field.type === "number";
  return (
    <input
      className="w6w-array-input"
      type={isNumber ? "number" : "text"}
      value={String(value ?? field.default ?? "")}
      placeholder={ph}
      aria-label={field.label ?? field.key}
      readOnly={readOnly}
      onChange={(e) => onChange(isNumber ? Number(e.target.value) : e.target.value)}
    />
  );
}

/**
 * An `array`-typed param — a list control. Each row is either a single scalar
 * input (`item.type: "string" | "number"`) or an object's `fields` side by side
 * (`item.type: "object"`). "+ Add" appends a blank item; each row has an `×`.
 */
function ArrayField({
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
  const item = param.item ?? { type: "string" };
  const isObject = item.type === "object";
  const items: unknown[] = Array.isArray(value)
    ? value
    : Array.isArray(param.default)
      ? (param.default as unknown[])
      : [];
  const commit = (next: unknown[]) => onChange(param.key, next);
  const blank = (): unknown =>
    isObject
      ? Object.fromEntries((item.fields ?? []).map((f) => [f.key, f.default ?? ""]))
      : item.type === "number"
        ? 0
        : "";
  const patchAt = (idx: number, next: unknown) =>
    commit(items.map((it, j) => (j === idx ? next : it)));

  return (
    <div className="w6w-field">
      <span>
        {param.label ?? param.key}
        {param.required ? " *" : ""}
      </span>
      <div className="w6w-array">
        {items.length === 0 && <p className="w6w-muted w6w-small">None yet — add one below.</p>}
        {items.map((it, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; values are user-edited
          <div className="w6w-array-row" key={idx}>
            {isObject ? (
              <div className="w6w-array-cells">
                {(item.fields ?? []).map((f) => (
                  <ArrayItemInput
                    key={f.key}
                    field={f}
                    value={(it as Record<string, unknown>)?.[f.key]}
                    readOnly={readOnly}
                    onChange={(fv) =>
                      patchAt(idx, { ...((it as Record<string, unknown>) ?? {}), [f.key]: fv })
                    }
                  />
                ))}
              </div>
            ) : (
              <input
                className="w6w-array-input"
                type={item.type === "number" ? "number" : "text"}
                value={String(it ?? "")}
                placeholder={item.placeholder}
                readOnly={readOnly}
                onChange={(e) =>
                  patchAt(idx, item.type === "number" ? Number(e.target.value) : e.target.value)
                }
              />
            )}
            {!readOnly && (
              <button
                type="button"
                className="w6w-array-x"
                aria-label="Remove item"
                title="Remove"
                onClick={() => commit(items.filter((_, j) => j !== idx))}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button
            type="button"
            className="w6w-btn w6w-btn-ghost w6w-btn-sm w6w-array-add"
            onClick={() => commit([...items, blank()])}
          >
            + Add
          </button>
        )}
      </div>
      {param.hint && <span className="w6w-hint">{param.hint}</span>}
    </div>
  );
}

/** One typed key/value entry in a `vars` param. */
export interface DataVar {
  key: string;
  type: "string" | "number" | "boolean" | "json" | "expression";
  value: unknown;
}

const DATA_VAR_TYPES: DataVar["type"][] = ["string", "number", "boolean", "json", "expression"];

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
            {v.type === "expression" ? (
              // A dynamic value: edited with the segmented ExpressionInput and
              // stored as an `{type:"expr"}` envelope (or plain string). The
              // engine resolves it against the run scope before the data node
              // runs, so downstream steps see the computed value.
              <ExpressionInput
                value={v.value as ExprValue | string | undefined}
                onChange={(next) => patch(i, { value: next })}
                placeholder="expression…"
                readOnly={readOnly}
                aria-label="Expression value"
              />
            ) : v.type === "boolean" ? (
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
