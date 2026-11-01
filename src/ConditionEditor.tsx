import { useState } from "react";
import { ParamsForm } from "./ParamsForm.tsx";
import { ExpressionInput } from "./components/ExpressionInput.tsx";
import { useExpressionOptions } from "./components/ExpressionOptions.tsx";
import { Icon } from "./components/Icon.tsx";
import {
  CONDITION_OPERATORS,
  conditionOperandText,
  conditionOperandValue,
  readComparison,
} from "./condition-editor.ts";

/** The standard expression textbox on either side of one comparison control. */
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
  const condition = values.condition === undefined ? true : values.condition;
  const parsed = readComparison(condition);
  const [advanced, setAdvanced] = useState(false);
  const [draft, setDraft] = useState({
    left: "" as unknown,
    operator: "===",
    right: "" as unknown,
  });
  const simple = parsed !== undefined || typeof condition === "boolean";
  const comparison = parsed ?? draft;
  const change = (patch: Partial<typeof draft>) => {
    const next = { ...comparison, ...patch };
    setDraft(next);
    onChange({
      ...values,
      condition: next.left === "" ? false : { $expr: { [next.operator]: [next.left, next.right] } },
    });
  };
  return (
    <div className="w6w-condition-editor">
      {advanced || !simple ? (
        <ParamsForm
          params={[{ key: "condition", label: "Condition", type: "json", required: true }]}
          values={values}
          onChange={onChange}
          readOnly={readOnly}
        />
      ) : (
        <div className="w6w-condition-row">
          <ExpressionInput
            value={conditionOperandText(comparison.left)}
            aria-label="Condition field"
            placeholder="Field or expression"
            readOnly={readOnly}
            onChange={(value) => change({ left: conditionOperandValue(value) })}
          />
          <select
            className="w6w-condition-comparison"
            aria-label="Condition comparison"
            disabled={readOnly}
            value={comparison.operator}
            onChange={(event) => change({ operator: event.target.value })}
          >
            {CONDITION_OPERATORS.map(([op, label]) => (
              <option key={op} value={op}>
                {label}
              </option>
            ))}
          </select>
          <ExpressionInput
            value={conditionOperandText(comparison.right)}
            aria-label="Condition value"
            placeholder="Value or expression"
            readOnly={readOnly}
            onChange={(value) => change({ right: conditionOperandValue(value) })}
          />
        </div>
      )}
      {simple && (
        <button
          type="button"
          className="w6w-icon-btn w6w-condition-mode"
          title={advanced ? "Use comparison fields" : "Edit condition expression"}
          aria-label={advanced ? "Use comparison fields" : "Edit condition expression"}
          onClick={() => setAdvanced(!advanced)}
        >
          <Icon name={advanced ? "form" : "code"} size={14} />
        </button>
      )}
      {purpose !== "router" && (
        <p className="w6w-muted w6w-small">
          {purpose === "stop"
            ? "End the workflow when this condition is true."
            : options.loop
              ? "When false, skip the remaining steps for this item."
              : "Continue when this condition is true."}
        </p>
      )}
    </div>
  );
}
