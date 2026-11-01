/**
 * Loop colours: every For each on a canvas gets its own tone, shared by its Each item
 * port, its body edges and the dots on its body steps (never the body steps' own
 * background — a step inside a loop looks like any other). The palette lives in
 * `_tokens.scss` as `--w6w-loop-1` … `--w6w-loop-{LOOP_TONES}` (light + dark), and
 * deliberately holds no red, black or green, so a loop never reads as an error port
 * or a success/taken edge.
 *
 * A tone is DERIVED from the For each's id — hashed, then probed past tones another
 * loop already took — so it survives a reload and two loops in one workflow never share
 * one (until there are more loops than tones).
 */
import type { Edge } from "@xyflow/react";
import type { CSSProperties } from "react";
import { isForeachStep } from "./flow-loop.ts";
import { EACH_SOURCE_HANDLE } from "./flow-types.ts";
import type { StepNode } from "./flow-utils.ts";

/** How many `--w6w-loop-N` tokens `_tokens.scss` defines. */
export const LOOP_TONES = 6;

/** FNV-1a over the id's UTF-16 code units — small, stable, no dependency. */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Tone index (1-based) per For each id. Ids are visited in sorted order so the result
 * does not depend on node order; each takes its hashed tone, or the next free one.
 */
export function assignLoopTones(foreachIds: Iterable<string>): Map<string, number> {
  const out = new Map<string, number>();
  let taken = new Set<number>();
  for (const id of [...new Set(foreachIds)].sort()) {
    if (taken.size === LOOP_TONES) taken = new Set();
    let tone = hashId(id) % LOOP_TONES;
    while (taken.has(tone)) tone = (tone + 1) % LOOP_TONES;
    taken.add(tone);
    out.set(id, tone + 1);
  }
  return out;
}

/** The CSS colour for a tone index. */
export function loopToneVar(tone: number): string {
  return `var(--w6w-loop-${tone})`;
}

/** The loops enclosing `id`, outermost first, following each For each's own `loopOf`. */
export function enclosingLoops(
  id: string,
  loopOfById: ReadonlyMap<string, string | undefined>,
): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([id]);
  for (let cur = loopOfById.get(id); cur && !seen.has(cur); cur = loopOfById.get(cur)) {
    seen.add(cur);
    chain.unshift(cur);
  }
  return chain;
}

/**
 * Paint each-lane edges with the colour of the loop they belong to: the For each itself
 * for its Each item link, else the loop the edge's source step runs in. Sets the
 * `--w6w-loop-color` custom property the `.w6w-edge-each` rule reads, so run-state
 * classes still compose over it. Same array when nothing needs painting.
 */
export function paintLoopEdges(
  edges: Edge[],
  tones: ReadonlyMap<string, number>,
  loopOfById: ReadonlyMap<string, string | undefined>,
): Edge[] {
  if (tones.size === 0) return edges;
  return edges.map((e) => {
    if (e.data?.when !== "each") return e;
    const owner = e.sourceHandle === EACH_SOURCE_HANDLE ? e.source : loopOfById.get(e.source);
    const tone = owner ? tones.get(owner) : undefined;
    if (tone === undefined) return e;
    return { ...e, style: { ...e.style, "--w6w-loop-color": loopToneVar(tone) } as Edge["style"] };
  });
}

/**
 * The colour custom property a card's root carries: a For each's own tone, read by its
 * Each item port. A loop-body step gets none — it looks exactly like a step outside a
 * loop; its dots are what mark it.
 */
export function loopCardStyle(
  id: string,
  tones: ReadonlyMap<string, number>,
): CSSProperties | undefined {
  const own = tones.get(id);
  return own === undefined
    ? undefined
    : ({ "--w6w-loop-color": loopToneVar(own) } as CSSProperties);
}

/** What the canvas paints loops from: each For each's tone, and each step's own loop. */
export type LoopPaint = {
  tones: ReadonlyMap<string, number>;
  loopOf: ReadonlyMap<string, string | undefined>;
};

/**
 * A string that changes only when a loop's membership does — the memo key for
 * {@link loopPaint}, so dragging a node does not hand every card a new context value.
 */
export function loopPaintKey(nodes: readonly StepNode[]): string {
  const rows: [string, 0 | 1, string?][] = [];
  for (const n of nodes) {
    const foreach = isForeachStep(n.data.step);
    if (foreach || n.data.loopOf) rows.push([n.id, foreach ? 1 : 0, n.data.loopOf]);
  }
  return JSON.stringify(rows);
}

/** Rebuild the {@link LoopPaint} a {@link loopPaintKey} describes. */
export function loopPaint(key: string): LoopPaint {
  const rows = JSON.parse(key) as [string, 0 | 1, string?][];
  return {
    tones: assignLoopTones(rows.filter((r) => r[1] === 1).map((r) => r[0])),
    loopOf: new Map(rows.map((r) => [r[0], r[2]])),
  };
}
