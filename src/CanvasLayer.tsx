import { useStore } from "@xyflow/react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Markdown } from "./Markdown.tsx";
import type { CanvasNote, CanvasSection, FlowCanvas } from "./canvas-types.ts";

export interface CanvasLayerProps {
  canvas: FlowCanvas;
  savePosition?: boolean;
  /** Fired ONCE per finished edit (drop / blur / colour pick), never per frame. */
  onChange?: (canvas: FlowCanvas) => void;
  /**
   * Fired once when a section is dropped after a drag, so the host can move the members by the
   * same delta. When omitted, only the section's own position changes (via `onChange`).
   */
  onSectionDrop?: (id: string, delta: { dx: number; dy: number }) => void;
  /** Ask the host to confirm-then-delete a note or section (the layer never deletes itself). */
  onRequestDelete?: (kind: "note" | "section", id: string) => void;
  /** Hides every control and disables drag. */
  readOnly?: boolean;
  /** Flow zoom, to turn screen-pixel drags into flow units. Resolved from the store in a flow. */
  zoom?: number;
  className?: string;
  /**
   * The element to portal into. Omit inside a React Flow: the enclosing flow's
   * `.react-flow__viewport` is resolved from its DOM ref. Pass explicitly (tests, stories).
   */
  viewport?: Element | null;
}

export const SECTIONS_Z_INDEX = -2;
export const NOTES_Z_INDEX = -1;

const MIN_W = 80;
const MIN_H = 48;
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const ctl: CSSProperties = { pointerEvents: "auto", cursor: "pointer", marginLeft: 4 };

type Geo = { x: number; y: number; w: number; h: number };
type Drag = {
  kind: "note" | "section";
  id: string;
  mode: "move" | "resize";
  sx: number;
  sy: number;
  base: Geo;
  dx: number;
  dy: number;
};

