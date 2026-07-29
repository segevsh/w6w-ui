// Run: node --test src/flow-utils.test.ts  (Node 24, type-stripped)
//
// The `Edge.when` round-trip (core rfcs/workflow.md · "Amendment — 2026-07-29:
// failure-conditioned edges"). The trap this suite exists to pin:
// `flowToWorkflow` used to collapse every edge to `{ from, to }`, so an
// authored error edge was silently dropped on save and the feature presented as
// an engine fault.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge } from "@xyflow/react";
import { renameStepInEdges } from "./flow-connect.ts";
import type { FlowWorkflow } from "./flow-types.ts";
import { type StepNode, flowToWorkflow, workflowToFlow } from "./flow-utils.ts";

/** Three steps, so an edge can be authored between any pair. */
const WF: FlowWorkflow = {
  manifestVersion: "2",
  id: "wf_test",
  name: "test",
  steps: [
    { id: "a", uses: { app: "@w6w/script", action: "run" } },
    { id: "b", uses: { app: "@w6w/script", action: "run" } },
    { id: "c", uses: { app: "@w6w/script", action: "run" } },
  ],
  edges: [{ from: "a", to: "b" }],
};

/** A React Flow edge as the canvas would hold it, carrying an explicit lane. */
function rfEdge(source: string, target: string, when: "success" | "error"): Edge {
  return { id: `${source}->${target}`, source, target, data: { when } };
}

/** The nodes flowToWorkflow needs to keep the step list intact. */
function nodesOf(wf: FlowWorkflow): StepNode[] {
  return workflowToFlow(wf).nodes;
}

test("workflowToFlow — an error edge carries data.when + the error class; a plain edge is success", () => {
  const { edges } = workflowToFlow({
    ...WF,
    edges: [
      { from: "a", to: "b", when: "error" },
      { from: "b", to: "c" },
    ],
  });

  const err = edges[0];
  assert.equal(err.data?.when, "error");
  assert.match(String(err.className ?? ""), /w6w-edge-error/);

  const ok = edges[1];
  assert.equal(ok.data?.when, "success");
  assert.doesNotMatch(String(ok.className ?? ""), /w6w-edge-error/);
});

test("flowToWorkflow — an RF edge carrying data.when === 'error' emits { from, to, when }", () => {
  const next = flowToWorkflow(WF, nodesOf(WF), [rfEdge("a", "b", "error")]);
  assert.deepEqual(next.edges, [{ from: "a", to: "b", when: "error" }]);
});

test("flowToWorkflow — a success edge emits exactly { from, to } (no stray `when` key)", () => {
  const next = flowToWorkflow(WF, nodesOf(WF), [rfEdge("a", "b", "success")]);
  // Deep equality, not a field check: a `when: "success"` or `when: undefined`
  // key would break every persisted definition's byte-identical round-trip.
  assert.deepEqual(next.edges, [{ from: "a", to: "b" }]);
});

test("round-trip — flowToWorkflow(workflowToFlow(wf)) reproduces the authored edges exactly", () => {
  const wf: FlowWorkflow = {
    ...WF,
    edges: [
      { from: "a", to: "c" },
      { from: "a", to: "b", when: "error" },
      { from: "b", to: "c" },
    ],
  };
  const { nodes, edges } = workflowToFlow(wf);
  assert.deepEqual(flowToWorkflow(wf, nodes, edges).edges, wf.edges);
});

// ── The same-target pair (D-T1-8): one success edge AND one error edge between
// the SAME two steps. The model permits it, so an error edge's React Flow id is
// qualified with `:error`. Until per-lane exit capacity (T3.2.2) the pair was
// unauthorable, which is why the qualifier had no regression coverage — dropping
// it left this suite fully green. These three cases pin it.

/** `a → b` twice: once as success, once as the error lane. */
const SAME_TARGET_PAIR: FlowWorkflow = {
  ...WF,
  edges: [
    { from: "a", to: "b" },
    { from: "a", to: "b", when: "error" },
  ],
};

test("same-target pair — the success and error edges get DISTINCT React Flow ids", () => {
  const { edges } = workflowToFlow(SAME_TARGET_PAIR);
  assert.deepEqual(
    edges.map((e) => e.id),
    ["a->b", "a->b:error"],
  );
});

test("same-target pair — survives an id-keyed Map (React Flow's store) with 2 entries", () => {
  // This is the assertion that actually models the loss: React Flow keys its
  // edge store by id, so two edges sharing one id collapse to one and a whole
  // lane disappears from the canvas without any error.
  const { edges } = workflowToFlow(SAME_TARGET_PAIR);
  const store = new Map(edges.map((e) => [e.id, e]));
  assert.equal(store.size, 2);
  assert.equal(store.get("a->b")?.data?.when, "success");
  assert.equal(store.get("a->b:error")?.data?.when, "error");
});

test("same-target pair — round-trips deep-equal with the error edge FIRST as well as second", () => {
  for (const order of [
    SAME_TARGET_PAIR.edges ?? [],
    [...(SAME_TARGET_PAIR.edges ?? [])].reverse(),
  ]) {
    const wf: FlowWorkflow = { ...WF, edges: order };
    const { nodes, edges } = workflowToFlow(wf);
    assert.equal(new Map(edges.map((e) => [e.id, e])).size, 2, "both lanes must reach the canvas");
    assert.deepEqual(flowToWorkflow(wf, nodes, edges).edges, order);
  }
});

test("renaming a step keeps the lane qualifier — a same-target pair stays TWO edges", () => {
  // `updateStep`'s id rewrite (via renameStepInEdges) used to rebuild every id
  // as `${source}->${target}`, dropping `:error` — so renaming `a` collapsed the
  // pair into one edge. Both id sites now mint through the shared `flowEdgeId`.
  const { edges } = workflowToFlow(SAME_TARGET_PAIR);
  const renamed = renameStepInEdges(edges, "a", "sendgrid");
  assert.deepEqual(
    renamed.map((e) => e.id),
    ["sendgrid->b", "sendgrid->b:error"],
  );
  assert.equal(new Map(renamed.map((e) => [e.id, e])).size, 2);
  // The endpoints and the lanes both moved across intact.
  assert.deepEqual(
    renamed.map((e) => `${e.source}->${e.target}:${e.data?.when}`),
    ["sendgrid->b:success", "sendgrid->b:error"],
  );
});
