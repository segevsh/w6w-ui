import type { Edge } from "@xyflow/react";
/**
 * Pure loop-problem detectors and their one-click fixes (D-A2). Host-called:
 * the embed host runs `findLoopProblems` on the definition it hands the canvas
 * and passes the result as `stepProblems`; the editor renders the fix buttons
 * and calls `applyStepProblemFix` only from a click.
 *
 * Grammar: strings go through `parseRootAnchoredTemplate` / `serializeTemplate`
 * and path markers through `isDollarPath` — never a regex over raw text. Body
 * membership comes from `definitionLoops` alone (the one place that knows the
 * legacy-chain rule). Not flagged in v1: JSONLogic `$expr` `var` refs and `expr`
 * parts such as `{{ a || "x" }}`.
 */
import { parseRootAnchoredTemplate, serializeTemplate } from "./components/expression-template.ts";
import {
  type LoopRefusalReason,
  definitionLoops,
  isForeachStep,
  loopMembership,
  loopRefusal,
} from "./flow-loop.ts";
import {
  type CanvasLane,
  type FlowStep,
  type FlowWorkflowInput,
  laneForSourceHandle,
} from "./flow-types.ts";
import { type StepNode, normalizeInput } from "./flow-utils.ts";
import { isDollarPath } from "./resolve-params.ts";
import type { StepProblem, StepProblems } from "./step-problems.ts";

const ROOTS = ["nodes", "steps"] as const;

/**
 * THE matcher: is `ref` a reference to foreach `foreachId`'s output, and what
 * does it become inside the loop. `R.F.output` → `foreach.item`, `R.F.output.<rest>`
 * → `foreach.item.<rest>`, `R.F.output[<rest>` → `foreach.item[<rest>`. Segment
 * boundary only: `…outputs` and `for_each_10` never match.
 */
export function loopOutputRef(ref: string, foreachId: string): string | null {
  for (const root of ROOTS) {
    const prefix = `${root}.${foreachId}.output`;
    if (!ref.startsWith(prefix)) continue;
    const rest = ref.slice(prefix.length);
    if (rest === "" || rest[0] === "." || rest[0] === "[") return `foreach.item${rest}`;
  }
  return null;
}

/**
 * Walk `v` depth-first (key order, then index order), rewriting every matching ref
 * and pushing each distinct matched ref string onto `refs`. Returns the SAME
 * reference when nothing matched (structure-shared otherwise). Never mutates.
 */
function rewrite(v: unknown, foreachId: string, refs: string[]): unknown {
  if (typeof v === "string") {
    if (!v.includes("{{")) return v;
    const parts = parseRootAnchoredTemplate(v);
    let hit = false;
    const next = parts.map((p) => {
      if (p.kind !== "var" || p.ref === undefined) return p;
      const to = loopOutputRef(p.ref, foreachId);
      if (to === null) return p;
      hit = true;
      if (!refs.includes(p.ref)) refs.push(p.ref);
      return { ...p, ref: to };
    });
    return hit ? serializeTemplate(next) : v;
  }
  if (isDollarPath(v)) {
    const path = v.$;
    if (typeof path !== "string") return v;
    const to = loopOutputRef(path, foreachId);
    if (to === null) return v;
    if (!refs.includes(path)) refs.push(path);
    return { $: to };
  }
  if (Array.isArray(v)) {
    let changed = false;
    const out = v.map((el) => {
      const n = rewrite(el, foreachId, refs);
      if (n !== el) changed = true;
      return n;
    });
    return changed ? out : v;
  }
  if (typeof v === "object" && v !== null) {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, el] of Object.entries(v)) {
      const n = rewrite(el, foreachId, refs);
      if (n !== el) changed = true;
      out[k] = n;
    }
    return changed ? out : v;
  }
  return v;
}

/** A whole-value ref: a string that parses to exactly one `var` part, or `{ "$": string }`. */
function isWholeRef(v: unknown): boolean {
  if (typeof v === "string") {
    if (!v.includes("{{")) return false;
    const parts = parseRootAnchoredTemplate(v);
    return parts.length === 1 && parts[0].kind === "var";
  }
  return isDollarPath(v) && typeof v.$ === "string";
}

