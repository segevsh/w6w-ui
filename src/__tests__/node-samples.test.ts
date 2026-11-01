// Run: node --test src/__tests__/node-samples.test.ts  (Node 24, type-stripped)
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StepNode } from "../flow-utils.ts";
import {
  type NodeSample,
  type NodeShape,
  effectiveNodeOutput,
  effectiveNodeOutputs,
  indexNodeSamples,
  previewNodeOutputs,
  shapeToSkeleton,
  splitNodeOutputs,
} from "../node-samples.ts";
import { inferOutputFields } from "../output-shape.ts";
import { upstreamSampleValues, upstreamStateSources } from "../step-preview-state.ts";

function node(id: string, app = "@w6w/script", action = "run"): StepNode {
  return {
    id,
    type: "step",
    position: { x: 0, y: 0 },
    data: { step: { id, uses: { app, action } }, isInternal: false },
  };
}
function edge(source: string, target: string) {
  return { id: `${source}->${target}`, source, target };
}
function sample(nodeId: string, over: Partial<NodeSample> = {}): NodeSample {
  return {
    nodeId,
    shape: { type: "object", fields: { name: { type: "string" } } },
    source: "run",
    updatedAt: "2026-11-01T10:00:00Z",
    ...over,
  };
}

const EVENT_SHAPE: NodeShape = {
  type: "object",
  fields: {
    name: { type: "object", fields: { text: { type: "string" } } },
    capacity: { type: "number" },
    online: { type: "boolean" },
    venue: { type: "null" },
    extra: { type: "unknown" },
    tags: { type: "array", items: { type: "string" } },
    empty: { type: "array" },
  },
};

test("shapeToSkeleton — scalars, objects, arrays", () => {
  assert.equal(shapeToSkeleton({ type: "string" }), "");
  assert.equal(shapeToSkeleton({ type: "number" }), 0);
  assert.equal(shapeToSkeleton({ type: "boolean" }), false);
  assert.equal(shapeToSkeleton({ type: "null" }), null);
  assert.equal(shapeToSkeleton({ type: "unknown" }), null);
  assert.deepEqual(shapeToSkeleton({ type: "array" }), []);
  assert.deepEqual(shapeToSkeleton(EVENT_SHAPE), {
    name: { text: "" },
    capacity: 0,
    online: false,
    venue: null,
    extra: null,
    tags: [""],
    empty: [],
  });
});

test("shapeToSkeleton — inferred fields match the real value's", () => {
  const real = {
    name: { text: "Launch" },
    capacity: 40,
    online: true,
    venue: null,
    extra: { anything: 1 },
    tags: ["a", "b"],
    empty: [],
  };
  // `extra` is `unknown` in the shape, so only its own key is guaranteed — compare the rest.
  const keys = (v: unknown) =>
    (inferOutputFields(v) ?? []).map((f) => f.key).filter((k) => !k.startsWith("extra."));
  assert.deepEqual(keys(shapeToSkeleton(EVENT_SHAPE)), keys(real));
});

test("effectiveNodeOutput — fresh in-memory output beats the persisted sample", () => {
  const persisted = indexNodeSamples([sample("a", { sample: { name: "persisted" } })]);
  assert.deepEqual(effectiveNodeOutput("a", { a: { name: "fresh" } }, persisted), {
    name: "fresh",
  });
});

test("effectiveNodeOutput — a persisted sample STRICTLY newer than the fresh run wins", () => {
  const persisted = indexNodeSamples([sample("a", { sample: { id: 1 } })]);
  const fresh = { a: { old: true } };
  assert.deepEqual(effectiveNodeOutput("a", fresh, persisted, { a: "2026-10-31T00:00:00Z" }), {
    id: 1,
  });
  // Same instant or older → fresh still wins.
  assert.deepEqual(effectiveNodeOutput("a", fresh, persisted, { a: "2026-11-01T10:00:00Z" }), {
    old: true,
  });
});

test("effectiveNodeOutput — persisted sample beats the shape skeleton; omitted sample → skeleton", () => {
  const withSample = indexNodeSamples([sample("a", { sample: { name: "Ada" } })]);
  assert.deepEqual(effectiveNodeOutput("a", {}, withSample), { name: "Ada" });
  const omitted = indexNodeSamples([sample("a", { sample: { name: "x" }, sampleOmitted: true })]);
  assert.deepEqual(effectiveNodeOutput("a", {}, omitted), { name: "" });
  const shapeOnly = indexNodeSamples([sample("a")]);
  assert.deepEqual(effectiveNodeOutput("a", {}, shapeOnly), { name: "" });
  assert.equal(effectiveNodeOutput("zz", {}, shapeOnly), undefined);
});

test("previewNodeOutputs — real values only, never a skeleton", () => {
  const persisted = indexNodeSamples([sample("a"), sample("b", { sample: { name: "Bo" } })]);
  assert.deepEqual(previewNodeOutputs({ c: 1 }, persisted), { c: 1, b: { name: "Bo" } });
  assert.deepEqual(effectiveNodeOutputs({ c: 1 }, persisted), {
    c: 1,
    a: { name: "" },
    b: { name: "Bo" },
  });
});

test("simulated reload — no in-memory outputs, only persisted samples: the picker offers the keys", () => {
  // trigger-less chain: fetch → shape (a downstream node added after the last run).
  const nodes = [node("fetch"), node("only_shape"), node("added")];
  const edges = [edge("fetch", "only_shape"), edge("only_shape", "added")];
  const persisted = indexNodeSamples([
    sample("fetch", {
      shape: {
        type: "object",
        fields: { user: { type: "object", fields: { email: { type: "string" } } } },
      },
      sample: { user: { email: "a@b.c" } },
      source: "step_test",
    }),
    sample("only_shape", {
      shape: { type: "object", fields: { total: { type: "number" } } },
      sampleOmitted: true,
      source: "node_run",
    }),
  ]);
  const fresh = {}; // after a reload nothing is in memory
  const tiers = splitNodeOutputs(fresh, persisted);
  const { steps } = upstreamStateSources("added", nodes, edges, {
    testOutputs: tiers.fresh,
    persistedOutputs: tiers.persisted,
  });
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  assert.deepEqual(
    byId.fetch.outputs?.map((o) => o.key),
    ["user", "user.email"],
  );
  assert.equal(byId.fetch.outputsFrom, "persisted");
  assert.deepEqual(
    byId.only_shape.outputs?.map((o) => o.key),
    ["total"],
  );
  assert.equal(byId.only_shape.outputsFrom, "persisted");
  // The ƒx previews read the real persisted value, and nothing made up for the shape-only node.
  const values = upstreamSampleValues(steps, previewNodeOutputs(fresh, persisted), {});
  assert.equal(values["nodes.fetch.output.user.email"], "a@b.c");
  assert.equal(values["nodes.only_shape.output"], undefined);
});

test("no loadNodeSamples (no persisted rows) → exactly the in-memory outputs, as before", () => {
  const fresh = { a: { x: 1 } };
  assert.deepEqual(effectiveNodeOutputs(fresh, indexNodeSamples([])), fresh);
  assert.deepEqual(previewNodeOutputs(fresh, indexNodeSamples(undefined)), fresh);
});
