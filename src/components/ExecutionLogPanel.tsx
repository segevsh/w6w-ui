import { useState } from "react";
import type { ReactNode } from "react";
import { CodeBlock } from "../CodeBlock.tsx";
import { IconButton } from "./IconButton.tsx";
import { StepStatusPill } from "./StepStatusPill.tsx";
import type { StepStatus } from "./StepStatusPill.tsx";

/**
 * A step's or run's failure, already normalised by the HOST from the workflow
 * spec's `StepError` (`code`/`message`/`phase`/`retryable`). The panel never
 * parses an `unknown` error itself — same "host owns the data" split as the
 * rest of this file. Rendered in `TriggerFillForm`'s error visual: a
 * `.w6w-result.w6w-error` box, an optional `<code>` badge line, then the message.
 */
export interface ExecutionLogError {
  /** `StepError.code`. Optional: the host may normalise an error that carries no code. */
  code?: string;
  /** The human-readable reason. Never empty when the host supplies it. */
  message: string;
  /** `StepError.phase`, when known. Carried for the host; not rendered. */
  phase?: string;
  /** `StepError.retryable`, when known. Carried for the host; not rendered. */
  retryable?: boolean;
}

/**
 * One entry of `RunState.stepErrors` — a step failure the run recorded and
 * moved past (`onError: "continue-record"`, or a failure an error edge
 * handled), so the run itself may still have succeeded.
 */
export interface ExecutionLogRecordedError {
  /** The step the error belongs to. */
  stepId: string;
  /** Human-readable step name. Falls back to `stepId` when rendered. */
  label?: string;
  error: ExecutionLogError;
}

/**
 * One step's display row — an already-mapped, already-resolved slice of a
 * `RunState`/`StepExecution` (workflow spec). The HOST maps its own run
 * state into this shape (same "host owns the data, the panel is
 * presentational" split `readOnly` already establishes elsewhere in this
 * package) — this component never fetches, polls, or reaches for an SDK.
 */
export interface ExecutionLogStep {
  /** Stable id for this row — typically the step id from the workflow definition. */
  id: string;
  /** Human-readable step name. Falls back to `id` when omitted. */
  label?: string;
  status: StepStatus;
  /** ISO-8601 timestamp the step started, once it has. */
  startedAt?: string;
  /** ISO-8601 timestamp the step finished, once it has. */
  finishedAt?: string;
  /** The resolved input sent to the step's action, once it is known. */
  input?: unknown;
  /** The step's output, once it has one. */
  output?: unknown;
  /**
   * Why the step failed (`StepExecution.error`, "present on failed"). Rendered
   * below the row's box and outside its lazy `<details>` body, so the reason
   * reads without expanding the row.
   */
  error?: ExecutionLogError;
}

export interface ExecutionLogPanelProps {
  /** The run's steps, rendered in exactly this order — never re-sorted. */
  steps: ExecutionLogStep[];
  /** Shown instead of the list when `steps` is empty. */
  emptyLabel?: ReactNode;
  /**
   * Supplied ⇒ the panel grows a header row carrying a dismiss control that
   * calls this and nothing else (T1.1.1). Omitted ⇒ no header row at all, no
   * extra DOM node. The panel still owns no run state — it only reports the
   * click; the host decides what dismissing means.
   */
  onDismiss?: () => void;
  /**
   * The run's own failure (`RunState.error`). Rendered below the dismiss head
   * and above the steps — in the empty branch too, since a run that failed
   * before any step ran has nothing else to say why.
   */
  runError?: ExecutionLogError;
  /**
   * Step failures the run recorded and moved past (`RunState.stepErrors`),
   * one error block each, in the order given, after `runError`.
   */
  stepErrors?: ExecutionLogRecordedError[];
}

/**
 * Read-only log of a workflow run's steps, in the order given: each row is
 * the step's status pill, its timing, and its resolved input/output.
 *
 * A pure display leaf — no data fetching, no polling, no layout media
 * queries (the host docks the panel; see `_scale.scss`'s breakpoint
 * docstring). Fills whatever box its host gives it.
 */
export function ExecutionLogPanel({
  steps,
  emptyLabel,
  onDismiss,
  runError,
  stepErrors,
}: ExecutionLogPanelProps) {
  // Rendered by BOTH branches below, deliberately: the reported repro (T-1) is
  // a canvas whose log panel shows "No steps have run yet." — a header mounted
  // only above the `<ol>` would be invisible in exactly that state, and that is
  // the state the dismiss control exists to get the user out of.
  const head = onDismiss ? (
    <div className="w6w-execution-log-head">
      <IconButton label="Dismiss run log" data-testid="execution-log-dismiss" onClick={onDismiss}>
        ×
      </IconButton>
    </div>
  ) : null;

  // Same both-branches rule as `head`: a run that failed before its first step
  // is exactly the empty branch. Nothing to report ⇒ no wrapper node at all.
  const recorded = stepErrors ?? [];
  const errors =
    runError || recorded.length > 0 ? (
      <div className="w6w-execution-log-errors w6w-stack">
        {runError && <ExecutionLogErrorBlock error={runError} />}
        {recorded.map((entry, index) => (
          <ExecutionLogErrorBlock
            // `stepId` alone may repeat (a step retried into the record twice).
            key={`${entry.stepId}:${index}`}
            label={entry.label ?? entry.stepId}
            error={entry.error}
          />
        ))}
      </div>
    ) : null;

  if (steps.length === 0) {
    return (
      <>
        {head}
        {errors}
        <div className="w6w-execution-log-empty">
          <p className="w6w-muted w6w-small">{emptyLabel ?? "No steps have run yet."}</p>
        </div>
      </>
    );
  }

  return (
    <>
      {head}
      {errors}
      <ol className="w6w-execution-log">
        {steps.map((step) => (
          <ExecutionLogRow key={step.id} step={step} />
        ))}
      </ol>
    </>
  );
}

