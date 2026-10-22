import { type FlowCanvas, MAX_NOTES, MAX_NOTE_BYTES, MAX_SECTIONS } from "./canvas-types.ts";

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

type Pos = { x: number; y: number };
type Size = { width: number; height: number };

const isFinitePos = (p?: Pos): p is Pos => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
const isFiniteSize = (z?: Size): z is Size =>
  !!z && Number.isFinite(z.width) && Number.isFinite(z.height);

function mapItems<T extends { id: string; position: Pos; size: Size }>(
  items: T[] | undefined,
  live: LiveGeometry | undefined,
  useLive: boolean,
): T[] | undefined {
  if (!items) return items;
  return items.map((it) => {
    const l = useLive ? live?.[it.id] : undefined;
    const position = isFinitePos(l?.position) ? l.position : it.position;
    const size = isFiniteSize(l?.size) ? l.size : it.size;
    return { ...it, position: roundGeometry(position), size: roundGeometry(size) };
  });
}

/**
 * Stamp live geometry onto the stored canvas, rounded to integers. When
 * `savePosition === false` the stored canvas is returned untouched (mirrors
 * `flowToWorkflow`'s `withPosition`): not written is not erased.
 */
export function withCanvasGeometry(
  canvas: FlowCanvas,
  savePosition: boolean,
  live?: LiveGeometry,
): FlowCanvas {
  if (!savePosition) return canvas;
  const out: FlowCanvas = { ...canvas };
  if (canvas.notes) out.notes = mapItems(canvas.notes, live, true);
  if (canvas.sections) out.sections = mapItems(canvas.sections, live, true);
  return out;
}

/** Remove a deleted node id from every section. */
export function pruneSectionMembers(canvas: FlowCanvas, deletedNodeId: string): FlowCanvas {
  if (!canvas.sections) return canvas;
  return {
    ...canvas,
    sections: canvas.sections.map((s) => ({
      ...s,
      nodes: s.nodes.filter((n) => n !== deletedNodeId),
    })),
  };
}

/** Map a renamed node id in every section. */
export function renameSectionMember(canvas: FlowCanvas, from: string, to: string): FlowCanvas {
  if (!canvas.sections) return canvas;
  return {
    ...canvas,
    sections: canvas.sections.map((s) => ({
      ...s,
      nodes: s.nodes.map((n) => (n === from ? to : n)),
    })),
  };
}

/** Put `nodeIds` into `sectionId`, removing them from any other section (at most one each). */
export function assignMembership(
  canvas: FlowCanvas,
  sectionId: string,
  nodeIds: string[],
): FlowCanvas {
  if (!canvas.sections) return canvas;
  const moving = new Set(nodeIds);
  return {
    ...canvas,
    sections: canvas.sections.map((s) => {
      const kept = s.nodes.filter((n) => !moving.has(n));
      return s.id === sectionId
        ? { ...s, nodes: [...new Set([...kept, ...nodeIds])] }
        : { ...s, nodes: kept };
    }),
  };
}

/** Ids of every section containing the node. */
export function sectionsContaining(canvas: FlowCanvas, nodeId: string): string[] {
  return (canvas.sections ?? []).filter((s) => s.nodes.includes(nodeId)).map((s) => s.id);
}

/** Truncate to at most `max` UTF-8 bytes without splitting a codepoint. */
function truncateBytes(text: string, max: number): string {
  const enc = new TextEncoder();
  if (enc.encode(text).length <= max) return text;
  let out = "";
  let used = 0;
  for (const ch of text) {
    const n = enc.encode(ch).length;
    if (used + n > max) break;
    out += ch;
    used += n;
  }
  return out;
}

/** Enforce the caps: 200 notes, 200 sections, 10240 UTF-8 bytes per note content. */
export function clampCanvas(canvas: FlowCanvas): FlowCanvas {
  const out: FlowCanvas = { ...canvas };
  if (canvas.notes) {
    out.notes = canvas.notes
      .slice(0, MAX_NOTES)
      .map((n) => ({ ...n, content: truncateBytes(n.content, MAX_NOTE_BYTES) }));
  }
  if (canvas.sections) out.sections = canvas.sections.slice(0, MAX_SECTIONS);
  return out;
}

/**
 * The canvas to emit. Geometry is stamped (rounded) from the live canvas when `savePosition` is
 * on; when off, every item already in `stored` keeps its STORED position/size (live edits render
 * but are not written — mirrors node positions). Items new this session keep their live geometry.
 */
export function persistCanvas(
  canvas: FlowCanvas,
  stored: FlowCanvas | undefined,
  savePosition: boolean,
): FlowCanvas {
  const live: LiveGeometry = {};
  for (const it of [...(canvas.notes ?? []), ...(canvas.sections ?? [])]) {
    live[it.id] = { position: it.position, size: it.size };
  }
  const pin = <T extends { id: string; position: Pos; size: Size }>(items?: T[], old?: T[]) =>
    items?.map((it) => {
      const s = old?.find((o) => o.id === it.id);
      return s ? { ...it, position: s.position, size: s.size } : it;
    });
  const base: FlowCanvas = savePosition
    ? canvas
    : {
        ...canvas,
        ...(canvas.notes ? { notes: pin(canvas.notes, stored?.notes) } : {}),
        ...(canvas.sections ? { sections: pin(canvas.sections, stored?.sections) } : {}),
      };
  return withCanvasGeometry(base, savePosition, live);
}
