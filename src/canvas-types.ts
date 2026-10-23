/** Workflow canvas (notes + sections); hand-mirror of core's `Workflow.canvas`. */
export interface CanvasNote {
  id: string;
  color: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  content: string;
}

export interface CanvasSection {
  id: string;
  title: string;
  color: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  /** Member node ids; a node belongs to at most one section. */
  nodes: string[];
}

export interface FlowCanvas {
  notes?: CanvasNote[];
  sections?: CanvasSection[];
}

export const MAX_NOTES = 200;
export const MAX_SECTIONS = 200;
export const MAX_NOTE_BYTES = 10240;
