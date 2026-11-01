import type { Edge } from "@xyflow/react";
import type { FlowCanvas } from "./canvas-types.ts";
import type { FlowStep, FlowWorkflow } from "./flow-types.ts";
import { type StepNode, flowToWorkflow, workflowToFlow } from "./flow-utils.ts";

/** Only authored graph data. Tests, samples, run paint, selection and viewport never enter history. */
export interface FlowEditSnapshot {
  nodes: FlowStep[];
  edges: NonNullable<FlowWorkflow["edges"]>;
  connections: NonNullable<FlowWorkflow["connections"]>;
  canvas: FlowCanvas;
  /** Keep the live layout even when saving positions is switched off. */
  positions: Record<string, { x: number; y: number }>;
}

export function captureFlowEdit(
  base: FlowWorkflow,
  nodes: StepNode[],
  edges: Edge[],
  connections: FlowEditSnapshot["connections"],
  canvas: FlowCanvas,
): FlowEditSnapshot {
  const definition = flowToWorkflow({ ...base, connections }, nodes, edges);
  return {
    nodes: definition.nodes.map(({ with: params, ...step }) =>
      params && Object.keys(params).length ? { ...step, with: params } : step,
    ),
    edges: definition.edges ?? [],
    connections: definition.connections ?? {},
    canvas,
    positions: Object.fromEntries(nodes.map((n) => [n.id, n.position])),
  };
}

export function restoreFlowEdit(base: FlowWorkflow, snapshot: FlowEditSnapshot) {
  const graph = workflowToFlow({ ...base, ...snapshot });
  return {
    ...graph,
    nodes: graph.nodes.map((n) => ({
      ...n,
      position: snapshot.positions[n.id] ?? n.position,
    })),
  };
}

/** Bounded, editor-session history. One text-field focus session is one undoable edit. */
export class FlowEditHistory {
  private past: string[] = [];
  private future: string[] = [];
  private present: string;
  private group: object | undefined;
  private readonly limit: number;

  constructor(initial: FlowEditSnapshot, limit = 100) {
    this.limit = limit;
    this.present = JSON.stringify(initial);
  }

  reset(initial: FlowEditSnapshot) {
    this.present = JSON.stringify(initial);
    this.past = [];
    this.future = [];
    this.group = undefined;
  }

  record(snapshot: FlowEditSnapshot, group?: object) {
    const next = JSON.stringify(snapshot);
    if (next === this.present) return;
    if (!group || group !== this.group) {
      this.past.push(this.present);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.present = next;
    this.group = group;
    this.future = [];
  }

  undo(): FlowEditSnapshot | undefined {
    const previous = this.past.pop();
    if (previous === undefined) return;
    this.future.push(this.present);
    this.present = previous;
    this.group = undefined;
    return JSON.parse(previous);
  }

  redo(): FlowEditSnapshot | undefined {
    const next = this.future.pop();
    if (next === undefined) return;
    this.past.push(this.present);
    this.present = next;
    this.group = undefined;
    return JSON.parse(next);
  }
}

/** Leave native text undo and CodeMirror's own history alone. */
export function isFlowTextTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.isContentEditable ||
      element?.closest?.(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], .cm-editor',
      ),
  );
}
