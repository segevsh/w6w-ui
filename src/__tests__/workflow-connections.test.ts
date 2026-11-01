import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowStep, FlowWorkflow } from "../flow-types.ts";
import { flowToWorkflow, workflowToFlow } from "../flow-utils.ts";
import {
  centralizeConnections,
  connectionIdFor,
  connectionSourceNodes,
  selectNodeConnection,
  withConnectionRef,
} from "../workflow-connections.ts";

const legacy: FlowWorkflow = {
  manifestVersion: "2",
  id: "wf",
  name: "Workflow",
  nodes: [
    { id: "find", uses: { app: "eventbrite", action: "list", connection: "conn_a" } },
    { id: "create", uses: { app: "eventbrite", action: "create", connection: "conn_b" } },
    { id: "other", uses: { app: "other", action: "run", connection: "conn_c" } },
    { id: "empty", uses: { app: "eventbrite", action: "run" } },
  ],
};

test("legacy save centralizes IDs, preserves independent selections and round-trips", () => {
  const graph = workflowToFlow(legacy);
  const saved = flowToWorkflow(legacy, graph.nodes, graph.edges);
  assert.deepEqual(saved.connections, {
    find: { app: "eventbrite", connection: "conn_a" },
    create: { app: "eventbrite", connection: "conn_b" },
    other: { app: "other", connection: "conn_c" },
  });
  assert.equal(saved.nodes[0].uses.connection, undefined);
  assert.equal(saved.nodes[0].uses.connectionRef, "find");
  const reloaded = workflowToFlow(saved);
  assert.deepEqual(flowToWorkflow(saved, reloaded.nodes, reloaded.edges), saved);
  assert.equal(legacy.nodes[0].uses.connection, "conn_a");
});

test("source candidates are same-app configured nodes, regardless of graph ancestry", () => {
  const wf = centralizeConnections(legacy);
  assert.deepEqual(
    connectionSourceNodes(wf.nodes[1], wf.nodes, wf.connections ?? {}).map((n) => n.id),
    ["find"],
  );
});

test("share, switch only this node, and explicitly edit the shared map", () => {
  const wf = centralizeConnections(legacy);
  const shared = withConnectionRef(wf.nodes[1], wf.nodes[0].uses.connectionRef ?? "");
  const nodes = [wf.nodes[0], shared];
  const switched = selectNodeConnection(shared, "conn_new", nodes, wf.connections ?? {});
  assert.notEqual(switched.step.uses.connectionRef, "find");
  assert.equal(connectionIdFor(nodes[0], switched.connections), "conn_a");
  assert.equal(connectionIdFor(switched.step, switched.connections), "conn_new");
  const editedMap = { ...wf.connections, find: { app: "eventbrite", connection: "conn_shared" } };
  assert.deepEqual(
    nodes.map((n) => connectionIdFor(n, editedMap)),
    ["conn_shared", "conn_shared"],
  );
  // No coupling to node IDs or execution: removing/renaming the original source is safe.
  const renamed: FlowStep = { ...shared, id: "renamed" };
  assert.equal(connectionIdFor(renamed, editedMap), "conn_shared");
});

test("missing/foreign refs never fall back to an inline credential", () => {
  const bad: FlowStep = {
    id: "bad",
    uses: { app: "other", action: "go", connectionRef: "find", connection: "ignored" },
  };
  assert.equal(connectionIdFor(bad, centralizeConnections(legacy).connections), undefined);
  assert.equal(connectionIdFor(bad, {}), undefined);
});
