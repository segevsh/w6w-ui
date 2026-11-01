import assert from "node:assert/strict";
import { test } from "node:test";
import { applyConnect, renameStepInEdges } from "../flow-connect.ts";
import { type FlowWorkflow, ROUTER_APP, nodePortsForStep } from "../flow-types.ts";
import { flowToWorkflow, workflowToFlow } from "../flow-utils.ts";
import { edgeRunState } from "../run-visuals.ts";

const routes = [1, 2, 3, 4].map((n) => ({
  id: `route_${n}`,
  label: `Route ${n}`,
  condition: false,
}));
const workflow = {
  id: "router",
  name: "Router",
  nodes: [
    {
      id: "router",
      uses: { app: ROUTER_APP, action: "route" },
      with: { routes: [...routes, { id: "default", default: true }] },
    },
    ...[1, 2, 3, 4, 5].map((n) => ({ id: `path_${n}`, uses: { app: "example", action: "run" } })),
  ],
  edges: [],
} as unknown as FlowWorkflow;

test("five router output ports connect independently and round-trip with stable route ids", () => {
  const graph = workflowToFlow(workflow);
  assert.equal(nodePortsForStep(workflow.nodes[0]).out, 5);
  let edges = graph.edges;
  for (let n = 1; n <= 5; n++) {
    const route = n === 5 ? "default" : `route_${n}`;
    const next = applyConnect(
      "router",
      `path_${n}`,
      graph.nodes,
      edges,
      "success",
      undefined,
      route,
    );
    assert.ok(next);
    edges = next;
    assert.equal(edges.at(-1)?.sourceHandle, `route:${route}`);
  }
  assert.equal(
    applyConnect("router", "path_2", graph.nodes, edges, "success", undefined, "route_1"),
    null,
  );
  const saved = flowToWorkflow(workflow, graph.nodes, edges);
  assert.deepEqual(
    saved.edges?.map((e) => e.route),
    ["route_1", "route_2", "route_3", "route_4", "default"],
  );
  const loaded = workflowToFlow(saved);
  assert.deepEqual(
    loaded.edges.map((e) => e.sourceHandle),
    edges.map((e) => e.sourceHandle),
  );
  assert.deepEqual(
    renameStepInEdges(edges, "router", "renamed").map((e) => e.data?.route),
    saved.edges?.map((e) => e.route),
  );
});

test("two ports can share a destination with multiple inputs", () => {
  const graph = workflowToFlow(workflow);
  graph.nodes[1].data.step.ports = { in: "many", out: 1 };
  const first = applyConnect("router", "path_1", graph.nodes, [], "success", undefined, "route_1");
  assert.ok(first);
  const both = applyConnect(
    "router",
    "path_1",
    graph.nodes,
    first,
    "success",
    undefined,
    "route_2",
  );
  assert.equal(both?.length, 2);
  assert.notEqual(both?.[0].id, both?.[1].id);
});

test("route visuals mark only the selected port taken", () => {
  const run = {
    status: "succeeded" as const,
    nodes: { router: { status: "succeeded" as const, output: { route: "route_2" } } },
  };
  assert.equal(edgeRunState(run, "router", "success", "route_1"), "skipped");
  assert.equal(edgeRunState(run, "router", "success", "route_2"), "taken");
});
