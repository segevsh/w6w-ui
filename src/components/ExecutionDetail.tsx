import type { ReactNode } from "react";
import { CodeBlock } from "../CodeBlock.tsx";
import type { ExecutionKind } from "./ExecutionList.tsx";
import { ExecutionLogPanel } from "./ExecutionLogPanel.tsx";
import type { ExecutionLogStep } from "./ExecutionLogPanel.tsx";
import { IconButton } from "./IconButton.tsx";
import { StepStatusPill } from "./StepStatusPill.tsx";
import type { ExecutionStatus } from "./StepStatusPill.tsx";
import { formatDurationMs, formatExecutionTime } from "./execution-format.ts";

/**
 * One past execution in full — an already-mapped slice of the host's history
 * payload, the detail-level sibling of `ExecutionListItem`. The HOST maps its
 * own record into this shape; this component never fetches, polls or reaches
 * for an SDK.
 *
 * D2: there is no log-line field anywhere in this shape, on purpose — "logs"
 * for an execution ARE its status, timing, input, output and error, and for a
 * workflow that is the per-step `steps` list below.
 */
export interface ExecutionDetailValue {
  id: string;
  kind: ExecutionKind;
  callableName: string;
  status: ExecutionStatus;
  /** ISO-8601 instant the run started. */
  startedAt: string;
  /** ISO-8601 instant the run finished, or `null` while it is still
   * queued/running (rendered as `—`). */
  finishedAt: string | null;
  /** Wall-clock duration once the run has finished, or `null` while it has not
   * (rendered as `—`). */
  durationMs: number | null;
  /** The run's own input, once it is known. `undefined` = "not available" (no
   * section); `null` = "available, and it is null" (section renders `null`). */
  input?: unknown;
  output?: unknown;
  /** The failure's payload for a failed run. `null`/`undefined` = no error
   * section at all — the reverse gate to `input`/`output`, because an error
   * that is `null` is the absence of an error. */
  error?: unknown;
  /** A workflow run's steps. `undefined` = not a step-bearing run (no section);
   * `[]` = it ran and no step did (the panel's own empty state). */
  steps?: ExecutionLogStep[];
}

export interface ExecutionDetailProps {
  /** The execution to show, or `null` when there is nothing to show yet. */
  execution: ExecutionDetailValue | null;
  /** `true` while the fetch for a `null` `execution` is still in flight —
   * renders the loading branch. Once an `execution` is present it is rendered
   * as-is: a host re-fetching (polling a running run) keeps showing the last
   * known state rather than flashing back to "Loading…". */
  loading?: boolean;
  /** A failure to surface, e.g. the fetch for this execution failed. Rendered
   * as an alert in EVERY branch — it is about the view, not about the run. */
  errorMessage?: ReactNode;
  /** Supplied ⇒ a dismiss control renders and calls this. Omitted ⇒ no
   * control. */
  onClose?: () => void;
  /** Supplied ⇒ the "Open in visual editor" button renders and calls this.
   * Omitted ⇒ no button (a function/endpoint run has no visual editor to open). */
  onOpenInEditor?: () => void;
}

const KIND_LABEL: Record<ExecutionKind, string> = {
  function: "Function",
  endpoint: "Endpoint",
  workflow: "Workflow",
};

/** A value the section is showing that JSON cannot serialise (`undefined`,
 * a function, a symbol) renders as `null` rather than an empty block. */
function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}

/**
 * Everything known about one past execution: which callable it was and how it
 * went, its timing, its own input/output/error, and — for a workflow run — the
 * per-step list.
 *
 * The per-step list sits directly under the timing, above the run's own
 * payloads: for a workflow it is the substance of the view (D2), and burying it
 * under three JSON blocks would make the run read as a function call with
 * appendices.
 *
 * A pure display leaf — no fetching, no polling, no live-ticking timer.
 */
export function ExecutionDetail({
  execution,
  loading = false,
  errorMessage,
  onClose,
  onOpenInEditor,
}: ExecutionDetailProps) {
  return (
    <section className="w6w-execution-detail w6w-stack" data-testid="execution-detail">
      {errorMessage != null && (
        <p
          role="alert"
          className="w6w-execution-detail-error-message"
          data-testid="execution-detail-error-message"
        >
          {errorMessage}
        </p>
      )}
      {execution ? (
        <Body execution={execution} onClose={onClose} onOpenInEditor={onOpenInEditor} />
      ) : loading ? (
        <p className="w6w-muted" data-testid="execution-detail-loading">
          Loading…
        </p>
      ) : (
        <p className="w6w-muted" data-testid="execution-detail-empty">
          No execution selected.
        </p>
      )}
    </section>
  );
}

function Body({
  execution,
  onClose,
  onOpenInEditor,
}: {
  execution: ExecutionDetailValue;
  onClose?: () => void;
  onOpenInEditor?: () => void;
}) {
  return (
    <>
      <div className="w6w-execution-detail-head">
        <div className="w6w-execution-detail-title">
          <h3 className="w6w-execution-detail-name">{execution.callableName}</h3>
          <div className="w6w-execution-detail-meta">
            <StepStatusPill state={execution.status} />
            <span className="w6w-execution-detail-kind w6w-muted w6w-small">
              {KIND_LABEL[execution.kind]}
            </span>
          </div>
        </div>
        {(onOpenInEditor || onClose) && (
          <div className="w6w-execution-detail-actions">
            {onOpenInEditor && (
              <button
                type="button"
                className="w6w-btn w6w-btn-ghost"
                data-testid="execution-detail-open-editor"
                onClick={onOpenInEditor}
              >
                Open in visual editor
              </button>
            )}
            {onClose && (
              <IconButton label="Close" data-testid="execution-detail-close" onClick={onClose}>
                ×
              </IconButton>
            )}
          </div>
        )}
      </div>

      <p className="w6w-execution-detail-id-line">
        <code className="w6w-execution-detail-id" data-testid="execution-detail-id">
          {execution.id}
        </code>
      </p>

      <dl className="w6w-execution-detail-timing">
        <TimingItem label="Started" value={formatExecutionTime(execution.startedAt)} />
        <TimingItem
          label="Finished"
          value={execution.finishedAt ? formatExecutionTime(execution.finishedAt) : "—"}
        />
        <TimingItem label="Duration" value={formatDurationMs(execution.durationMs)} />
      </dl>

      {execution.steps !== undefined && (
        <section
          className="w6w-execution-detail-section w6w-stack"
          data-testid="execution-detail-steps"
        >
          <strong className="w6w-small">Steps</strong>
          <ExecutionLogPanel steps={execution.steps} emptyLabel="No steps ran." />
        </section>
      )}

      {execution.input !== undefined && (
        <JsonSection title="Input" testid="execution-detail-input" value={execution.input} />
      )}
      {execution.output !== undefined && (
        <JsonSection title="Output" testid="execution-detail-output" value={execution.output} />
      )}
      {execution.error != null && (
        <JsonSection title="Error" testid="execution-detail-error" value={execution.error} />
      )}
    </>
  );
}

function TimingItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="w6w-execution-detail-timing-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * One payload as read-only, syntax-highlighted JSON — `CodeBlock`, the same
 * idiom `ExecutionLogPanel` renders a step's input/output through (see its own
 * doc comment for why `CodeBlock` and not `JsonEditor`/`<pre>`).
 */
function JsonSection({ title, testid, value }: { title: string; testid: string; value: unknown }) {
  return (
    <section className="w6w-execution-detail-section w6w-stack" data-testid={testid}>
      <strong className="w6w-small">{title}</strong>
      <CodeBlock code={toJson(value)} language="json" />
    </section>
  );
}
