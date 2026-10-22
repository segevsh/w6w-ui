import type { FlowCanvas } from "./canvas-types.ts";

export interface CanvasLayerProps {
  canvas: FlowCanvas;
  savePosition?: boolean;
  onChange?: (canvas: FlowCanvas) => void;
  className?: string;
}

/** Skeleton: renders sections/notes behind nodes (implemented in a later slice). */
export function CanvasLayer(_props: CanvasLayerProps): null {
  return null;
}
