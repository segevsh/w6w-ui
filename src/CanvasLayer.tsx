import { useStore } from "@xyflow/react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Markdown } from "./Markdown.tsx";
import type { CanvasNote, CanvasSection, FlowCanvas } from "./canvas-types.ts";

export interface CanvasLayerProps {
  canvas: FlowCanvas;
  savePosition?: boolean;
  onChange?: (canvas: FlowCanvas) => void;
  className?: string;
  /**
   * The element to portal into. Omit inside a React Flow: the enclosing flow's
   * `.react-flow__viewport` is resolved from its DOM ref. Pass explicitly (tests, stories).
   */
  viewport?: Element | null;
}

export const SECTIONS_Z_INDEX = -2;
export const NOTES_Z_INDEX = -1;

const boxStyle = (b: Pick<CanvasNote, "position" | "size" | "color">): CSSProperties => ({
  left: b.position.x,
  top: b.position.y,
  width: b.size.width,
  height: b.size.height,
  ["--w6w-canvas-color" as string]: b.color,
});

function Layers({
  canvas,
  className,
  viewport,
}: {
  canvas: FlowCanvas;
  className?: string;
  viewport: Element | null;
}) {
  if (!viewport) return null;
  const sections: CanvasSection[] = canvas.sections ?? [];
  const notes: CanvasNote[] = canvas.notes ?? [];
  return createPortal(
    <>
      <div
        className={`w6w-canvas-layer w6w-canvas-sections${className ? ` ${className}` : ""}`}
        style={{ zIndex: SECTIONS_Z_INDEX }}
        data-testid="w6w-canvas-sections"
      >
        {sections.map((s) => (
          <div key={s.id} className="w6w-canvas-section" style={boxStyle(s)} data-section-id={s.id}>
            <div className="w6w-canvas-section-title nopan nodrag nowheel">{s.title}</div>
          </div>
        ))}
      </div>
      <div
        className={`w6w-canvas-layer w6w-canvas-notes${className ? ` ${className}` : ""}`}
        style={{ zIndex: NOTES_Z_INDEX }}
        data-testid="w6w-canvas-notes"
      >
        {notes.map((n) => (
          <div key={n.id} className="w6w-canvas-note" style={boxStyle(n)} data-note-id={n.id}>
            <div className="w6w-canvas-note-body nopan nodrag nowheel">
              <Markdown content={n.content} />
            </div>
          </div>
        ))}
      </div>
    </>,
    viewport,
  );
}

function FlowResolved(props: CanvasLayerProps) {
  const viewport = useStore((s) => s.domNode?.querySelector(".react-flow__viewport") ?? null);
  return <Layers canvas={props.canvas} className={props.className} viewport={viewport} />;
}

/** Sections (z -2) and notes (z -1) rendered behind edges/nodes, inside the flow viewport. */
export function CanvasLayer(props: CanvasLayerProps) {
  if (props.viewport !== undefined) {
    return <Layers canvas={props.canvas} className={props.className} viewport={props.viewport} />;
  }
  return <FlowResolved {...props} />;
}
