import { ConditionEditor } from "./ConditionEditor.tsx";

export function StopEditor({
  values,
  onChange,
  readOnly,
}: {
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const conditional = values.condition !== undefined && values.condition !== true;
  return (
    <div className="w6w-stack">
      <label className="w6w-field">
        <span>Stop when</span>
        <select
          aria-label="Stop when"
          disabled={readOnly}
          value={conditional ? "condition" : "always"}
          onChange={(e) => {
            const next = e.target.value === "condition";
            onChange({ ...values, condition: !next });
          }}
        >
          <option value="always">Always</option>
          <option value="condition">A condition matches</option>
        </select>
      </label>
      {conditional ? (
        <ConditionEditor values={values} onChange={onChange} readOnly={readOnly} purpose="stop" />
      ) : (
        <p className="w6w-muted w6w-small">
          End the whole workflow successfully here, including any remaining loop iterations.
        </p>
      )}
    </div>
  );
}
