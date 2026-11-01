import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Edge } from "@xyflow/react";
import {
  LOOP_TONES,
  assignLoopTones,
  enclosingLoops,
  loopCardStyle,
  loopPaint,
  loopPaintKey,
  paintLoopEdges,
} from "../flow-loop-colors.ts";
import { EACH_SOURCE_HANDLE } from "../flow-types.ts";
import type { StepNode } from "../flow-utils.ts";

test("loop tones are stable per id and independent of input order", () => {
  const a = assignLoopTones(["for_each_1", "for_each_2", "for_each_3"]);
  const b = assignLoopTones(["for_each_3", "for_each_1", "for_each_2"]);
  assert.deepEqual([...a].sort(), [...b].sort());
  assert.equal(assignLoopTones(["for_each_1"]).get("for_each_1"), a.get("for_each_1"));
});

test("loop tones are distinct until the palette runs out", () => {
  const ids = Array.from({ length: LOOP_TONES }, (_, i) => `loop_${i}`);
  const tones = assignLoopTones(ids);
  assert.equal(new Set(tones.values()).size, LOOP_TONES);
  for (const t of tones.values()) assert.ok(t >= 1 && t <= LOOP_TONES);
  const more = assignLoopTones([...ids, "loop_extra"]);
  assert.equal(more.size, LOOP_TONES + 1);
});

test("enclosingLoops lists outermost first and survives a cycle", () => {
  const loopOf = new Map<string, string | undefined>([
    ["a", "inner"],
    ["inner", "outer"],
    ["outer", undefined],
  ]);
  assert.deepEqual(enclosingLoops("a", loopOf), ["outer", "inner"]);
  assert.deepEqual(enclosingLoops("outer", loopOf), []);
  const cyc = new Map([
    ["x", "y"],
    ["y", "x"],
  ]);
  assert.deepEqual(enclosingLoops("x", cyc), ["y"]);
});

const node = (id: string, step: unknown, loopOf?: string): StepNode =>
  ({ id, position: { x: 0, y: 0 }, data: { step, ...(loopOf ? { loopOf } : {}) } }) as StepNode;
const foreach = { id: "f", uses: { app: "@w6w/control", action: "foreach" } };
const plain = { id: "s", uses: { app: "acme", action: "go" } };

test("loopPaint keys on membership and paints each-lane edges by their loop", () => {
  const nodes = [
    node("f", foreach),
    node("a", plain, "f"),
    node("b", plain, "f"),
    node("z", plain),
  ];
  const key = loopPaintKey(nodes);
  assert.equal(loopPaintKey(nodes.map((n) => ({ ...n, position: { x: 9, y: 9 } }))), key);
  const paint = loopPaint(key);
  const tone = paint.tones.get("f");
  assert.ok(tone);
  const edges: Edge[] = [
    { id: "1", source: "f", target: "a", sourceHandle: EACH_SOURCE_HANDLE, data: { when: "each" } },
    { id: "2", source: "a", target: "b", data: { when: "each" } },
    { id: "3", source: "f", target: "z" },
  ];
  const out = paintLoopEdges(edges, paint.tones, paint.loopOf);
  const color = (e: Edge) => (e.style as Record<string, string> | undefined)?.["--w6w-loop-color"];
  assert.equal(color(out[0]), `var(--w6w-loop-${tone})`);
  assert.equal(color(out[1]), `var(--w6w-loop-${tone})`);
  assert.equal(out[2], edges[2]);
  assert.equal(paintLoopEdges(edges, new Map(), new Map()), edges);
});

// Loop-body steps are marked by their dots alone: no tint, no loop-coloured border.
test("only a For each carries a loop colour; its body steps carry none", () => {
  const tones = assignLoopTones(["f"]);
  assert.deepEqual(loopCardStyle("f", tones), {
    "--w6w-loop-color": `var(--w6w-loop-${tones.get("f")})`,
  });
  assert.equal(loopCardStyle("a", tones), undefined);
});

test("no stylesheet paints a loop-body step's card", () => {
  for (const file of ["../styles/_flow.scss", "../styles.css"]) {
    const css = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.ok(!css.includes("--w6w-loop-body-color"), `${file}: loop body colour`);
    for (const [, body] of css.matchAll(/w6w-node-in-loop[^{]*\{([^}]*)\}/g)) {
      assert.ok(!/background|border/.test(body), `${file}: in-loop card styled: ${body}`);
    }
  }
});
