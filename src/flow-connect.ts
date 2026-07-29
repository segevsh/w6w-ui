/**
 * Connection rules for the flow canvas: which edges may be drawn, what the edge
 * set becomes once one is, and how edge ids are rewritten when a step is renamed.
 *
 * These are total, pure functions of `(source, target, nodes, edges)` and they
 * live in a **`.ts`** module on purpose. They used to sit inside
 * `WorkflowFlowEditor.tsx`, where Node's type-stripping test runner cannot reach
 * them (it cannot parse JSX), so the exit-port capacity rule — the highest-risk
 * decision in the editor's wiring — was covered only by inspection. Here it is
 * covered by `flow-connect.test.ts` (`node --test`, no new dependency). Keep this
 * file JSX-free.
 *
 * Internal to `@w6w/ui`: imported by relative path, deliberately NOT re-exported
 * from `index.ts` / `flow.ts`.
 */
import { type Edge, addEdge } from "@xyflow/react";
import { nodePortsForStep } from "./flow-types.ts";
import { type StepNode, flowEdgeId } from "./flow-utils.ts";

/**
 * Which lane a React Flow edge belongs to (core `rfcs/workflow.md` · `Edge.when`
 * amendment). **Omitted ⇒ `"success"`**, and read defensively: an edge that
 * predates the `data.when` stamp — or one React Flow synthesised — may carry no
 * `data` at all. The single accessor: every consumer calls this rather than
 * re-deriving the fallback, so "absent means success" is decided once.
 */
export function edgeLane(e: Edge): "success" | "error" {
  return (e.data as { when?: string } | undefined)?.when === "error" ? "error" : "success";
}

/**
 * The hard rules for an edge `source → target` — the ones no amount of
 * replacement can satisfy: a real, *distinct* pair (no self-loops), no duplicate
 * edge, the target accepts an entry port (blocks connecting *into* a trigger,
 * which declares `in: 0`), and the source has an exit port. Port **capacity** is
 * deliberately NOT checked here: a full single-slot port is freed by replacement
 * (see `applyConnect`), so dragging a new wire from an already-connected node
 * re-points it rather than being rejected. Used as the live `isValidConnection`.
 *
 * The duplicate-pair check is **lane-blind by design**, and that is a v1 *editor*
 * limit, not a model limit: the model permits a success edge and an error edge
 * between the same two steps (D-T1-8 widened the engine's `skippedEdges` key so
 * they cannot collide), but v1 declines to author that pair because there are no
 * id'd source handles to pick the lane from (D-T1-7).
 */
export function canConnect(
  source: string | null | undefined,
  target: string | null | undefined,
  nodes: StepNode[],
  edges: Edge[],
): boolean {
  if (!source || !target || source === target) return false;
  if (edges.some((e) => e.source === source && e.target === target)) return false;
  const srcStep = nodes.find((n) => n.id === source)?.data.step;
  const tgtStep = nodes.find((n) => n.id === target)?.data.step;
  if (!srcStep || !tgtStep) return false;
  // Per-step ports (T2.3.1): a persisted `ports.in > 1` lets multiple edges land.
  const srcPorts = nodePortsForStep(srcStep);
  const tgtPorts = nodePortsForStep(tgtStep);
  return srcPorts.out >= 1 && tgtPorts.in >= 1;
}

/**
 * Build the next edge set for a new `source → target` connection, **replacing**
 * whatever already occupied the source's exit or the target's entry so
 * single-slot ports stay at exactly one connection. Drops the oldest conflicting
 * edge(s) to make room, then appends the new one. Returns `null` when the
 * connection is disallowed by {@link canConnect}.
 *
 * The source's exit capacity is **per lane** (T3.2.2): success edges compete only
 * with success edges, error edges only with error edges. So an ordinary `out: 1`
 * step keeps the deliberate "a second drag re-points the wire" UX *within* a lane,
 * while additionally being able to hold one error edge — which is what makes a
 * `send → (error) → fallback` shape authorable at all. No `ports.out` bump is
 * needed, so every persisted definition and palette entry stays valid.
 *
 * The target's entry capacity stays **lane-blind**, and that asymmetry is the
 * point: a converging tail step receiving one success and one error edge is
 * governed by `ports.in` alone. Partitioning the target rule by lane too — the
 * plausible "symmetry" cleanup — would let a `ports.in: 1` node silently accept
 * two inbound edges.
 */
export function applyConnect(
  source: string | null | undefined,
  target: string | null | undefined,
  nodes: StepNode[],
  edges: Edge[],
  when: "success" | "error" = "success",
): Edge[] | null {
  if (!canConnect(source, target, nodes, edges) || !source || !target) return null;
  const srcStep = nodes.find((n) => n.id === source)?.data.step;
  const tgtStep = nodes.find((n) => n.id === target)?.data.step;
  if (!srcStep || !tgtStep) return null;
  // Per-step ports (T2.3.1): capacity honors a persisted `ports.in`/`ports.out`,
  // so a fan-in node with `ports.in > 1` keeps prior edges instead of dropping them.
  const srcPorts = nodePortsForStep(srcStep);
  const tgtPorts = nodePortsForStep(tgtStep);
  let next = edges;
  // Free the source's exit port IN THIS LANE: drop the oldest same-source edges
  // *of the same lane* so adding one more stays within out-capacity (for the
  // current 1-out model, replaces it). The other lane is untouched.
  const fromSrc = next.filter((e) => e.source === source && edgeLane(e) === when);
  if (fromSrc.length >= srcPorts.out) {
    const drop = new Set(fromSrc.slice(0, fromSrc.length - srcPorts.out + 1).map((e) => e.id));
    next = next.filter((e) => !drop.has(e.id));
  }
  // Free the target's entry port likewise — lane-blind, see the docstring.
  const toTgt = next.filter((e) => e.target === target);
  if (toTgt.length >= tgtPorts.in) {
    const drop = new Set(toTgt.slice(0, toTgt.length - tgtPorts.in + 1).map((e) => e.id));
    next = next.filter((e) => !drop.has(e.id));
  }
  // Stamp the lane at creation: a freshly drawn wire is a success edge unless the
  // caller says otherwise, and flowToWorkflow reads `data.when` back off the edge
  // (it would see `undefined` otherwise). "success" is emitted as ABSENT on the
  // way out. The id comes from `flowEdgeId`, so an error edge is qualified and
  // cannot collide with its success sibling.
  return addEdge({ source, target, id: flowEdgeId(source, target, when), data: { when } }, next);
}

/**
 * Rewrite the edge set after a step's id changed from `prevId` to `nextId`:
 * re-point every endpoint and **re-mint the id in the edge's own lane**.
 *
 * Extracted from `updateStep` so it is testable, and fixing a real defect: the
 * rewrite used to rebuild every id as `` `${source}->${target}` `` unconditionally,
 * dropping an error edge's `:error` qualifier — so renaming a step collapsed a
 * same-target success+error pair into one edge in React Flow's id-keyed store.
 * That was unreachable while a second outgoing edge deleted the first; per-lane
 * exit capacity is what makes it reachable, hence the fix ships alongside it.
 */
export function renameStepInEdges(edges: Edge[], prevId: string, nextId: string): Edge[] {
  return edges.map((e) => {
    const source = e.source === prevId ? nextId : e.source;
    const target = e.target === prevId ? nextId : e.target;
    return { ...e, source, target, id: flowEdgeId(source, target, edgeLane(e)) };
  });
}
