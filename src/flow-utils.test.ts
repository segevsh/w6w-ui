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
