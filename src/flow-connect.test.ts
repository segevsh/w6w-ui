// Run: node --test src/flow-connect.test.ts   (Node 24, type-stripped)
//
// The exit-port capacity rule. The trap this suite exists to pin: `applyConnect`
// used to free the source's exit port lane-BLINDLY, so the moment a second wire
// was dragged out of a step the first one was deleted — which made a
// `send → (error) → fallback` shape literally unauthorable. Capacity is now
// per-lane at the SOURCE and deliberately lane-blind at the TARGET; both halves
// are asserted here, because "make it symmetric" is the plausible cleanup that
// would let a `ports.in: 1` node silently accept two inbound edges.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge } from "@xyflow/react";
import { applyConnect, canConnect, edgeLane } from "./flow-connect.ts";
import type { NodePorts } from "./flow-types.ts";
import type { StepNode } from "./flow-utils.ts";

/** A canvas node for step `id`, optionally with persisted per-step ports. */
function node(id: string, ports?: NodePorts): StepNode {
  return {
    id,
    type: "step",
    position: { x: 0, y: 0 },
    data: {
      step: { id, uses: { app: "@w6w/script", action: "run" }, ...(ports ? { ports } : {}) },
      isInternal: false,
    },
  };
}

/** An edge as the canvas holds it, carrying an explicit lane in `data`. */
function rf(source: string, target: string, when: "success" | "error"): Edge {
  const id = when === "error" ? `${source}->${target}:error` : `${source}->${target}`;
  return { id, source, target, data: { when } };
}

/**
 * A LEGACY edge: authored before the lane was stamped (or synthesised by React
 * Flow), so it carries no `data` at all. Omitted ⇒ success.
 */
function legacy(source: string, target: string): Edge {
  return { id: `${source}->${target}`, source, target };
}

/** The `source → target` pairs of an edge set, for readable assertions. */
function pairs(edges: Edge[]): string[] {
  return edges.map((e) => `${e.source}->${e.target}:${edgeLane(e)}`);
}

const ABCD = [node("a"), node("b"), node("c"), node("d")];

test("success lane is still single-slot — a second success edge RE-POINTS the wire", () => {
  // The deliberate `out: 1` UX, unchanged by this node. Asserted for BOTH
  // spellings of a success edge: the explicit `data.when` stamp and a legacy
  // `data`-less edge, which must read as success (omitted ⇒ success).
  for (const existing of [rf("a", "c", "success"), legacy("a", "c")]) {
    const next = applyConnect("a", "b", ABCD, [existing]);
    assert.ok(next, "the connection must be allowed");
    assert.deepEqual(pairs(next), ["a->b:success"]);
    assert.equal(next.filter((e) => e.source === "a").length, 1);
  }
});

test("error lane does NOT compete with success — a step holds one of each", () => {
  const next = applyConnect("a", "b", ABCD, [rf("a", "c", "success")], "error");
  assert.ok(next, "the connection must be allowed");
  // This is the whole point of the node: a->c survives the error drag.
  assert.deepEqual(pairs(next), ["a->c:success", "a->b:error"]);
  assert.equal(next.filter((e) => e.source === "a").length, 2);
  assert.equal(next.find((e) => e.target === "b")?.id, "a->b:error");
});

test("error lane is single-slot too — a second error edge re-points it, success untouched", () => {
  const next = applyConnect(
    "a",
    "d",
    ABCD,
    [rf("a", "c", "success"), rf("a", "b", "error")],
    "error",
  );
  assert.ok(next, "the connection must be allowed");
  assert.deepEqual(pairs(next), ["a->c:success", "a->d:error"]);
});

test("target entry capacity stays LANE-BLIND — a ports.in:1 step keeps one inbound", () => {
  // A lane-partitioned target rule (the plausible "symmetry" cleanup) would let
  // this 1-in node hold two inbound edges at once. `ports.in` alone governs it.
  const nodes = [node("a"), node("b"), node("t", { in: 1, out: 1 })];
  const next = applyConnect("b", "t", nodes, [rf("a", "t", "success")], "error");
  assert.ok(next, "the connection must be allowed");
  assert.deepEqual(pairs(next), ["b->t:error"]);
  assert.equal(next.filter((e) => e.target === "t").length, 1);
});

test("a multi-in target still fans in — ports.in:10 keeps a success AND an error inbound", () => {
  const nodes = [node("a"), node("b"), node("t", { in: 10, out: 1 })];
  const next = applyConnect("b", "t", nodes, [rf("a", "t", "success")], "error");
  assert.ok(next, "the connection must be allowed");
  assert.deepEqual(pairs(next), ["a->t:success", "b->t:error"]);
});

test("canConnect is unchanged — a duplicate pair and a self-loop are still rejected", () => {
  // D-T1-8 lets the MODEL hold a success and an error edge to the same target;
  // the v1 EDITOR declines to author that pair, and this pins the decision.
  assert.equal(canConnect("a", "b", ABCD, [rf("a", "b", "success")]), false);
  // ...and the check is lane-blind, so the error drag onto the same pair is
  // refused as well — `applyConnect` returns null rather than an edge set.
  assert.equal(applyConnect("a", "b", ABCD, [rf("a", "b", "success")], "error"), null);
  assert.equal(canConnect("a", "a", ABCD, []), false);
  assert.equal(canConnect("a", "b", ABCD, []), true);
});
