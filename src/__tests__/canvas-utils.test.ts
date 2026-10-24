// Run: node --test src/__tests__/canvas-utils.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowCanvas } from "../canvas-types.ts";
import {
  assignMembership,
  clampCanvas,
  pruneSectionMembers,
  renameSectionMember,
  sectionsContaining,
  withCanvasGeometry,
} from "../canvas-utils.ts";

const sec = (id: string, nodes: string[]) => ({
  id,
  title: id,
  color: "#aabbcc",
  position: { x: 1, y: 2 },
  size: { width: 30, height: 40 },
  nodes,
});
const note = (id: string, content = "hi") => ({
  id,
  color: "#aabbcc",
  position: { x: 1, y: 2 },
  size: { width: 30, height: 40 },
  content,
});
const base = (): FlowCanvas => ({
  notes: [note("n1")],
  sections: [sec("s1", ["a", "b"]), sec("s2", ["c"])],
});

test("withCanvasGeometry rounds live geometry to integers", () => {
  const out = withCanvasGeometry(base(), true, {
    n1: { position: { x: 1.4, y: 2.6 }, size: { width: 10.5, height: 20.49 } },
    s1: { position: { x: -0.5, y: 3.5 } },
  });
  assert.deepEqual(out.notes?.[0].position, { x: 1, y: 3 });
  assert.deepEqual(out.notes?.[0].size, { width: 11, height: 20 });
  assert.deepEqual(out.sections?.[0].position, { x: -0, y: 4 });
  assert.deepEqual(out.sections?.[0].size, { width: 30, height: 40 });
  const n0 = out.notes?.[0];
  for (const v of [...Object.values(n0?.position ?? {}), ...Object.values(n0?.size ?? {})])
    assert.ok(Number.isInteger(v));
});

test("withCanvasGeometry(false) keeps stored geometry byte-identical", () => {
  const c = base();
  const out = withCanvasGeometry(c, false, { n1: { position: { x: 99, y: 99 } } });
  assert.equal(JSON.stringify(out), JSON.stringify(c));
});

test("prune removes the id from every section", () => {
  const c = assignMembershipRaw();
  const out = pruneSectionMembers(c, "a");
  assert.deepEqual(sectionsContaining(out, "a"), []);
  assert.deepEqual(
    out.sections?.map((s) => s.nodes),
    [["b"], []],
  );
});
function assignMembershipRaw(): FlowCanvas {
  return { sections: [sec("s1", ["a", "b"]), sec("s2", ["a"])] };
}

test("rename maps the id", () => {
  const out = renameSectionMember(base(), "a", "z");
  assert.deepEqual(out.sections?.[0].nodes, ["z", "b"]);
});

test("assignMembership moves a node out of its previous section", () => {
  const out = assignMembership(base(), "s2", ["a", "c"]);
  assert.deepEqual(out.sections?.[0].nodes, ["b"]);
  assert.deepEqual(out.sections?.[1].nodes, ["a", "c"]);
  assert.deepEqual(sectionsContaining(out, "a"), ["s2"]);
});

test("clampCanvas trims to 200/200 and 10240 bytes without splitting a codepoint", () => {
  const notes = Array.from({ length: 250 }, (_, i) => note(`n${i}`));
  const sections = Array.from({ length: 250 }, (_, i) => sec(`s${i}`, []));
  const out = clampCanvas({ notes, sections });
  assert.equal(out.notes?.length, 200);
  assert.equal(out.sections?.length, 200);
  // "é" = 2 bytes; 10241 bytes of ASCII + multibyte tail
  const big = clampCanvas({ notes: [note("x", `${"a".repeat(10239)}é`)] });
  const c = big.notes?.[0].content;
  assert.equal(new TextEncoder().encode(c ?? "").length, 10239);
  assert.equal(c, "a".repeat(10239));
  const exact = "é".repeat(5120);
  assert.equal(clampCanvas({ notes: [note("y", exact)] }).notes?.[0].content, exact);
  assert.equal(clampCanvas({ notes: [note("y", `${exact}é`)] }).notes?.[0].content, exact);
});
