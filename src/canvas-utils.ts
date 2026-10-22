import type { FlowCanvas } from "./canvas-types.ts";

/** Live geometry keyed by note/section id. */
export interface LiveGeometry {
  [id: string]: { position?: { x: number; y: number }; size?: { width: number; height: number } };
}

/** Round every stored number to an integer. */
export function roundGeometry<
  T extends { x: number; y: number } | { width: number; height: number },
>(g: T): T {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(g)) out[k] = Math.round(v as number);
  return out as T;
}

// Skeleton stubs (S2 implements). Identity / throwing until then.
export function withCanvasGeometry(
  canvas: FlowCanvas,
  _savePosition: boolean,
  _live?: LiveGeometry,
): FlowCanvas {
  return canvas;
}
export function pruneSectionMembers(canvas: FlowCanvas, _deletedNodeId: string): FlowCanvas {
  return canvas;
}
export function renameSectionMember(canvas: FlowCanvas, _from: string, _to: string): FlowCanvas {
  return canvas;
}
export function assignMembership(
  canvas: FlowCanvas,
  _sectionId: string,
  _nodeIds: string[],
): FlowCanvas {
  return canvas;
}
export function sectionsContaining(_canvas: FlowCanvas, _nodeId: string): string[] {
  return [];
}
export function clampCanvas(canvas: FlowCanvas): FlowCanvas {
  return canvas;
}
