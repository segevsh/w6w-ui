import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowStep, FlowWorkflow } from "../flow-types.ts";
import { flowToWorkflow, workflowToFlow } from "../flow-utils.ts";
import {
  type FlowConnections,
  centralizeConnections,
  connectionIdFor,
  connectionSourceNodes,
  connectionUsers,
  defaultConnectionFor,
  replaceWorkflowConnection,
  selectNodeConnection,
  withConnectionRef,
  withDefaultConnection,
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

test("an empty draft without nodes stays loadable", () => {
  const empty = { id: "draft", name: "New workflow" } as FlowWorkflow;
  assert.equal(centralizeConnections(empty), empty);
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

const choices = [
  { id: "conn_a", appId: "eventbrite", authKey: "token", state: "connected" },
  { id: "conn_b", appId: "eventbrite", authKey: "token", state: "connected" },
];
const draft = { id: "new", uses: { app: "eventbrite", action: "" } };

test("new nodes inherit the last configured same-app node, including disconnected tracks", () => {
  const wf = centralizeConnections(legacy);
  assert.deepEqual(defaultConnectionFor(draft, choices, wf.nodes, wf.connections ?? {}), {
    connectionRef: "create",
  });
  assert.deepEqual(defaultConnectionFor(draft, choices, wf.nodes, wf.connections ?? {}, "conn_a"), {
    connection: "conn_a",
  });
  assert.deepEqual(
    defaultConnectionFor(draft, choices.slice(0, 1), wf.nodes, wf.connections ?? {}),
    {
      connectionRef: "find",
    },
  );
  assert.deepEqual(defaultConnectionFor(draft, choices, legacy.nodes, {}), {
    connection: "conn_b",
  });
});

test("zero-credential apps default to Default, but existing workflow accounts take priority", () => {
  const defaults = withDefaultConnection(
    "eventbrite",
    [{ key: "zero-credential", type: "custom" }],
    choices,
  );
  assert.equal(defaults.length, 3);
  assert.deepEqual(defaultConnectionFor(draft, defaults, [], {}), {
    connection: "zerocred:eventbrite",
  });
  assert.equal(defaultConnectionFor(draft, defaults, legacy.nodes, {}).connection, "conn_b");
  assert.equal(withDefaultConnection("eventbrite", [], defaults), defaults);
  assert.equal(
    withDefaultConnection(
      "eventbrite",
      [{ key: "token", type: "apiKey", autoSatisfied: true }],
      choices,
    ),
    choices,
  );
  assert.equal(
    withDefaultConnection(
      "eventbrite",
      [{ key: "zero-credential", type: "custom", available: false }],
      choices,
    ),
    choices,
  );
  assert.equal(
    withDefaultConnection(
      "eventbrite",
      [{ key: "tenant", type: "tenantAuth", autoSatisfied: true }],
      [],
    ).at(0)?.builtIn,
    true,
  );
  assert.deepEqual(defaultConnectionFor(draft, [{ ...choices[0], appId: "other" }], [], {}), {});
});

test("account usage and all-node replacement include separate refs without touching other apps", () => {
  const wf = centralizeConnections({
    ...legacy,
    nodes: [
      ...legacy.nodes,
      { id: "again", uses: { app: "eventbrite", action: "get", connection: "conn_b" } },
      { id: "foreign", uses: { app: "other", action: "run", connection: "conn_b" } },
    ],
  });
  const connections: FlowConnections = {
    ...wf.connections,
    unused: { app: "eventbrite", connection: "conn_b" },
  };
  assert.deepEqual(
    connectionUsers("eventbrite", "conn_b", wf.nodes, connections).map((n) => n.id),
    ["create", "again"],
  );
  const replaced = replaceWorkflowConnection(
    "eventbrite",
    "conn_b",
    "conn_a",
    wf.nodes,
    connections,
  );
  assert.equal(connectionIdFor(wf.nodes[1], replaced), "conn_a");
  assert.equal(connectionIdFor(wf.nodes[4], replaced), "conn_a");
  assert.equal(connectionIdFor(wf.nodes[5], replaced), "conn_b");
  assert.equal(replaced.unused.connection, "conn_b");
  assert.equal(connections.create.connection, "conn_b", "does not mutate the previous snapshot");
  const individual = selectNodeConnection(wf.nodes[1], "conn_a", wf.nodes, connections);
  assert.equal(connectionIdFor(wf.nodes[4], individual.connections), "conn_b");
});
