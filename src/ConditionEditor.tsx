import { useId, useState } from "react";
import { ParamsForm } from "./ParamsForm.tsx";
import { Combobox } from "./components/Combobox.tsx";
import { useExpressionOptions } from "./components/ExpressionOptions.tsx";
import { inferOutputFields } from "./output-shape.ts";

const comparisons = [
  ["===", "Equals"],
  ["!==", "Does not equal"],
  [">", "Greater than"],
  [">=", "Greater than or equal to"],
  ["<", "Less than"],
  ["<=", "Less than or equal to"],
] as const;

type Comparison = { ref: string; operator: string; value: string | number | boolean | null };
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Only decode shapes we can round-trip without changing their meaning. */
function readComparison(value: unknown): Comparison | undefined {
  if (!object(value) || Object.keys(value).length !== 1 || !object(value.$expr)) return;
  const entries = Object.entries(value.$expr);
  if (entries.length !== 1) return;
  const [operator, args] = entries[0];
  if (!comparisons.some(([op]) => op === operator) || !Array.isArray(args) || args.length !== 2)
    return;
  const [left, right] = args;
  if (!object(left) || Object.keys(left).length !== 1 || typeof left.var !== "string") return;
  if (right !== null && !["string", "number", "boolean"].includes(typeof right)) return;
  return { ref: left.var, operator, value: right as Comparison["value"] };
}

/** A field/comparison/value editor that writes the engine's existing expression format. */
export function ConditionEditor({
  values,
  onChange,
  readOnly,
  purpose = "if",
}: {
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  readOnly?: boolean;
  purpose?: "if" | "stop" | "router";
}) {
  const options = useExpressionOptions();
  const valueId = useId();
  const condition = values.condition === undefined ? true : values.condition;
  const parsed = readComparison(condition);
  const [advanced, setAdvanced] = useState(false);
  const [draft, setDraft] = useState<Comparison>({ ref: "", operator: "===", value: "" });
  const simple = parsed !== undefined || typeof condition === "boolean";
  const comparison = parsed ?? draft;
  const fields: { value: string; label: string }[] = [];
  const add = (value: string, label: string) => fields.push({ value, label });
  if (options.loop) {
    for (const field of options.loop.itemOutputs ?? []) {
      add(`foreach.item.${field.key}`, `Current item · ${field.label ?? field.key}`);
    }
    add("foreach.item", "Current item");
    add("foreach.index", "Loop index");
  }
  for (const step of options.steps ?? []) {
    add(`nodes.${step.id}.output`, `${step.label ?? step.id} · Entire output`);
    const fields =
      step.outputs ?? inferOutputFields(options.sampleValues?.[`nodes.${step.id}.output`]) ?? [];
    for (const field of fields) {
      add(
        `nodes.${step.id}.output.${field.key}`,
        `${step.label ?? step.id} · ${field.label ?? field.key}`,
      );
    }
  }
  if (options.hasTrigger) {
    add("trigger.event", "Trigger event");
    for (const field of inferOutputFields(options.sampleValues?.["trigger.event"]) ?? []) {
      add(`trigger.event.${field.key}`, `Trigger · ${field.key}`);
    }
  }
  for (const name of options.vars ?? []) add(`var.${name}`, `Variable · ${name}`);
  for (const name of options.constants ?? []) add(`const.${name}`, `Constant · ${name}`);
  for (const name of options.inputs ?? []) add(`inputs.${name}`, `Input · ${name}`);
  if (comparison.ref && !fields.some((f) => f.value === comparison.ref))
    add(comparison.ref, comparison.ref);

  const change = (patch: Partial<Comparison>) => {
    const next = { ...comparison, ...patch };
    setDraft(next);
    if (next.ref) {
      onChange({
        ...values,
        condition: { $expr: { [next.operator]: [{ var: next.ref }, next.value] } },
      });
    }
  };
  const valueType = comparison.value === null ? "null" : typeof comparison.value;
  return (
    <div className="w6w-stack">
      <div>
        <button
          type="button"
          className="w6w-linkbtn"
          disabled={!simple}
          onClick={() => setAdvanced(!advanced)}
        >
          {advanced || !simple ? "Use comparison fields" : "Edit expression"}
        </button>
      </div>
      {advanced || !simple ? (
        <>
          <ParamsForm
            params={[
              { key: "condition", label: "Condition", type: "json", required: true, default: true },
            ]}
            values={values}
            onChange={onChange}
            readOnly={readOnly}
          />
          {!simple && (
            <p className="w6w-muted w6w-small">This condition uses a custom expression.</p>
          )}
        </>
      ) : (
        <>
          <div className="w6w-field-row">
            <div className="w6w-field">
              <span className="w6w-label">Field</span>
              <Combobox
                aria-label="Condition field"
                mode="combobox"
                options={fields}
                placeholder="Select a field…"
                value={comparison.ref}
                disabled={readOnly}
                onChange={(ref) => {
                  const sample = options.sampleValues?.[ref];
                  const type = typeof sample;
                  change({
                    ref,
                    value: type === "boolean" ? true : type === "number" ? 0 : "",
                  });
                }}
              />
            </div>
            <label className="w6w-field">
              <span className="w6w-label">Comparison</span>
              <select
                aria-label="Condition comparison"
                disabled={readOnly}
                value={comparison.operator}
                onChange={(e) => change({ operator: e.target.value })}
              >
                {comparisons.map(([op, label]) => (
                  <option key={op} value={op}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="w6w-field">
              <label className="w6w-field">
                <span className="w6w-label">Value type</span>
                <select
                  aria-label="Condition value type"
                  disabled={readOnly}
                  value={valueType}
                  onChange={(e) =>
                    change({
                      value:
                        e.target.value === "boolean"
                          ? true
                          : e.target.value === "number"
                            ? 0
                            : e.target.value === "null"
                              ? null
                              : "",
                    })
                  }
                >
                  <option value="string">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="null">Null</option>
                </select>
              </label>
              {valueType !== "null" && (
                <label className="w6w-field" htmlFor={valueId}>
                  <span className="w6w-label">Value</span>
                  {valueType === "boolean" ? (
                    <select
                      id={valueId}
                      aria-label="Condition value"
                      disabled={readOnly}
                      value={String(comparison.value)}
                      onChange={(e) => change({ value: e.target.value === "true" })}
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  ) : (
                    <input
                      id={valueId}
                      aria-label="Condition value"
                      type={valueType === "number" ? "number" : "text"}
                      step={valueType === "number" ? "any" : undefined}
                      readOnly={readOnly}
                      value={String(comparison.value)}
                      onChange={(e) => {
                        const value =
                          valueType === "number" ? e.target.valueAsNumber : e.target.value;
                        if (typeof value !== "number" || Number.isFinite(value)) change({ value });
                      }}
                    />
                  )}
                </label>
              )}
            </div>
          </div>
          <p className="w6w-muted w6w-small">
            {!comparison.ref
              ? `Choose a field to compare. The current condition is ${String(condition)}.`
              : purpose === "stop"
                ? "End the whole workflow when the comparison is true. Otherwise, continue to the next step."
                : purpose === "router"
                  ? "Take this route when the comparison is true and no earlier route matched."
                  : options.loop
                    ? "Compare the current item. When false, the remaining steps for this item are skipped."
                    : "Continue to the next step when the comparison is true."}
          </p>
        </>
      )}
    </div>
  );
}