/** `items` is a list of exactly one whole-value ref — it loops once over a list of one list. */
function isWrappedItems(items: unknown): items is unknown[] {
  return Array.isArray(items) && items.length === 1 && isWholeRef(items[0]);
}

/**
 * The loop problems of a stored definition, keyed by step id. Never throws and
 * never mutates: any input `workflowToFlow` would reject gives `{}` (it runs in a
 * host memo with no error boundary).
 */
export function findLoopProblems(input: FlowWorkflowInput): StepProblems {
  try {
    const wf = normalizeInput(input);
    if (!Array.isArray(wf.nodes)) return {};
    const out: StepProblems = {};
    const add = (id: string, p: StepProblem) => {
      const list = Object.hasOwn(out, id) ? out[id] : [];
      list.push(p);
      out[id] = list;
    };
    const byId = new Map(wf.nodes.map((s) => [s.id, s]));
    for (const [fid, loop] of Object.entries(definitionLoops(wf))) {
      const f = byId.get(fid);
      if (f && isWrappedItems(f.with?.items)) {
        add(fid, {
          code: "foreach_wrapped_items",
          fix: { kind: "unwrap_items", label: "Unwrap Items" },
        });
      }
      if ("invalid" in loop) {
        add(fid, { code: "loop_body_invalid", reason: { ...loop.invalid } });
        continue;
      }
      for (const id of loop.body) {
        const step = byId.get(id);
        if (!step?.with) continue;
        const refs: string[] = [];
        rewrite(step.with, fid, refs);
        if (refs.length > 0) {
          add(id, {
            code: "foreach_body_refs_output",
            foreachId: fid,
            refs,
            fix: { kind: "use_current_item", foreachId: fid, label: "Use Current item" },
          });
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Apply a problem's fix to `step`, returning a new step. Re-scans the step it is
 * given (never trusts the problem's `refs` snapshot); the SAME reference comes
 * back for a problem with no fix or nothing left to fix. Never mutates.
 */
export function applyStepProblemFix(step: FlowStep, problem: StepProblem): FlowStep {
  if (problem.code === "foreach_wrapped_items") {
    const items = step.with?.items;
    if (!step.with || !isWrappedItems(items)) return step;
    return { ...step, with: { ...step.with, items: items[0] } };
  }
  if (problem.code === "foreach_body_refs_output") {
    if (!step.with) return step;
    const next = rewrite(step.with, problem.foreachId, []);
    if (next === step.with) return step;
    return { ...step, with: next as Record<string, unknown> };
  }
  return step;
}

/**
 * The lane of a drag, read from the handle the pointer went down on. xyflow's
 * `connectionState.fromHandle` resolves an id-less handle (the Done port) to the
 * node's FIRST handle (`out-each`), so it cannot tell Done from Each item;
 * `onConnectStart` reports the real `handleId` (null for Done). Falls back to
 * `fromHandle.id` when no matching start was recorded.
 */
export function dragLane(
  start: { nodeId: string | null; handleId: string | null; handleType: string | null } | null,
  fromNodeId: string,
  fromHandle: { id?: string | null; type?: string } | null | undefined,
): CanvasLane {
  if (start && start.nodeId === fromNodeId && start.handleType === (fromHandle?.type ?? "source")) {
    return laneForSourceHandle(start.handleId);
  }
  return laneForSourceHandle(fromHandle?.id);
}

/**
 * The loop reason a source-handle drag dropped ON an existing node is refused for
 * (`null` when the loop rule has nothing to say). `onConnectEnd` shows it as the
 * node-anchored notice instead of opening the step builder. The lane is promoted the
 * way `planConnect` does: a success drag from a body node extends the body.
 */
export function connectDropRefusal(
  source: string,
  target: string,
  lane: "success" | "error" | "each",
  nodes: StepNode[],
  edges: Edge[],
): LoopRefusalReason | null {
  const srcStep = nodes.find((n) => n.id === source)?.data.step;
  const inBody = loopMembership(nodes, edges)[source] !== undefined;
  const effLane = lane === "success" && inBody ? "each" : lane;
  if (effLane === "each" && !inBody && !isForeachStep(srcStep)) return null;
  return loopRefusal(source, target, effLane, nodes, edges);
}
