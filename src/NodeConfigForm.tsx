import type { FlowStep } from "./flow-types.ts";

/** The base, always-available node settings — independent of the action's params. */
export type NodeConfig = Pick<FlowStep, "retry" | "onError" | "notes">;

/**
 * Node settings form: retry-on-fail, error handling, and notes. Operates on a
 * plain {@link NodeConfig} so it's shared by the add-a-step config and the node
 * editor (all fields optional; absent = defaults).
 */
export function NodeConfigForm({
  config,
  onChange,
  readOnly,
}: {
  config: NodeConfig;
  onChange: (next: NodeConfig) => void;
  readOnly?: boolean;
}) {
  const retryOn = !!config.retry;
  const attempts = config.retry?.maxAttempts ?? 3;
  const delayMs = config.retry?.delayMs ?? 1000;
  const backoff = config.retry?.backoff ?? "fixed";
  const onError = config.onError ?? "fail";

  const setRetry = (patch: Partial<NonNullable<NodeConfig["retry"]>>) =>
    onChange({
      ...config,
      retry: { maxAttempts: attempts, delayMs, backoff, ...config.retry, ...patch },
    });

  return (
    <div className="w6w-stack">
      {/* Retry on fail */}
      <label className="w6w-field">
        <span>
          <input
            type="checkbox"
            checked={retryOn}
            disabled={readOnly}
            onChange={(e) =>
              onChange({
                ...config,
                retry: e.target.checked ? { maxAttempts: attempts, delayMs, backoff } : undefined,
              })
            }
          />{" "}
          Retry on failure
        </span>
        <span className="w6w-hint">Re-run this step if it fails, up to N attempts.</span>
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

      {/* Error handling */}
      <label className="w6w-field">
        <span>On error</span>
        <select
          value={onError}
          disabled={readOnly}
          onChange={(e) => {
            const v = e.target.value as NonNullable<NodeConfig["onError"]>;
            // "fail" is the default — store it as absent to keep the step clean.
            onChange({ ...config, onError: v === "fail" ? undefined : v });
          }}
        >
          <option value="fail">Stop on error (default)</option>
          <option value="continue">Continue</option>
          <option value="continue-record">Continue &amp; record error in end state</option>
        </select>
        {/* This select reads as if it had total authority over failure, and since
            an error edge became authorable it no longer does: per D-T1-3 an
            outgoing error edge OVERRIDES this policy. The honest fix is a static
            hint — this form receives only `{ retry, onError, notes }` and has no
            view of the graph, so it cannot know whether the step has such an
            edge, and giving it one just to find out is out of scope. */}
        <span className="w6w-muted w6w-small">
          If this step has an outgoing <strong>error</strong> edge on the canvas, that edge decides
          what happens when the step fails and this policy is not consulted. To author one: select
          the edge and set <em>Run on: Error</em> — draw the fallback edge first, then the success
          edge.
        </span>
      </label>

      {/* Notes */}
      <label className="w6w-field">
        <span>Notes</span>
        <textarea
          rows={3}
          value={config.notes ?? ""}
          readOnly={readOnly}
          placeholder="Notes about this step (not executed)…"
          onChange={(e) => onChange({ ...config, notes: e.target.value || undefined })}
        />
      </label>
    </div>
  );
}
