/**
 * The pure loop core: the canvas-only `each` lane, body derivation, and the
 * lifecycle helpers that keep a For each's `with.body` consistent.
 *
 * ## The model
 *
 * On the canvas a loop body is a chain of **each-lane** edges (`data.when:
 * "each"`) leaving the For each, `F → b0 → b1 → …`. The lane is **never
 * serialized**: {@link loopBodies} derives `with.body` from those edges on every
 * save and a stored `body` is never trusted. On load the body is drawn back as
 * each-lane edges ({@link definitionLoops} decides what a definition's loops are).
 *
 * Mirrors the engine's `plan.ts`: `controlOwnedIds` (foreach `body`, parallel
 * `branches`, if `then`/`else`), the "claimed by more than one control" check, and
 * the implicit chain restricted to main-graph steps. Any edge touching an owned
 * step is a PlanError there — so nothing here ever lets one be emitted.
 *
 * Internal to `@w6w/ui`: NOT re-exported from `flow.ts`/`index.ts` (T2.3.2 adds
 * what it needs). Keep this file JSX-free.
 */
import type { Edge } from "@xyflow/react";
import { edgeLane } from "./flow-connect.ts";
import {
  CONTROL_APP,
  EACH_SOURCE_HANDLE,
  type FlowEdge,
  type FlowStep,
  type FlowWorkflow,
  edgeVisuals,
  isControlApp,
} from "./flow-types.ts";
import { type StepNode, flowEdgeId } from "./flow-utils.ts";

type UsesLike = { uses?: { app?: string; action?: string } };

/** A step is a foreach iff it is `@w6w/control` · `foreach` (P1). */
export function isForeachStep(step: UsesLike | undefined): boolean {
  return step?.uses?.app === CONTROL_APP && step.uses.action === "foreach";
}

function isControlStep(step: UsesLike | undefined): boolean {
  return step?.uses?.app === CONTROL_APP;
}

/**
 * The step ids a control step owns — engine `controlOwnedIds`, arm for arm
 * (foreach `body`, parallel `branches`, if `then`/`else`; strings at any array depth).
 */
export function controlOwnedIds(step: FlowStep): string[] {
  if (!isControlStep(step)) return [];
  const w = step.with ?? {};
  const out: string[] = [];
  const collect = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) for (const el of v) collect(el);
  };
  collect(w.body);
  collect(w.branches);
  collect(w.then);
  collect(w.else);
  return out;
}

/** Every step id owned by some control step (engine `ownedByControl`). */
export function ownedStepIds(steps: readonly FlowStep[]): Set<string> {
  const owned = new Set<string>();
  for (const s of steps) for (const id of controlOwnedIds(s)) owned.add(id);
  return owned;
}

/** A canvas each-lane edge in the ONE shape load, bridge and `applyConnect` share (P3). */
export function eachLaneEdge(from: string, to: string, fromIsForeach: boolean): Edge {
  return {
    id: flowEdgeId(from, to, "each"),
    source: from,
    target: to,
    sourceHandle: fromIsForeach ? EACH_SOURCE_HANDLE : undefined,
    animated: false,
    data: { when: "each" },
    ...edgeVisuals("each", undefined),
  };
}

// ── Canvas side ────────────────────────────────────────────────────────────

/**
 * The body chain drawn from `foreachId`: follow each-lane out-edges (the first in
 * `edges` order, then the next). Ids in chain order, never including `foreachId`
 * or a repeat — so it terminates on a cycle. `claimed` (internal) stops the chain
 * BEFORE a step an earlier foreach already owns.
 */
export function loopBody(
  foreachId: string,
  nodes: readonly StepNode[],
  edges: readonly Edge[],
  claimed?: ReadonlySet<string>,
): string[] {
  const exists = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>([foreachId]);
  const chain: string[] = [];
  let cur = foreachId;
  for (;;) {
    const next = edges.find(
      (e) =>
        e.source === cur &&
        edgeLane(e) === "each" &&
        exists.has(e.target) &&
        !seen.has(e.target) &&
        !claimed?.has(e.target),
    );
    if (!next) return chain;
    seen.add(next.target);
    chain.push(next.target);
    cur = next.target;
  }
}

