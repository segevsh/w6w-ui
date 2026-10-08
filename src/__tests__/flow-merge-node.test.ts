// Run: node --test src/__tests__/flow-merge-node.test.ts   (Node 24, type-stripped)
//
// The `@w6w/control` · `merge` node: unbounded inbound ports, key→expression
// entries, and the palette hiding `aggregate` without un-resolving it.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge } from "@xyflow/react";
import { INTERNAL_NODES, internalNodeDef, nodePortsForStep } from "../flow-types.ts";
import type { FlowStep } from "../flow-types.ts";
import type { StepNode } from "../flow-utils.ts";
import { upstreamStateSources } from "../step-preview-state.ts";

function node(id: string, app = "@w6w/script", action = "run"): StepNode {
  return {
    id,
    type: "step",
    position: { x: 0, y: 0 },
    data: { step: { id, uses: { app, action } } as FlowStep, isInternal: false },
  } as StepNode;
}

test("A1: merge def has unbounded in-port and mode/entries params", () => {
  const def = internalNodeDef("@w6w/control", "merge");
  assert.ok(def);
  assert.deepEqual(
    def.params.map((p) => p.key),
    ["mode", "entries"],
  );
  const step = { id: "m", uses: { app: "@w6w/control", action: "merge" } } as FlowStep;
  assert.equal(nodePortsForStep(step).in, Number.POSITIVE_INFINITY);
});

test("A2: entries is an array of {key, value} objects", () => {
  const entries = internalNodeDef("@w6w/control", "merge")?.params.find((p) => p.key === "entries");
  assert.equal(entries?.type, "array");
  assert.equal(entries?.item?.type, "object");
  assert.deepEqual(
    entries?.item?.fields?.map((f) => f.key),
    ["key", "value"],
  );
});

test("A3: ƒx upstream options for a merge list both inbound steps", () => {
  const nodes = [node("A"), node("B"), node("m", "@w6w/control", "merge")];
  const edges = [
    { id: "a-m", source: "A", target: "m" },
    { id: "b-m", source: "B", target: "m" },
  ] as Edge[];
  const ids = upstreamStateSources("m", nodes, edges)
    .steps.map((s) => s.id)
    .sort();
  assert.deepEqual(ids, ["A", "B"]);
});

// The palette's control list is `group === "control" && !hidden` (StepBuilderModal).
test("A4: palette control list has merge, not aggregate; aggregate still resolves", () => {
  const palette = INTERNAL_NODES.filter((n) => n.group === "control" && !n.hidden).map(
    (n) => n.action,
  );
  assert.ok(palette.includes("merge"));
  assert.ok(!palette.includes("aggregate"));
  assert.ok(internalNodeDef("@w6w/control", "aggregate"));
});
