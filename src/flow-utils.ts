/**
 * Convert between the Workflow logical model and the React Flow node/edge
 * representation. Also computes an auto-layout — a simple topological layering
 * (columns = depth; rows = sibling index) that is deterministic and portable
 * so the same workflow always opens with the same layout.
 */
import type { Edge, Node } from "@xyflow/react";
import { CONTROL_APP, type FlowEdge, type FlowStep, type FlowWorkflow } from "./flow-types.ts";

export interface StepNodeData extends Record<string, unknown> {
  step: FlowStep;
  isControl: boolean;
}

export type StepNode = Node<StepNodeData>;

/** Nice constants — tunable but stable defaults so layouts don't jitter. */
const COLUMN_WIDTH = 240;
const ROW_HEIGHT = 100;
const MARGIN_X = 40;
const MARGIN_Y = 40;

/** Layer index per step id under a topological layout of the DAG. */
function computeLayers(steps: FlowStep[], edges: FlowEdge[]): Map<string, number> {
  const layer = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const s of steps) {
    layer.set(s.id, 0);
    incoming.set(s.id, []);
  }
  for (const e of edges) {
    if (incoming.has(e.to)) incoming.get(e.to)!.push(e.from);
  }
  // Iterate to fixpoint. For a DAG this converges in O(V+E) passes.
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of steps) {
      const preds = incoming.get(s.id) ?? [];
      if (preds.length === 0) continue;
      const next = preds.reduce((max, p) => Math.max(max, (layer.get(p) ?? 0) + 1), 0);
      if ((layer.get(s.id) ?? 0) < next) {
        layer.set(s.id, next);
        changed = true;
      }
    }
  }
  return layer;
}

/** Turn a Workflow into (nodes, edges) with an auto-layout when no positions are known. */
export function workflowToFlow(wf: FlowWorkflow): { nodes: StepNode[]; edges: Edge[] } {
  const edges: FlowEdge[] = wf.edges ?? implicitChain(wf.steps);
  const layer = computeLayers(wf.steps, edges);
  const rowsInLayer = new Map<number, number>();

  const nodes: StepNode[] = wf.steps.map((step) => {
    const isControl = step.uses.app === CONTROL_APP;
    const col = layer.get(step.id) ?? 0;
    const row = rowsInLayer.get(col) ?? 0;
    rowsInLayer.set(col, row + 1);
    return {
      id: step.id,
      type: isControl ? "control" : "step",
      position: {
        x: MARGIN_X + col * COLUMN_WIDTH,
        y: MARGIN_Y + row * ROW_HEIGHT,
      },
      data: { step, isControl },
    };
  });

  const flowEdges: Edge[] = edges.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    animated: false,
  }));

  return { nodes, edges: flowEdges };
}

/** Reverse direction: pull the graph state back into a Workflow shape for onChange. */
export function flowToWorkflow(
  original: FlowWorkflow,
  nodes: StepNode[],
  edges: Edge[],
): FlowWorkflow {
  // Preserve original step order where possible; append new nodes at the end.
  const stepById = new Map<string, FlowStep>();
  for (const s of original.steps) stepById.set(s.id, s);
  for (const n of nodes) if (n.data?.step) stepById.set(n.id, n.data.step);

  const nextSteps: FlowStep[] = [];
  const seen = new Set<string>();
  for (const s of original.steps) {
    const current = stepById.get(s.id);
    if (current && nodes.some((n) => n.id === s.id)) {
      nextSteps.push(current);
      seen.add(s.id);
    }
  }
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const s = stepById.get(n.id);
    if (s) nextSteps.push(s);
  }

  const nextEdges: FlowEdge[] = edges.map((e) => ({ from: e.source, to: e.target }));

  return { ...original, steps: nextSteps, edges: nextEdges };
}

/** When no edges are declared, treat steps as a linear chain in declared order. */
function implicitChain(steps: FlowStep[]): FlowEdge[] {
  const out: FlowEdge[] = [];
  for (let i = 0; i < steps.length - 1; i++) out.push({ from: steps[i].id, to: steps[i + 1].id });
  return out;
}

/** Suggest a unique step id given the current graph. */
export function suggestStepId(existing: string[], prefix = "step"): string {
  const set = new Set(existing);
  for (let i = 1; i < 1000; i++) {
    const id = `${prefix}_${i}`;
    if (!set.has(id)) return id;
  }
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}