/** Every foreach's body, handled in `nodes` order so emitted bodies are disjoint (P6). */
export function loopBodies(
  nodes: readonly StepNode[],
  edges: readonly Edge[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const claimed = new Set<string>();
  for (const n of nodes) {
    if (!isForeachStep(n.data?.step)) continue;
    const chain = loopBody(n.id, nodes, edges, claimed);
    for (const id of chain) claimed.add(id);
    out.set(n.id, chain);
  }
  return out;
}

/** `bodyStepId → foreachId` over the whole canvas. */
export function loopMembership(
  nodes: readonly StepNode[],
  edges: readonly Edge[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [fid, chain] of loopBodies(nodes, edges)) for (const id of chain) out[id] = fid;
  return out;
}

/**
 * The edge set after deleting step `id` (D-A4). A mid-body step is bridged
 * (`prev → next`, each lane, `out-each` iff `prev` is the foreach); a last step
 * leaves no bridge; deleting the foreach also removes the each-lane edges of its
 * chain (the body steps stay, as ordinary unconnected nodes). A non-body step is
 * the plain incident-edge filter.
 */
export function bridgeDeletedBodyStep(
  id: string,
  nodes: readonly StepNode[],
  edges: readonly Edge[],
): Edge[] {
  const incident = (e: Edge) => e.source === id || e.target === id;
  const plain = edges.filter((e) => !incident(e));
  const stepOf = (nid: string) => nodes.find((n) => n.id === nid)?.data?.step;
  if (isForeachStep(stepOf(id))) {
    const chain = loopBody(id, nodes, edges);
    const links = new Set<string>();
    let prev = id;
    for (const b of chain) {
      links.add(`${prev}\u0000${b}`);
      prev = b;
    }
    return plain.filter(
      (e) => !(edgeLane(e) === "each" && links.has(`${e.source}\u0000${e.target}`)),
    );
  }
  const fid = loopMembership(nodes, edges)[id];
  if (fid === undefined) return plain;
  const chain = loopBody(fid, nodes, edges);
  const i = chain.indexOf(id);
  const prev = i <= 0 ? fid : chain[i - 1];
  const next = chain[i + 1];
  if (next === undefined) return plain;
  return [...plain, eachLaneEdge(prev, next, prev === fid)];
}

/** `with.body` is the derived view of the each lane — drop it from a foreach (P1); other steps untouched. */
export function stripBody<T extends UsesLike & { with?: Record<string, unknown> }>(step: T): T {
  if (!isForeachStep(step) || !step.with || !("body" in step.with)) return step;
  const { body: _body, ...rest } = step.with;
  return { ...step, with: rest };
}

// ── Connect-time refusal (T2.3.1) ──────────────────────────────────────────

/** Why a connection would break the v1 linear-body rule (exhaustive; see {@link loopRefusal}). */
export type LoopRefusalReason =
  | "error_lane_in_body"
  | "outside_inbound"
  | "loop_cycle"
  | "already_in_loop"
  | "control_in_body"
  | "body_branch"
  | "body_exit";

/**
 * The loop rule for drawing `source → target` in `lane` (already promoted: a success
 * connect from a body node arrives as `"each"`). First match wins. Pure; run on the
 * INPUT edges, never a post-eviction set.
 */
export function loopRefusal(
  source: string,
  target: string,
  lane: "success" | "error" | "each",
  nodes: StepNode[],
  edges: Edge[],
): LoopRefusalReason | null {
  const M = loopMembership(nodes, edges);
  if (lane === "error") {
    return M[source] !== undefined || M[target] !== undefined ? "error_lane_in_body" : null;
  }
  if (lane === "success") return M[target] !== undefined ? "outside_inbound" : null;
  const stepOf = (id: string) => nodes.find((n) => n.id === id)?.data?.step;
  const owner = isForeachStep(stepOf(source)) ? source : M[source];
  if (owner === undefined) return null;
  if (target === owner || M[target] === owner) return "loop_cycle";
  if (M[target] !== undefined) return "already_in_loop";
  const app = stepOf(target)?.uses?.app;
  if (app !== undefined && isControlApp(app)) return "control_in_body";
  if (edges.some((e) => e.source === source && edgeLane(e) === "each")) return "body_branch";
  if (edges.some((e) => e.source === target || e.target === target)) return "body_exit";
  return null;
}

/** The author-facing sentence for each refusal (shown in the node-anchored notice). */
const LOOP_REFUSAL_MESSAGES: Record<LoopRefusalReason, string> = {
  error_lane_in_body:
    "A step inside a loop can't have an error connection. Handle the failure outside the loop.",
  outside_inbound:
    "This step is inside a loop, so nothing outside it can connect into it. Connect from the loop's Each item side instead.",
  loop_cycle: "A loop body can't connect back to its own For each.",
  already_in_loop: "That step is already inside another loop.",
  control_in_body:
    "A loop body can only hold plain steps. If, For each, Parallel, Wait and similar steps can't go inside it yet.",
  body_branch:
    "A loop body is one straight line of steps. This step already continues to another step.",
  body_exit:
    "That step is already connected elsewhere in the workflow. Use a step with no connections, or disconnect it first.",
};

export function loopRefusalMessage(reason: LoopRefusalReason): string {
  return LOOP_REFUSAL_MESSAGES[reason];
}

/**
 * Set or clear `data.loopOf` from {@link loopMembership}. Same array reference when
 * nothing changed, and the same node object for every unchanged node.
 */
export function stampLoopOf(nodes: StepNode[], edges: Edge[]): StepNode[] {
  const M = loopMembership(nodes, edges);
  let changed = false;
  const out = nodes.map((n) => {
    const want = M[n.id];
    if (n.data.loopOf === want) return n;
    changed = true;
    if (want === undefined) {
      const { loopOf: _drop, ...data } = n.data;
      return { ...n, data };
    }
    return { ...n, data: { ...n.data, loopOf: want } };
  });
  return changed ? out : nodes;
}

/** The delete-confirm text. Byte-identical to the plain message unless a For each owns a body. */
export function deleteStepMessage(id: string, nodes: StepNode[], edges: Edge[]): string {
  const base = `Delete node "${id}"? Its connections are removed too.`;
  const step = nodes.find((n) => n.id === id)?.data?.step;
  if (!isForeachStep(step)) return base;
  const body = loopBody(id, nodes, edges);
  if (body.length === 0) return base;
  return `${base} Its loop body steps ${body.map((b) => `"${b}"`).join(", ")} stay as standalone steps.`;
}

// ── Definition side ────────────────────────────────────────────────────────

export type LoopInvalidReason =
  | "body_not_literal"
  | "body_unknown_step"
  | "body_self"
  | "body_duplicate"
  | "body_claimed_twice"
  | "body_contains_control"
  | "body_step_has_edges"
  | "legacy_not_linear";

export type LoopInvalid = { reason: LoopInvalidReason; stepId?: string };
export type LoopResult = { body: string[]; source: "body" | "legacy" } | { invalid: LoopInvalid };

/** The edges the engine would run: declared, else the implicit chain over main-graph (non-owned) steps. */
export function effectiveEdges(wf: FlowWorkflow): FlowEdge[] {
  if (wf.edges) return wf.edges;
  const owned = ownedStepIds(wf.nodes);
  const main = wf.nodes.filter((s) => !owned.has(s.id));
  const out: FlowEdge[] = [];
  for (let i = 0; i < main.length - 1; i++) out.push({ from: main[i].id, to: main[i + 1].id });
  return out;
}

const isSuccess = (e: FlowEdge) => (e.when ?? "success") === "success";

/**
 * What each foreach's loop is, in a stored definition — the ONE place that knows
 * the legacy-chain rule (D-A3). A foreach carrying a `body` key is judged on it;
 * one without is a legacy loop iff its success-lane successors form a valid linear
 * chain (every node a non-control step owned by no control, whose only inbound edge
 * is from its predecessor and whose only outbound edge is a success edge onward).
 */
export function definitionLoops(wf: FlowWorkflow): Record<string, LoopResult> {
  const byId = new Map(wf.nodes.map((s) => [s.id, s]));
  const owners = new Map<string, Set<string>>();
  for (const s of wf.nodes) {
    for (const sub of controlOwnedIds(s)) {
      const set = owners.get(sub) ?? new Set<string>();
      set.add(s.id);
      owners.set(sub, set);
    }
  }
  const edges = effectiveEdges(wf);
  const declared = wf.edges ?? [];
  const out: Record<string, LoopResult> = {};

  for (const f of wf.nodes) {
    if (!isForeachStep(f)) continue;
    const w = f.with ?? {};
    if ("body" in w) {
      out[f.id] = literalBody(f.id, w.body);
      continue;
    }
    out[f.id] = legacyBody(f.id);
  }
  return out;

  function literalBody(fid: string, body: unknown): LoopResult {
    const bad = (reason: LoopInvalidReason, stepId?: string): LoopResult => ({
      invalid: stepId === undefined ? { reason } : { reason, stepId },
    });
    if (!Array.isArray(body) || body.some((b) => typeof b !== "string")) {
      return bad("body_not_literal");
    }
    const ids = body as string[];
    const seen = new Set<string>();
    for (const id of ids) {
      if (!byId.has(id)) return bad("body_unknown_step", id);
      if (id === fid) return bad("body_self", id);
      if (seen.has(id)) return bad("body_duplicate", id);
      seen.add(id);
      if (isControlStep(byId.get(id))) return bad("body_contains_control", id);
      const own = owners.get(id);
      if (own && [...own].some((o) => o !== fid)) return bad("body_claimed_twice", id);
      if (declared.some((e) => e.from === id || e.to === id)) return bad("body_step_has_edges", id);
    }
    return { body: ids, source: "body" };
  }

  function legacyBody(fid: string): LoopResult {
    const succ = edges.filter((e) => e.from === fid && isSuccess(e));
    if (succ.length === 0) return { body: [], source: "body" };
    const bad = (stepId: string): LoopResult => ({
      invalid: { reason: "legacy_not_linear", stepId },
    });
    if (succ.length > 1) return bad(fid);
    const chain: string[] = [];
    const seen = new Set<string>([fid]);
    let prev = fid;
    let next: string | undefined = succ[0].to;
    while (next !== undefined) {
      const n: string = next;
      const step = byId.get(n);
      if (!step || seen.has(n) || isControlStep(step) || owners.has(n)) return bad(n);
      const inbound = edges.filter((e) => e.to === n);
      if (inbound.length !== 1 || inbound[0].from !== prev) return bad(n);
      const outbound = edges.filter((e) => e.from === n);
      if (outbound.length > 1 || (outbound.length === 1 && !isSuccess(outbound[0]))) return bad(n);
      seen.add(n);
      chain.push(n);
      prev = n;
      next = outbound[0]?.to;
    }
    return { body: chain, source: "legacy" };
  }
}
