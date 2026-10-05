import type { FlowStep } from "./flow-types.ts";

/** Who this retry policy applies to — picks the helper line's wording. */
export type RetryTarget = "step" | "function" | "endpoint" | "workflow";

/** The persisted retry shape (core `rfcs/node-types.md`), minus the `undefined` case. */
export type RetryPolicyValue = NonNullable<FlowStep["retry"]>;

const HELPER_TEXT: Record<RetryTarget, string> = {
  step: "Re-run this step if it fails, up to N attempts.",
  function: "Re-run this function call if it fails, up to N attempts.",
  endpoint: "Re-run this endpoint call if it fails, up to N attempts.",
  workflow: "Re-run the whole workflow run if it fails, up to N attempts.",
};

/**
 * The "Retry on failure" checkbox + helper line + Attempts/Delay (ms)/Backoff
 * row — the one retry shape shared by every host that can offer a retry
 * policy (core rfcs/R-2 "one retry shape everywhere"). `value` is the
 * persisted policy or `undefined` for "no retry"; `target` only changes the
 * helper line's wording, never the behavior.
 */
export function RetryPolicyFields({
  value,
  onChange,
  readOnly,
  target = "step",
}: {
  value: RetryPolicyValue | undefined;
  onChange: (next: RetryPolicyValue | undefined) => void;
  readOnly?: boolean;
  target?: RetryTarget;
}) {
  const retryOn = !!value;
  const attempts = value?.maxAttempts ?? 3;
  const delayMs = value?.delayMs ?? 1000;
  const backoff = value?.backoff ?? "fixed";

  const setRetry = (patch: Partial<RetryPolicyValue>) =>
    onChange({ maxAttempts: attempts, delayMs, backoff, ...value, ...patch });

  return (
    <>
      <label className="w6w-field">
        <span>
          <input
            type="checkbox"
            checked={retryOn}
            disabled={readOnly}
            onChange={(e) =>
              onChange(e.target.checked ? { maxAttempts: attempts, delayMs, backoff } : undefined)
            }
          />{" "}
          Retry on failure
        </span>
        <span className="w6w-hint">{HELPER_TEXT[target]}</span>
      </label>
      {retryOn && (
        <div className="w6w-field-row">
          <label className="w6w-field">
            <span>Attempts</span>
            <input
              type="number"
              min={1}
              value={attempts}
              readOnly={readOnly}
              onChange={(e) => setRetry({ maxAttempts: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
          <label className="w6w-field">
            <span>Delay (ms)</span>
            <input
              type="number"
              min={0}
              value={delayMs}
              readOnly={readOnly}
              onChange={(e) => setRetry({ delayMs: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label className="w6w-field">
            <span>Backoff</span>
            <select
              value={backoff}
              disabled={readOnly}
              onChange={(e) => setRetry({ backoff: e.target.value as "fixed" | "exponential" })}
            >
              <option value="fixed">Fixed</option>
              <option value="exponential">Exponential</option>
            </select>
          </label>
        </div>
      )}
    </>
  );
}