function Layers({
  canvas,
  className,
  viewport,
  readOnly,
  zoom = 1,
  onChange,
  onSectionDrop,
  onRequestDelete,
}: CanvasLayerProps & { viewport: Element | null }) {
  const [live, setLive] = useState<Record<string, Geo>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  if (!viewport) return null;
  const editable = !readOnly && !!onChange;
  const sections: CanvasSection[] = canvas.sections ?? [];
  const notes: CanvasNote[] = canvas.notes ?? [];
  const geoOf = (b: CanvasNote | CanvasSection): Geo =>
    live[b.id] ?? { x: b.position.x, y: b.position.y, w: b.size.width, h: b.size.height };
  const boxStyle = (b: CanvasNote | CanvasSection): CSSProperties => {
    const g = geoOf(b);
    return {
      left: g.x,
      top: g.y,
      width: g.w,
      height: g.h,
      ["--w6w-canvas-color" as string]: b.color,
    };
  };
  const patchNote = (id: string, patch: Partial<CanvasNote>) =>
    onChange?.({ ...canvas, notes: notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  const patchSection = (id: string, patch: Partial<CanvasSection>) =>
    onChange?.({
      ...canvas,
      sections: sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });

  const frame = (d: Drag): Geo =>
    d.mode === "move"
      ? { ...d.base, x: d.base.x + d.dx, y: d.base.y + d.dy }
      : { ...d.base, w: Math.max(MIN_W, d.base.w + d.dx), h: Math.max(MIN_H, d.base.h + d.dy) };

  const begin = (
    e: ReactPointerEvent,
    b: CanvasNote | CanvasSection,
    kind: Drag["kind"],
    mode: Drag["mode"],
  ) => {
    if (!editable || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const d: Drag = {
      kind,
      id: b.id,
      mode,
      sx: e.clientX,
      sy: e.clientY,
      base: geoOf(b),
      dx: 0,
      dy: 0,
    };
    drag.current = d;
    const move = (ev: PointerEvent) => {
      d.dx = (ev.clientX - d.sx) / (zoom || 1);
      d.dy = (ev.clientY - d.sy) / (zoom || 1);
      setLive((l) => ({ ...l, [d.id]: frame(d) }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      drag.current = null;
      setLive((l) => {
        const { [d.id]: _gone, ...rest } = l;
        return rest;
      });
      if (d.dx === 0 && d.dy === 0) return;
      const g = frame(d);
      const geo = {
        position: { x: g.x, y: g.y },
        size: { width: g.w, height: g.h },
      };
      if (d.kind === "section" && d.mode === "move" && onSectionDrop) {
        onSectionDrop(d.id, { dx: d.dx, dy: d.dy });
      } else if (d.kind === "note") patchNote(d.id, geo);
      else patchSection(d.id, geo);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const cls = className ? ` ${className}` : "";
  const noInteract = "nopan nodrag nowheel";
  return createPortal(
    <>
      <div
        className={`w6w-canvas-layer w6w-canvas-sections${cls}`}
        style={{ zIndex: SECTIONS_Z_INDEX }}
        data-testid="w6w-canvas-sections"
      >
        {sections.map((s) => (
          <div
            key={s.id}
            className="w6w-canvas-section"
            style={boxStyle(s)}
            data-section-id={s.id}
            data-testid="section"
          >
            <div
              className={`w6w-canvas-section-title ${noInteract}`}
              data-testid="section-drag"
              style={editable ? { cursor: "grab", touchAction: "none" } : undefined}
              onPointerDown={editable ? (e) => begin(e, s, "section", "move") : undefined}
            >
              {editable ? (
                <input
                  type="text"
                  aria-label="Section title"
                  data-testid="section-title"
                  defaultValue={s.title}
                  key={`${s.id}:${s.title}`}
                  style={{ pointerEvents: "auto", font: "inherit", width: "10em" }}
                  onPointerDown={stop}
                  onBlur={(e) => {
                    const v = e.currentTarget.value;
                    if (v !== s.title) patchSection(s.id, { title: v });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
              ) : (
                s.title
              )}
              {editable && (
                <>
                  <input
                    type="color"
                    aria-label="Section colour"
                    data-testid="section-color"
                    value={s.color}
                    style={ctl}
                    onPointerDown={stop}
                    onChange={(e) => patchSection(s.id, { color: e.currentTarget.value })}
                  />
                  <button
                    type="button"
                    aria-label="Delete section"
                    data-testid="section-delete"
                    style={ctl}
                    onPointerDown={stop}
                    onClick={() => onRequestDelete?.("section", s.id)}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
            {editable && (
              <div
                className={noInteract}
                data-testid="section-resize"
                style={resizeHandle}
                onPointerDown={(e) => begin(e, s, "section", "resize")}
              />
            )}
          </div>
        ))}
      </div>
      <div
        className={`w6w-canvas-layer w6w-canvas-notes${cls}`}
        style={{ zIndex: NOTES_Z_INDEX }}
        data-testid="w6w-canvas-notes"
      >
        {notes.map((n) => (
          <div
            key={n.id}
            className="w6w-canvas-note"
            style={boxStyle(n)}
            data-note-id={n.id}
            data-testid="note"
          >
            {editable && (
              <div
                className={noInteract}
                data-testid="note-drag"
                style={{
                  pointerEvents: "auto",
                  cursor: "grab",
                  touchAction: "none",
                  display: "flex",
                  justifyContent: "flex-end",
                  padding: "2px 4px",
                }}
                onPointerDown={(e) => begin(e, n, "note", "move")}
              >
                <button
                  type="button"
                  aria-label="Edit note"
                  data-testid="note-edit"
                  style={ctl}
                  onPointerDown={stop}
                  onClick={() => setEditingNote(editingNote === n.id ? null : n.id)}
                >
                  ✎
                </button>
                <input
                  type="color"
                  aria-label="Note colour"
                  data-testid="note-color"
                  value={n.color}
                  style={ctl}
                  onPointerDown={stop}
                  onChange={(e) => patchNote(n.id, { color: e.currentTarget.value })}
                />
                <button
                  type="button"
                  aria-label="Delete note"
                  data-testid="note-delete"
                  style={ctl}
                  onPointerDown={stop}
                  onClick={() => onRequestDelete?.("note", n.id)}
                >
                  ×
                </button>
              </div>
            )}
            <div className={`w6w-canvas-note-body ${noInteract}`}>
              {editable && editingNote === n.id ? (
                <textarea
                  aria-label="Note content"
                  data-testid="note-content"
                  defaultValue={n.content}
                  style={{ width: "100%", height: "100%", boxSizing: "border-box" }}
                  onBlur={(e) => {
                    const v = e.currentTarget.value;
                    setEditingNote(null);
                    if (v !== n.content) patchNote(n.id, { content: v });
                  }}
                />
              ) : (
                <Markdown content={n.content} />
              )}
            </div>
            {editable && (
              <div
                className={noInteract}
                data-testid="note-resize"
                style={resizeHandle}
                onPointerDown={(e) => begin(e, n, "note", "resize")}
              />
            )}
          </div>
        ))}
      </div>
    </>,
    viewport,
  );
}

const resizeHandle: CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: 0,
  width: 12,
  height: 12,
  cursor: "nwse-resize",
  pointerEvents: "auto",
  touchAction: "none",
  background: "var(--w6w-canvas-color, currentColor)",
  opacity: 0.6,
};

function FlowResolved(props: CanvasLayerProps) {
  const viewport = useStore((s) => s.domNode?.querySelector(".react-flow__viewport") ?? null);
  const zoom = useStore((s) => s.transform[2]);
  return <Layers {...props} zoom={props.zoom ?? zoom} viewport={viewport} />;
}

/** Sections (z -2) and notes (z -1) rendered behind edges/nodes, inside the flow viewport. */
export function CanvasLayer(props: CanvasLayerProps) {
  if (props.viewport !== undefined) {
    return <Layers {...props} viewport={props.viewport} />;
  }
  return <FlowResolved {...props} />;
}
