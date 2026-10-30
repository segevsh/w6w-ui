/**
 * Host-supplied per-step problems painted on the canvas. Pure — no React or
 * @xyflow imports. The host owns detection (connection problems from the host's
 * own lookup, loop problems from `findLoopProblems` in `@w6w/ui/flow`); the
 * canvas only paints what it is given and offers each problem's one-click fix.
 */
import type { LoopInvalid } from "./flow-loop.ts";

/** A one-click fix: pure data, applied by `applyStepProblemFix` on the author's click. */
export type StepProblemFix =
  | { kind: "unwrap_items"; label: "Unwrap Items" }
  | { kind: "use_current_item"; foreachId: string; label: "Use Current item" };

export type StepProblem =
  | { code: "unknown_connection"; connection: string }
  | { code: "foreach_wrapped_items"; fix: StepProblemFix }
  | { code: "foreach_body_refs_output"; foreachId: string; refs: string[]; fix: StepProblemFix }
  | { code: "loop_body_invalid"; reason: LoopInvalid };

/** Keyed by step id; a step carries every problem it has (D-B1). */
export type StepProblems = Record<string, StepProblem[]>;

interface ProblemNode {
  id: string;
  data: { stepProblems?: StepProblem[] };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/**
 * Stamp `data.stepProblems` from `problems`, clearing it for steps no longer in
 * the map (or mapped to `[]`). Returns the SAME node object when the incoming
 * list deep-equals the stamped one.
 */
export function applyStepProblems<N extends ProblemNode>(
  nodes: N[],
  problems: StepProblems | undefined,
): N[] {
  return nodes.map((n) => {
    const next = problems?.[n.id];
    const cur = n.data.stepProblems;
    if (next === undefined || next.length === 0) {
      if (cur === undefined && !("stepProblems" in n.data)) return n;
      const { stepProblems: _drop, ...rest } = n.data;
      return { ...n, data: rest } as N;
    }
    if (cur && deepEqual(cur, next)) return n;
    return { ...n, data: { ...n.data, stepProblems: structuredClone(next) } };
  });
}

const INVALID_LOOP_TEXT: Record<LoopInvalid["reason"], string> = {
  body_not_literal: "This loop's body is not a list of step ids",
  body_unknown_step: "This loop's body names a step that doesn't exist",
  body_self: "This loop's body contains the For each itself",
  body_duplicate: "This loop's body lists a step twice",
  body_claimed_twice: "A step in this loop's body is also owned by another control step",
  body_contains_control: "This loop's body contains a control step (If, For each, Parallel…)",
  body_step_has_edges: "A step in this loop's body also has its own connections",
  legacy_not_linear:
    "The steps after this For each aren't one straight line, so they can't be read as its loop body",
};

export function stepProblemTooltip(p: StepProblem): string {
  switch (p.code) {
    case "unknown_connection":
      return `Connection ${p.connection} no longer exists — open the step and choose another on the Setup tab`;
    case "foreach_wrapped_items":
      return "Items wraps a list in another list — this loops once";
    case "foreach_body_refs_output":
      return `Refers to the For each's output (${p.refs.join(", ")}) from inside its loop — use Current item instead`;
    case "loop_body_invalid": {
      const text = INVALID_LOOP_TEXT[p.reason.reason] ?? "This loop's body is not valid";
      return p.reason.stepId ? `${text} (${p.reason.stepId})` : text;
    }
  }
}

/** True while the step still points at a connection the host reports missing (any entry). */
export function isConnectionBlocked(
  step: { uses: { connection?: string | null } },
  problems: StepProblem[] | undefined,
): boolean {
  return (
    problems?.some(
      (p) => p.code === "unknown_connection" && step.uses.connection === p.connection,
    ) ?? false
  );
}

/** The Setup tab's Connection button label — exactly five outcomes. */
export function connectionButtonLabel(
  connection: string | undefined | null,
  conns: { id: string; displayName?: string }[] | null,
  failed: boolean,
): string {
  if (!connection) return "No connection";
  if (failed) return "Couldn't load connections";
  if (conns === null) return connection;
  const found = conns.find((c) => c.id === connection);
  if (found) return found.displayName ?? connection;
  return "Missing connection — choose another";
}