/**
 * Collapsed-by-default disclosure per step (REVIEW.md R-1) — reuses
 * `.w6w-section`'s bordered `<details>` idiom (`ApiCallsPanel.tsx`,
 * `ParamsForm.tsx`'s `section: "collapsible"`), not a bespoke card. The
 * `<summary>` is the one-line scan line (pill + label + timing, unchanged
 * content from the old always-visible row header); Input/Output move inside
 * the details body, and are only mounted into the DOM once opened — a
 * closed run of N steps costs N compact rows, not N×2 rendered JSON blocks.
 *
 * A step with neither `input` nor `output` has nothing to disclose: it
 * renders a plain, non-interactive row (still `.w6w-section`-styled for
 * visual consistency with its siblings) rather than an empty `<details>` a
 * user opens only to find "Not available." twice (A3). An `error` alone is
 * not something to disclose either: it renders on every row as a sibling
 * AFTER the row's box — outside the lazily mounted `<details>` body (so it
 * reads while collapsed and never mounts twice once opened) and outside the
 * `<summary>` (whose phrasing-content model and click-to-toggle make it the
 * wrong home for a selectable block of text).
 */
function ExecutionLogRow({ step }: { step: ExecutionLogStep }) {
  const [open, setOpen] = useState(false);
  const header = (
    <div className="w6w-execution-log-row-header">
      <StepStatusPill state={step.status} />
      <span className="w6w-execution-log-row-label">{step.label ?? step.id}</span>
      <StepTiming startedAt={step.startedAt} finishedAt={step.finishedAt} />
    </div>
  );

  const error = step.error ? <ExecutionLogErrorBlock error={step.error} /> : null;

  if (step.input === undefined && step.output === undefined) {
    return (
      <li className="w6w-execution-log-row">
        <div className="w6w-section">{header}</div>
        {error}
      </li>
    );
  }

  return (
    <li className="w6w-execution-log-row">
      <details className="w6w-section" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="w6w-section-summary">{header}</summary>
        {open && (
          <div className="w6w-execution-log-row-body w6w-section-body w6w-stack">
            <ExecutionLogJson title="Input" value={step.input} />
            <ExecutionLogJson title="Output" value={step.output} />
          </div>
        )}
      </details>
      {error}
    </li>
  );
}

/**
 * `TriggerFillForm`'s StepError visual, reused rather than re-invented: the
 * `.w6w-result.w6w-error` box, an optional muted `<code>` line, then the
 * message. `label` (recorded step errors only) names the step on a line above.
 * The code line's spacing lives in `_execution-log.scss` as tokens instead of
 * `TriggerFillForm`'s inline style — same values (`0.75` opacity, a 4px gap).
 */
function ExecutionLogErrorBlock({ error, label }: { error: ExecutionLogError; label?: string }) {
  return (
    <div className="w6w-result w6w-error">
      {label !== undefined && <strong className="w6w-execution-log-error-label">{label}</strong>}
      {error.code && (
        <div className="w6w-small w6w-execution-log-error-code">
          <code>{error.code}</code>
        </div>
      )}
      {error.message}
    </div>
  );
}

/**
 * "started / finished, or elapsed" (A2): both timestamps render verbatim
 * plus the computed elapsed duration between them; only `startedAt` renders
 * as "Started <ts>"; neither renders as a plain dash. Never a live-ticking
 * clock — a `setInterval` would make this component a timer owner rather
 * than a pure function of its props.
 */
function StepTiming({ startedAt, finishedAt }: { startedAt?: string; finishedAt?: string }) {
  if (startedAt && finishedAt) {
    const elapsed = formatElapsed(startedAt, finishedAt);
    return (
      <span className="w6w-execution-log-timing">
        {startedAt} → {finishedAt}
        {elapsed && <span> ({elapsed})</span>}
      </span>
    );
  }
  if (startedAt) {
    return <span className="w6w-execution-log-timing">Started {startedAt}</span>;
  }
  return <span className="w6w-execution-log-timing">—</span>;
}

function formatElapsed(startedAt: string, finishedAt: string): string | null {
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(finishedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  const ms = endMs - startMs;
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

/**
 * Input/output as read-only, syntax-highlighted JSON — `CodeBlock`, not
 * `JsonEditor`: per `CodeBlock.tsx`'s own doc comment, `JsonEditor` mounts a
 * CodeMirror instance to *edit* text, "heavy and semantically wrong for a
 * snippet nobody types into" — exactly this row's read-only value, rendered
 * potentially many times over a whole run. `ResolvedParams.tsx` doesn't fit
 * either: it renders a *schema* (`ActionParam[]`) against resolved values,
 * and this panel has no param schema, only the already-resolved input/output
 * values themselves (see the file header's "host maps `RunState`" note).
 * Never a plain `<pre>` dump: `CodeBlock` is this library's own read-only
 * structured-code idiom (highlighting, copy affordance, `--w6w-code-*`
 * tokens), the thing `<pre>` is not.
 */
function ExecutionLogJson({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="w6w-execution-log-json w6w-stack">
      <strong className="w6w-small">{title}</strong>
      {value === undefined ? (
        <p className="w6w-muted w6w-small">Not available.</p>
      ) : (
        <CodeBlock code={JSON.stringify(value, null, 2)} language="json" />
      )}
    </div>
  );
}
