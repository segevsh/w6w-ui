import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowWorkflow } from "../flow-types.ts";
import { flowToWorkflow, workflowToFlow } from "../flow-utils.ts";
import {
  type StepProblem,
  applyStepProblems,
  connectionButtonLabel,
  stepProblemTooltip,
} from "../step-problems.ts";

type N = { id: string; data: { step: string; stepProblem?: StepProblem } };
const p: StepProblem = { code: "unknown_connection", connection: "c1" };
const mk = (id: string, sp?: StepProblem): N => ({
  id,
  data: { step: id, ...(sp ? { stepProblem: sp } : {}) },
});

test("P1 stamps problem, leaves others identical", () => {
  const a = mk("a");
  const b = mk("b");
  const out = applyStepProblems([a, b], { a: p });
  assert.deepEqual(out[0].data.stepProblem, p);
  assert.equal(out[1], b);
});
test("P2 clears when removed (key gone)", () => {
  const out = applyStepProblems([mk("a", p)], {});
  assert.equal("stepProblem" in out[0].data, false);
  assert.equal(out[0].data.step, "a");
});
test("P3 same node object when unchanged", () => {
  const a = mk("a", { ...p });
  assert.equal(applyStepProblems([a], { a: { ...p } })[0], a);
});
test("P4 data.step is the same reference after stamp and after clear", () => {
  const a = mk("a");
  const stamped = applyStepProblems([a], { a: p })[0];
  assert.equal(stamped.data.step, a.data.step);
  assert.equal(applyStepProblems([stamped], {})[0].data.step, a.data.step);
});
test("P4b changed connection restamps", () => {
  const a = mk("a", p);
  const out = applyStepProblems([a], { a: { code: "unknown_connection", connection: "c2" } });
  assert.notEqual(out[0], a);
  assert.equal(out[0].data.stepProblem?.connection, "c2");
});
test("P5 undefined map clears; clean node untouched", () => {
  const b = mk("b");
  assert.equal(applyStepProblems([b], undefined)[0], b);
  assert.equal("stepProblem" in applyStepProblems([mk("a", p)], undefined)[0].data, false);
});
test("P6 tooltip", () => {
  assert.equal(stepProblemTooltip(p), "Connection c1 no longer exists");
});
test("P7 five label outcomes", () => {
  const conns = [{ id: "c1", displayName: "Main" }, { id: "c2" }];
  const labels = [
    connectionButtonLabel(undefined, conns, false),
    connectionButtonLabel("c1", null, true),
    connectionButtonLabel("c1", null, false),
    connectionButtonLabel("c1", conns, false),
    connectionButtonLabel("zz", conns, false),
  ];
  assert.deepEqual(labels, [
    "No connection",
    "Couldn't load connections",
    "c1",
    "Main",
    "Missing connection — choose another",
  ]);
  assert.equal(new Set(labels).size, 5);
});
test("P7b the five label strings are pairwise distinct", () => {
  const conns = [{ id: "c1", displayName: "Main" }];
  const labels = [
    connectionButtonLabel(undefined, conns, false),
    connectionButtonLabel("c1", null, true),
    connectionButtonLabel("c1", null, false),
    connectionButtonLabel("c1", conns, false),
    connectionButtonLabel("zz", conns, false),
  ];
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++) assert.notEqual(labels[i], labels[j]);
});
test("P8 found without displayName falls back to id; empty settled list is missing", () => {
  assert.equal(connectionButtonLabel("c2", [{ id: "c2" }], false), "c2");
  assert.equal(connectionButtonLabel("c2", [], false), "Missing connection — choose another");
});

test("W5 flowToWorkflow output is identical with and without a stepProblem stamp", () => {
  const wf: FlowWorkflow = {
    manifestVersion: "2",
    id: "wf_test",
    name: "test",
    nodes: [
      { id: "a", uses: { app: "sendgrid", action: "send", connection: "c1" } },
      { id: "b", uses: { app: "@w6w/script", action: "run" } },
    ],
    edges: [{ from: "a", to: "b" }],
  };
  const { nodes, edges } = workflowToFlow(wf);
  const stamped = applyStepProblems(nodes, { a: p });
  assert.deepEqual(stamped[0].data.stepProblem, p);
  assert.deepEqual(flowToWorkflow(wf, stamped, edges), flowToWorkflow(wf, nodes, edges));
});
