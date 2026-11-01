import assert from "node:assert/strict";
import { test } from "node:test";
import { FlowEditHistory, captureFlowEdit, restoreFlowEdit } from "../flow-history.ts";
import type { FlowWorkflow } from "../flow-types.ts";
import { flowToWorkflow, workflowToFlow } from "../flow-utils.ts";

const base: FlowWorkflow = {
  manifestVersion: "2",
  id: "wf_history",
  name: "History",
  nodes: [
    { id: "a", uses: { app: "example", action: "get", connectionRef: "account" } },
    { id: "b", uses: { app: "example", action: "set", connectionRef: "account" } },
  ],
  connections: { account: { app: "example", connection: "conn_a" } },
  edges: [{ from: "a", to: "b", when: "error" }],
};
const snapshot = (wf = base) => {
  const flow = workflowToFlow(wf);
  return captureFlowEdit(wf, flow.nodes, flow.edges, wf.connections ?? {}, wf.canvas ?? {});
};

test("undo restores a deletion and its edges; redo reapplies it", () => {
  const initial = snapshot();
  const history = new FlowEditHistory(initial);
  const deleted = snapshot({ ...base, nodes: [base.nodes[1]], edges: [] });
  history.record(deleted);
  assert.deepEqual(history.undo(), initial);
  assert.deepEqual(history.redo(), deleted);
  assert.equal(history.redo(), undefined);
});

test("shared account edits restore the binding and all consumers together", () => {
  const initial = snapshot();
  const history = new FlowEditHistory(initial);
  history.record({
    ...initial,
    connections: { account: { app: "example", connection: "conn_b" } },
  });
  const restored = history.undo();
  assert.ok(restored);
  assert.equal(restored.connections.account.connection, "conn_a");
  assert.deepEqual(
    restored.nodes.map((n) => n.uses.connectionRef),
    ["account", "account"],
  );
});

test("an empty parameter object emitted by a form is not an edit", () => {
  const history = new FlowEditHistory(snapshot());
  history.record(snapshot({ ...base, nodes: base.nodes.map((n) => ({ ...n, with: {} })) }));
  assert.equal(history.undo(), undefined);
});

test("one field focus groups typing; a later field is a separate edit; new edits discard redo", () => {
  const initial = snapshot();
  const history = new FlowEditHistory(initial);
  const field = {};
  const edit = (notes: string) => ({
    ...initial,
    nodes: [{ ...initial.nodes[0], notes }, initial.nodes[1]],
  });
  history.record(edit("h"), field);
  history.record(edit("hi"), field);
  history.record(edit("hi!"), {});
  assert.deepEqual(history.undo(), edit("hi"));
  assert.deepEqual(history.undo(), initial);
  history.record(edit("new"));
  assert.equal(history.redo(), undefined);
  assert.deepEqual(history.undo(), initial);
});

test("selection, run paint and viewport do not create history entries or clear redo", () => {
  const initial = snapshot();
  const history = new FlowEditHistory(initial);
  history.record({ ...initial, nodes: initial.nodes.slice(1), edges: [] });
  history.undo();
  const flow = workflowToFlow(base);
  const painted = flow.nodes.map((n) => ({
    ...n,
    selected: true,
    data: { ...n.data, stepStatus: "succeeded" as const, runStatus: "succeeded" as const },
  }));
  history.record(
    captureFlowEdit(
      { ...base, settings: { viewport: { x: 100, y: 200, zoom: 2 } } },
      painted,
      flow.edges,
      base.connections ?? {},
      {},
    ),
  );
  assert.ok(history.redo());
  assert.deepEqual(history.undo(), initial);
  assert.equal(history.undo(), undefined);
});

test("restoring preserves current workflow metadata and camera while recovering live positions", () => {
  const original = { ...base, settings: { savePosition: false } };
  const flow = workflowToFlow(original);
  flow.nodes[0].position = { x: 321, y: 123 };
  const saved = captureFlowEdit(original, flow.nodes, flow.edges, base.connections ?? {}, {});
  const latest = {
    ...original,
    displayName: "Updated elsewhere",
    settings: { savePosition: false, viewport: { x: 10, y: 20, zoom: 0.5 } },
  };
  const restored = restoreFlowEdit(latest, saved);
  assert.deepEqual(restored.nodes[0].position, { x: 321, y: 123 });
  const emitted = flowToWorkflow(latest, restored.nodes, restored.edges);
  assert.equal(emitted.displayName, "Updated elsewhere");
  assert.deepEqual(emitted.settings, latest.settings);
  assert.equal(emitted.nodes[0].position, undefined);
});

test("history owns immutable copies, has a bound, and resets between workflows", () => {
  const initial = snapshot();
  const history = new FlowEditHistory(initial, 2);
  for (const notes of ["1", "2", "3"]) {
    initial.nodes[0].notes = notes;
    history.record(initial);
  }
  assert.equal(history.undo()?.nodes[0].notes, "2");
  assert.equal(history.undo()?.nodes[0].notes, "1");
  assert.equal(history.undo(), undefined);
  history.reset(snapshot());
  assert.equal(history.undo(), undefined);
  assert.equal(history.redo(), undefined);
});
