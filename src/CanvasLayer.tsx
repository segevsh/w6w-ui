import { useStore } from "@xyflow/react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Markdown } from "./Markdown.tsx";
import type { CanvasNote, CanvasSection, FlowCanvas } from "./canvas-types.ts";
import { Icon } from "./components/Icon.tsx";
import { editableToMarkdown, noteDisplayMarkdown, renderEditable } from "./note-markdown.ts";

export interface CanvasLayerProps {
  canvas: FlowCanvas;
  savePosition?: boolean;
  /** Fired ONCE per finished edit (drop / blur / colour pick / format), never per frame. */
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
/** The selected note's or section's toolbar sits above nodes and edges, unlike the box itself. */
export const NOTE_TOOLBAR_Z_INDEX = 1000;

/** The note colour palette offered by the toolbar (a custom colour is still accepted). */
export const NOTE_COLORS = [
  "#facc15",
  "#fb923c",
  "#f87171",
  "#f472b6",
  "#a78bfa",
  "#60a5fa",
  "#2dd4bf",
  "#4ade80",
  "#9ca3af",
];

/** Text sizes the toolbar writes, as Markdown heading levels (0 = body text). */
const TEXT_SIZES = [
  { level: 1, label: "Title" },
  { level: 2, label: "Heading" },
  { level: 3, label: "Subheading" },
  { level: 0, label: "Body" },
];

const MIN_W = 80;
const MIN_H = 48;
const TOOLBAR_GAP = 10;
const LABEL_GAP = 4;
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

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

/** Select the whole editable so a toolbar format applies to the entire note. */
function selectAll(el: HTMLElement) {
  const sel = el.ownerDocument.getSelection();
  if (!sel) return;
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
}

function caretToEnd(el: HTMLElement) {
  const sel = el.ownerDocument.getSelection();
  if (!sel) return;
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

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
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [menu, setMenu] = useState<"color" | "size" | null>(null);
  const drag = useRef<Drag | null>(null);
  const editor = useRef<HTMLElement | null>(null);
  // A format picked while NOT editing: run once the editor has mounted, over the whole note.
  const pendingFormat = useRef<(() => void) | null>(null);

  // A press anywhere outside the selected note or section and its toolbar deselects it.
  useEffect(() => {
    if (!selectedNote && !selectedSection) return;
    const inside = selectedNote
      ? `[data-note-id="${selectedNote}"], [data-note-toolbar="${selectedNote}"]`
      : `[data-section-label="${selectedSection}"], [data-section-toolbar="${selectedSection}"]`;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.(inside)) return;
      // The toolbar unmounts before focus moves, so commit a title being typed first.
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest?.("[data-section-toolbar]")) active.blur();
      setSelectedNote(null);
      setSelectedSection(null);
      setMenu(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [selectedNote, selectedSection]);

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

  // Write the editor's Markdown back, when it differs from what is stored.
  const commitNote = (id: string) => {
    const el = editor.current;
    const note = notes.find((n) => n.id === id);
    if (!el?.isConnected || !note) return;
    const md = editableToMarkdown(el);
    if (md !== note.content) patchNote(id, { content: md });
  };
  const selectNote = (id: string) => {
    setSelectedSection(null);
    setSelectedNote(id);
  };
  const selectSection = (id: string) => {
    setSelectedNote(null);
    setSelectedSection(id);
  };
  const startEdit = (id: string, then?: () => void) => {
    pendingFormat.current = then ?? null;
    selectNote(id);
    setEditingNote(id);
    setMenu(null);
  };
  // Mounts the editable once per edit session: the DOM is owned by the browser while editing,
  // so React renders the element empty and never reconciles its children.
  const editorRef = (n: CanvasNote) => (el: HTMLDivElement | null) => {
    if (!el || el.dataset.ready === "1") return;
    el.dataset.ready = "1";
    editor.current = el;
    renderEditable(el, n.content);
    el.focus();
    const then = pendingFormat.current;
    pendingFormat.current = null;
    if (then) {
      selectAll(el);
      then();
      commitNote(n.id);
    } else caretToEnd(el);
  };
  /** Apply a `document.execCommand` format to the note — its selection, or all of it. */
  const format = (id: string, command: string, arg?: string) => {
    setMenu(null);
    const run = () => document.execCommand(command, false, arg);
    if (editingNote === id && editor.current?.isConnected) {
      run();
      commitNote(id);
    } else startEdit(id, run);
  };

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
  const toolbarNote = editable ? notes.find((n) => n.id === selectedNote) : undefined;
  const toolbarSection = editable ? sections.find((s) => s.id === selectedSection) : undefined;
  const z = zoom || 1;
  const toolbarStyle = (n: CanvasNote): CSSProperties => {
    const g = geoOf(n);
    // Anchored at the note's top-centre in flow units, then counter-scaled so the toolbar keeps
    // its screen size at every zoom (scaling about its own bottom-centre keeps it anchored).
    return {
      left: g.x + g.w / 2,
      top: g.y,
      transform: `translate(-50%, calc(-100% - ${TOOLBAR_GAP / z}px)) scale(${1 / z})`,
      transformOrigin: "50% 100%",
      ["--w6w-canvas-color" as string]: n.color,
    };
  };
  // A section's label and its toolbar share one spot: just above the frame's top-left corner,
  // counter-scaled the same way about their bottom-left.
  const aboveFrame = (s: CanvasSection, gap: number): CSSProperties => {
    const g = geoOf(s);
    return {
      left: g.x,
      top: g.y,
      transform: `translate(0, calc(-100% - ${gap / z}px)) scale(${1 / z})`,
      transformOrigin: "0 100%",
      ["--w6w-canvas-color" as string]: s.color,
    };
  };
  const colorMenu = (
    current: string,
    label: string,
    testid: string,
    pick: (color: string) => void,
  ) => (
    <div className="w6w-note-menu w6w-note-menu-colors" role="menu">
      {NOTE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="menuitemradio"
          aria-checked={c === current}
          aria-label={`Colour ${c}`}
          title={c}
          className={`w6w-note-swatch-btn${c === current ? " active" : ""}`}
          style={{ ["--w6w-canvas-color" as string]: c }}
          data-testid={`${testid}-option`}
          data-color={c}
          onClick={() => {
            setMenu(null);
            if (c !== current) pick(c);
          }}
        />
      ))}
      <label className="w6w-note-swatch-btn w6w-note-swatch-custom" title="Custom">
        <input
          type="color"
          aria-label={`Custom ${label} colour`}
          data-testid={`${testid}-input`}
          value={current}
          onChange={(e) => pick(e.currentTarget.value)}
        />
      </label>
    </div>
  );
  // Every press on a toolbar is kept from taking focus (so a note format applies to the editor's
  // own selection instead of blurring it away), except in its inputs.
  const keepFocus = (e: { target: EventTarget; preventDefault: () => void }) => {
    if (!(e.target as Element).closest("input")) e.preventDefault();
  };
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
            className={`w6w-canvas-section${selectedSection === s.id ? " selected" : ""}`}
            style={boxStyle(s)}
            data-section-id={s.id}
            data-testid="section"
          >
            {editable && (
              <div
                className={`w6w-note-resize ${noInteract}`}
                data-testid="section-resize"
                onPointerDown={(e) => begin(e, s, "section", "resize")}
              />
            )}
          </div>
        ))}
        {/* The label sits outside its frame, above the top-left corner; the toolbar takes its
        place while the section is selected. */}
        {sections.map((s) =>
          toolbarSection?.id === s.id ? null : (
            <div
              key={s.id}
              className={`w6w-canvas-section-title${editable ? ` editable ${noInteract}` : ""}`}
              style={aboveFrame(s, LABEL_GAP)}
              data-section-label={s.id}
              data-testid="section-label"
              title={editable ? "Click to edit · drag to move" : undefined}
              onPointerDown={
                editable
                  ? (e) => {
                      selectSection(s.id);
                      begin(e, s, "section", "move");
                    }
                  : undefined
              }
            >
              {s.title || (editable ? "Untitled section" : "")}
            </div>
          ),
        )}
      </div>
      <div
        className={`w6w-canvas-layer w6w-canvas-notes${cls}`}
        style={{ zIndex: NOTES_Z_INDEX }}
        data-testid="w6w-canvas-notes"
      >
        {notes.map((n) => {
          const editing = editable && editingNote === n.id;
          return (
            <div
              key={n.id}
              className={`w6w-canvas-note${selectedNote === n.id ? " selected" : ""}`}
              style={boxStyle(n)}
              data-note-id={n.id}
              data-testid="note"
            >
              {/* Distinct keys: the editor's DOM is browser-owned, so it must never be a node React
              reuses for the rendered view (or the other way round). */}
              {editing ? (
                <div
                  key="editor"
                  ref={editorRef(n)}
                  className={`w6w-canvas-note-body w6w-canvas-note-editor ${noInteract}`}
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  tabIndex={0}
                  aria-multiline="true"
                  aria-label="Note content"
                  data-testid="note-content"
                  onPointerDown={stop}
                  onBlur={() => {
                    commitNote(n.id);
                    editor.current = null;
                    setEditingNote(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") e.currentTarget.blur();
                  }}
                  onPaste={(e) => {
                    // Plain text only: pasted HTML would bring markup the Markdown can't hold.
                    e.preventDefault();
                    document.execCommand(
                      "insertText",
                      false,
                      e.clipboardData.getData("text/plain"),
                    );
                  }}
                />
              ) : (
                <div
                  key="view"
                  className={`w6w-canvas-note-body ${noInteract}`}
                  data-testid="note-view"
                  style={editable ? { cursor: "grab", touchAction: "none" } : undefined}
                  onPointerDown={
                    editable
                      ? (e) => {
                          selectNote(n.id);
                          begin(e, n, "note", "move");
                        }
                      : undefined
                  }
                  onDoubleClick={editable ? () => startEdit(n.id) : undefined}
                >
                  {n.content.trim() ? (
                    <Markdown content={noteDisplayMarkdown(n.content)} />
                  ) : (
                    editable && <span className="w6w-canvas-note-empty">Double-click to write</span>
                  )}
                </div>
              )}
              {editable && (
                <div
                  className={`w6w-note-resize ${noInteract}`}
                  data-testid="note-resize"
                  onPointerDown={(e) => begin(e, n, "note", "resize")}
                />
              )}
            </div>
          );
        })}
      </div>
      {toolbarSection && (
        <div
          className={`w6w-canvas-layer${cls}`}
          style={{ zIndex: NOTE_TOOLBAR_Z_INDEX }}
          data-testid="w6w-canvas-overlay"
        >
          <div
            className={`w6w-note-toolbar w6w-section-toolbar ${noInteract}`}
            role="toolbar"
            aria-label="Section"
            data-testid="section-toolbar"
            data-section-toolbar={toolbarSection.id}
            style={aboveFrame(toolbarSection, TOOLBAR_GAP)}
            onPointerDown={stop}
            onMouseDown={keepFocus}
          >
            <button
              type="button"
              className="w6w-icon-btn w6w-note-grip"
              aria-label="Move section"
              title="Drag to move"
              data-testid="section-drag"
              onPointerDown={(e) => begin(e, toolbarSection, "section", "move")}
            >
              <Icon name="grip" />
            </button>
            <input
              type="text"
              className="w6w-section-title-input"
              aria-label="Section title"
              placeholder="Untitled section"
              data-testid="section-title"
              defaultValue={toolbarSection.title}
              key={`${toolbarSection.id}:${toolbarSection.title}`}
              size={Math.max(8, Math.min(32, toolbarSection.title.length + 1))}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                if (v !== toolbarSection.title) patchSection(toolbarSection.id, { title: v });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
              }}
            />
            <span className="w6w-note-toolbar-sep" />
            <div className="w6w-note-toolbar-group">
              <button
                type="button"
                className={`w6w-icon-btn${menu === "color" ? " active" : ""}`}
                aria-label="Section colour"
                aria-expanded={menu === "color"}
                title="Colour"
                data-testid="section-color"
                onClick={() => setMenu(menu === "color" ? null : "color")}
              >
                <span className="w6w-note-swatch" />
                <Icon name="chevron-down" size={12} />
              </button>
              {menu === "color" &&
                colorMenu(toolbarSection.color, "section", "section-color", (c) =>
                  patchSection(toolbarSection.id, { color: c }),
                )}
            </div>
            <span className="w6w-note-toolbar-sep" />
            <button
              type="button"
              className="w6w-icon-btn w6w-note-delete"
              aria-label="Delete section"
              title="Delete section"
              data-testid="section-delete"
              onClick={() => {
                setMenu(null);
                onRequestDelete?.("section", toolbarSection.id);
              }}
            >
              <Icon name="trash" />
            </button>
          </div>
        </div>
      )}
      {toolbarNote && (
        <div
          className={`w6w-canvas-layer${cls}`}
          style={{ zIndex: NOTE_TOOLBAR_Z_INDEX }}
          data-testid="w6w-canvas-overlay"
        >
          <div
            className={`w6w-note-toolbar ${noInteract}`}
            role="toolbar"
            aria-label="Note"
            data-testid="note-toolbar"
            data-note-toolbar={toolbarNote.id}
            style={toolbarStyle(toolbarNote)}
            onPointerDown={stop}
            onMouseDown={keepFocus}
          >
            <button
              type="button"
              className="w6w-icon-btn w6w-note-grip"
              aria-label="Move note"
              title="Drag to move"
              data-testid="note-drag"
              onPointerDown={(e) => begin(e, toolbarNote, "note", "move")}
            >
              <Icon name="grip" />
            </button>
            <span className="w6w-note-toolbar-sep" />
            <div className="w6w-note-toolbar-group">
              <button
                type="button"
                className={`w6w-icon-btn${menu === "color" ? " active" : ""}`}
                aria-label="Note colour"
                aria-expanded={menu === "color"}
                title="Colour"
                data-testid="note-color"
                onClick={() => setMenu(menu === "color" ? null : "color")}
              >
                <span className="w6w-note-swatch" />
                <Icon name="chevron-down" size={12} />
              </button>
              {menu === "color" &&
                colorMenu(toolbarNote.color, "note", "note-color", (c) =>
                  patchNote(toolbarNote.id, { color: c }),
                )}
            </div>
            <span className="w6w-note-toolbar-sep" />
            <div className="w6w-note-toolbar-group">
              <button
                type="button"
                className={`w6w-icon-btn w6w-note-size-btn${menu === "size" ? " active" : ""}`}
                aria-label="Text size"
                aria-expanded={menu === "size"}
                title="Text size"
                data-testid="note-size"
                onClick={() => setMenu(menu === "size" ? null : "size")}
              >
                Aa
                <Icon name="chevron-down" size={12} />
              </button>
              {menu === "size" && (
                <div className="w6w-note-menu w6w-note-menu-sizes" role="menu">
                  {TEXT_SIZES.map((s) => (
                    <button
                      key={s.level}
                      type="button"
                      role="menuitem"
                      className={`w6w-note-menu-item w6w-note-size-${s.level}`}
                      data-testid={`note-size-${s.level}`}
                      onClick={() =>
                        format(toolbarNote.id, "formatBlock", s.level ? `<h${s.level}>` : "<div>")
                      }
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="w6w-icon-btn"
              aria-label="Bold"
              title="Bold"
              data-testid="note-bold"
              onClick={() => format(toolbarNote.id, "bold")}
            >
              <Icon name="bold" />
            </button>
            <span className="w6w-note-toolbar-sep" />
            <button
              type="button"
              className="w6w-icon-btn w6w-note-delete"
              aria-label="Delete note"
              title="Delete note"
              data-testid="note-delete"
              onClick={() => {
                setMenu(null);
                onRequestDelete?.("note", toolbarNote.id);
              }}
            >
              <Icon name="trash" />
            </button>
          </div>
        </div>
      )}
    </>,
    viewport,
  );
}

function FlowResolved(props: CanvasLayerProps) {
  const viewport = useStore((s) => s.domNode?.querySelector(".react-flow__viewport") ?? null);
  const zoom = useStore((s) => s.transform[2]);
  return <Layers {...props} zoom={props.zoom ?? zoom} viewport={viewport} />;
}

/**
 * Sections (z -2) and notes (z -1) rendered behind edges/nodes, inside the flow viewport; the
 * selected note's or section's toolbar floats above everything.
 */
export function CanvasLayer(props: CanvasLayerProps) {
  if (props.viewport !== undefined) {
    return <Layers {...props} viewport={props.viewport} />;
  }
  return <FlowResolved {...props} />;
}
