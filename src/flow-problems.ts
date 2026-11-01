import { effectiveStateConfig, statePathsOverlap, staticWritePaths } from "@w6w/expr";
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
  controlOwnedIds,
  definitionLoops,
  effectiveEdges,
  isEachLink,
  isForeachStep,
  loopMembership,
  loopRefusal,
} from "./flow-loop.ts";
import {
  CONTROL_APP,
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

/** One editor-side parallel-write warning — the engine's `StateWriteWarning`, this code only. */
export interface StateParallelWrite {
  code: "state_parallel_write";
  nodes: string[];
  path: string[];
}

/** The ids inside one `@w6w/control` `parallel` branch (strings at any array depth). */
function branchIds(branch: unknown): Set<string> {
  const out = new Set<string>();
  const collect = (v: unknown) => {
    if (typeof v === "string") out.add(v);
    else if (Array.isArray(v)) for (const el of v) collect(el);
  };
  collect(branch);
  return out;
}

/**
 * The editor mirror of the engine's plan-time parallel-write warning (R16, plan
 * §2.3; proven equal on `core/packages/expr/tests/fixtures/state-write-conflicts.json`).
 * Two writers are concurrent iff they sit in different branches of one
 * `@w6w/control` `parallel`; else never when they share an anchor (outermost
 * owning control, else the step) or one anchor reaches the other; else iff one
 * `fanOut: "parallel"` step has two distinct outgoing edges in the SAME lane
 * whose targets reach the two anchors. Each overlapping pair of static write
 * paths gives one warning on the shorter path; deduped, sorted by the engine's
 * order (`code`, then `nodes`, then `path`). Never throws (→ `[]`), never mutates.
 */
export function stateWriteConflicts(input: FlowWorkflowInput): StateParallelWrite[] {
  try {
    const wf = normalizeInput(input);
    if (!Array.isArray(wf.nodes)) return [];
    const steps = wf.nodes.filter(
      (s): s is FlowStep => typeof s === "object" && s !== null && typeof s.id === "string",
    );
    const edges = effectiveEdges({ ...wf, nodes: steps }).filter(
      (e) => typeof e?.from === "string" && typeof e?.to === "string",
    );

    // Writers and their static paths, in node order.
    const writers: Array<{ id: string; paths: string[][] }> = [];
    for (const s of steps) {
      try {
        const paths = staticWritePaths(effectiveStateConfig(s.uses?.app, s.uses?.action, s.state));
        if (paths.length > 0) writers.push({ id: s.id, paths });
      } catch {
        // An unreadable `state` writes nothing statically; the save route reports it.
      }
    }
    if (writers.length < 2) return [];

    // Owner (direct owning control) and anchor (outermost owning control, else self).
    const owner = new Map<string, string>();
    for (const s of steps) {
      for (const id of controlOwnedIds(s)) if (!owner.has(id)) owner.set(id, s.id);
    }
    const chain = (id: string): string[] => {
      const out = [id];
      let cur = id;
      while (owner.has(cur)) {
        cur = owner.get(cur) as string;
        if (out.includes(cur)) break;
        out.push(cur);
      }
      return out;
    };
    const anchor = (id: string): string => {
      const c = chain(id);
      return c[c.length - 1];
    };

    // Reachability over every edge (all lanes, each-links included), non-reflexive.
    const succ = new Map<string, string[]>();
    for (const e of edges) {
      const list = succ.get(e.from) ?? [];
      list.push(e.to);
      succ.set(e.from, list);
    }
    const reachCache = new Map<string, Set<string>>();
    const reach = (from: string): Set<string> => {
      const hit = reachCache.get(from);
      if (hit) return hit;
      const seen = new Set<string>();
      const stack = [...(succ.get(from) ?? [])];
      while (stack.length > 0) {
        const n = stack.pop() as string;
        if (seen.has(n)) continue;
        seen.add(n);
        for (const m of succ.get(n) ?? []) stack.push(m);
      }
      reachCache.set(from, seen);
      return seen;
    };
    const reachesRefl = (from: string, to: string) => from === to || reach(from).has(to);

    // (i) `@w6w/control` parallel branches.
    const parallels = steps
      .filter((s) => s.uses?.app === CONTROL_APP && s.uses.action === "parallel")
      .map((s) => {
        const branches = s.with?.branches;
        return Array.isArray(branches) ? branches.map(branchIds) : [];
      });
    const branchOf = (branches: Set<string>[], id: string): number => {
      for (const c of chain(id)) {
        const i = branches.findIndex((b) => b.has(c));
        if (i >= 0) return i;
      }
      return -1;
    };

    // (iv) fan-out points: per parallel step, its same-lane outgoing edge groups.
    const fanGroups: string[][] = [];
    for (const s of steps) {
      if (s.fanOut !== "parallel") continue;
      const lanes = new Map<string, string[]>();
      for (const e of edges) {
        if (e.from !== s.id || isEachLink(e)) continue;
        const lane = e.when ?? "success";
        const list = lanes.get(lane) ?? [];
        list.push(e.to);
        lanes.set(lane, list);
      }
      for (const targets of lanes.values()) if (targets.length >= 2) fanGroups.push(targets);
    }

    const concurrent = (a: string, b: string): boolean => {
      for (const branches of parallels) {
        const ia = branchOf(branches, a);
        const ib = branchOf(branches, b);
        if (ia >= 0 && ib >= 0 && ia !== ib) return true;
      }
      const aa = anchor(a);
      const ab = anchor(b);
      if (aa === ab || reach(aa).has(ab) || reach(ab).has(aa)) return false;
      return fanGroups.some((targets) =>
        targets.some((ta, i) =>
          targets.some((tb, j) => i !== j && reachesRefl(ta, aa) && reachesRefl(tb, ab)),
        ),
      );
    };

    const seen = new Set<string>();
    const out: StateParallelWrite[] = [];
    for (let i = 0; i < writers.length; i++) {
      for (let j = i + 1; j < writers.length; j++) {
        const A = writers[i];
        const B = writers[j];
        if (A.id === B.id || !concurrent(A.id, B.id)) continue;
        for (const pa of A.paths) {
          for (const pb of B.paths) {
            if (!statePathsOverlap(pa, pb)) continue;
            const w: StateParallelWrite = {
              code: "state_parallel_write",
              nodes: [A.id, B.id].sort(),
              path: [...(pa.length <= pb.length ? pa : pb)],
            };
            const key = JSON.stringify([w.nodes, w.path]);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(w);
          }
        }
      }
    }
    const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
    return out.sort(
      (x, y) =>
        cmp(x.code, y.code) ||
        cmp(x.nodes.join(","), y.nodes.join(",")) ||
        cmp(x.path.join("."), y.path.join(".")),
    );
  } catch {
    return [];
  }
}

/**
 * `stateWriteConflicts` as canvas problems: each warning lands on both of its
 * steps, naming the other one (`with`). Never throws (→ `{}`), never mutates.
 */
export function findStateWriteProblems(input: FlowWorkflowInput): StepProblems {
  try {
    const out: StepProblems = {};
    for (const w of stateWriteConflicts(input)) {
      for (const n of w.nodes) {
        const list = Object.hasOwn(out, n) ? out[n] : [];
        list.push({ code: w.code, path: [...w.path], with: w.nodes.filter((x) => x !== n) });
        out[n] = list;
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
