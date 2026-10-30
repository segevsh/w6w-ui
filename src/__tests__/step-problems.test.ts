import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowWorkflow } from "../flow-types.ts";
import { flowToWorkflow, workflowToFlow } from "../flow-utils.ts";
import {
  type StepProblem,
  applyStepProblems,
  connectionButtonLabel,
  isConnectionBlocked,
  stepProblemTooltip,
} from "../step-problems.ts";

type N = { id: string; data: { step: string; stepProblems?: StepProblem[] } };
const p: StepProblem = { code: "unknown_connection", connection: "c1" };
const mk = (id: string, sp?: StepProblem[]): N => ({
  id,
  data: { step: id, ...(sp ? { stepProblems: sp } : {}) },
});

test("P1 stamps problem, leaves others identical", () => {
  const a = mk("a");
  const b = mk("b");
  const out = applyStepProblems([a, b], { a: [p] });
  assert.deepEqual(out[0].data.stepProblems, [p]);
  assert.equal(out[1], b);
});
test("P2 clears when removed (key gone)", () => {
  const out = applyStepProblems([mk("a", [p])], {});
  assert.equal("stepProblems" in out[0].data, false);
  assert.equal(out[0].data.step, "a");
});
test("P3 same node object when unchanged", () => {
  const a = mk("a", [{ ...p }]);
  assert.equal(applyStepProblems([a], { a: [{ ...p }] })[0], a);
});
test("P4 data.step is the same reference after stamp and after clear", () => {
  const a = mk("a");
  const stamped = applyStepProblems([a], { a: [p] })[0];
  assert.equal(stamped.data.step, a.data.step);
  assert.equal(applyStepProblems([stamped], {})[0].data.step, a.data.step);
});
test("P4b changed connection restamps", () => {
  const a = mk("a", [p]);
  const out = applyStepProblems([a], { a: [{ code: "unknown_connection", connection: "c2" }] });
  assert.notEqual(out[0], a);
  assert.equal((out[0].data.stepProblems?.[0] as { connection: string }).connection, "c2");
});
test("P5 undefined map clears; clean node untouched", () => {
  const b = mk("b");
  assert.equal(applyStepProblems([b], undefined)[0], b);
  assert.equal("stepProblems" in applyStepProblems([mk("a", [p])], undefined)[0].data, false);
});
test("P6 tooltip", () => {
  assert.equal(
    stepProblemTooltip(p),
    "Connection c1 no longer exists — open the step and choose another on the Setup tab",
  );
});
test("P6b isConnectionBlocked", () => {
  assert.equal(isConnectionBlocked({ uses: { connection: "c1" } }, [p]), true);
  assert.equal(isConnectionBlocked({ uses: { connection: "c2" } }, [p]), false);
  assert.equal(isConnectionBlocked({ uses: { connection: "c1" } }, undefined), false);
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

test("W5 flowToWorkflow output is identical with and without a stepProblems stamp", () => {
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
  const stamped = applyStepProblems(nodes, { a: [p] });
  assert.deepEqual(stamped[0].data.stepProblems, [p]);
  assert.deepEqual(flowToWorkflow(wf, stamped, edges), flowToWorkflow(wf, nodes, edges));
});

const wrapped: StepProblem = {
  code: "foreach_wrapped_items",
  fix: { kind: "unwrap_items", label: "Unwrap Items" },
};
const refsOut = (refs: string[]): StepProblem => ({
  code: "foreach_body_refs_output",
  foreachId: "f",
  refs,
  fix: { kind: "use_current_item", foreachId: "f", label: "Use Current item" },
});

test("P9 empty list clears the key (never stamps [])", () => {
  const out = applyStepProblems([mk("a", [p])], { a: [] })[0];
  assert.equal("stepProblems" in out.data, false);
  assert.equal(applyStepProblems([mk("b")], { b: [] })[0].data.stepProblems, undefined);
});
test("P10 repaint: same node for deep-equal list; new node for any payload change under the same code", () => {
  const a = mk("a", [refsOut(["x"])]);
  assert.equal(applyStepProblems([a], { a: [refsOut(["x"])] })[0], a);
  assert.notEqual(applyStepProblems([a], { a: [refsOut(["y"])] })[0], a);
  const other: StepProblem = { ...refsOut(["x"]), foreachId: "g" } as StepProblem;
  assert.notEqual(applyStepProblems([a], { a: [other] })[0], a);
  const fixChanged = {
    ...refsOut(["x"]),
    fix: { kind: "use_current_item", foreachId: "g", label: "Use Current item" },
  } as StepProblem;
  assert.notEqual(applyStepProblems([a], { a: [fixChanged] })[0], a);
  const c = mk("c", [p]);
  assert.notEqual(
    applyStepProblems([c], { c: [{ code: "unknown_connection", connection: "c9" }] })[0],
    c,
  );
  assert.notEqual(applyStepProblems([c], { c: [p, wrapped] })[0], c);
});
test("P11 isConnectionBlocked reads every entry, not just [0]", () => {
  assert.equal(isConnectionBlocked({ uses: { connection: "c1" } }, [wrapped, p]), true);
  assert.equal(isConnectionBlocked({ uses: { connection: "c1" } }, [wrapped]), false);
});
test("P12 loop tooltips", () => {
  assert.equal(stepProblemTooltip(wrapped), "Items wraps a list in another list — this loops once");
  const a = stepProblemTooltip(refsOut(["nodes.f.output"]));
  const b = stepProblemTooltip({
    code: "loop_body_invalid",
    reason: { reason: "legacy_not_linear", stepId: "x" },
  });
  assert.ok(a.length > 0 && b.length > 0);
  assert.notEqual(a, b);
  assert.notEqual(a, stepProblemTooltip(wrapped));
});
