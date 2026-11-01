// Run: node --test src/__tests__/WorkflowFlowEditor.run-paint-persist.test.ts  (Node 24, type-stripped)
//
// adhoc/run-paint: the green/red run paint stays on the canvas until the author
// edits the workflow or starts another run. A pan/zoom, a selection, or opening
// and closing a node modal must not clear it.
//
// The paint is a pure function of the host's `runState` prop
// (`stepVisualState` / `edgeRunState`). The editor lets it survive in two ways,
// both pinned here with the AST rig the run-state-wiring test uses:
//   1. the viewport write (`onMoveEnd`) tags its `onChange` `{ viewportOnly: true }`,
//      so a host that drops the run on an edit can keep it for a camera move;
//      every other `onChange` (an edit) carries no tag, so it still clears;
//   2. inside the editor, a viewport-only `value` (same `id`) never re-derives
//      nodes, and the repaint effect is keyed on `runState`, never on `value`.
// The rerun half is behavioural: a new `runState` repaints every node from that
// run alone, so nothing of the previous run's paint survives.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { type RunState, edgeRunState, stepVisualState } from "../run-visuals.ts";

const path = new URL("../WorkflowFlowEditor.tsx", import.meta.url).pathname;
const source = readFileSync(path, "utf8");
const sf = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);

function findFunction(name: string): ts.FunctionDeclaration {
  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  assert.ok(found, `function ${name} not found`);
  return found as ts.FunctionDeclaration;
}

function findCalls(root: ts.Node, name: string): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(sf) === name) calls.push(node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
  return calls;
}

function jsxAttr(root: ts.Node, name: string): ts.JsxAttribute {
  let found: ts.JsxAttribute | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === name) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
  assert.ok(found, `JSX attribute ${name} not found`);
  return found as ts.JsxAttribute;
}

const inner = findFunction("Inner");
const moveEnd = jsxAttr(inner, "onMoveEnd");

test("P1 — the viewport write tags its onChange `{ viewportOnly: true }` (a pan keeps the run)", () => {
  const calls = findCalls(moveEnd, "onChange");
  assert.equal(calls.length, 1, "onMoveEnd must emit exactly one onChange");
  assert.equal(calls[0].arguments.length, 2, "onMoveEnd's onChange must pass a meta argument");
  const meta = calls[0].arguments[1];
  assert.ok(ts.isObjectLiteralExpression(meta), "the meta must be an object literal");
  assert.equal(meta.getText(sf).replace(/\s+/g, ""), "{viewportOnly:true}");
});

test("P2 — every other onChange in the editor is untagged (an edit still clears the run)", () => {
  const outside = findCalls(inner, "onChange").filter(
    (c) => !(c.pos >= moveEnd.pos && c.end <= moveEnd.end),
  );
  assert.ok(outside.length > 0, "PRECONDITION: the editor emits edits through onChange");
  for (const c of outside) {
    assert.equal(
      c.arguments.length,
      1,
      `an edit's onChange must not carry viewport meta: ${c.getText(sf).slice(0, 80)}`,
    );
  }
});

test("P3 — a viewport-only value (same id) re-derives nothing; the repaint is keyed on runState, not value", () => {
  const memo = findCalls(inner, "useMemo").find((c) =>
    c.arguments[0]?.getText(sf).includes("workflowToFlow(value)"),
  );
  assert.ok(memo, "initial must come from useMemo(() => workflowToFlow(value), …)");
  assert.equal(memo.arguments[1]?.getText(sf), "[value.id]");

  const repaint = findCalls(inner, "useEffect").filter((c) => {
    const deps = c.arguments[1];
    return (
      deps &&
      ts.isArrayLiteralExpression(deps) &&
      deps.elements.some((e) => e.getText(sf) === "runState")
    );
  });
  assert.equal(repaint.length, 1, "exactly one effect repaints from runState");
  const deps = (repaint[0].arguments[1] as ts.ArrayLiteralExpression).elements.map((e) =>
    e.getText(sf),
  );
  for (const d of deps) {
    assert.ok(
      !/^value\b|viewport|^nodes$|^edges$|selectedId|editingId/.test(d),
      `the repaint must not depend on ${d}: a pan, selection or modal would re-run it`,
    );
  }
});

test("P4 — no fitView is driven by runState (running never moves the camera)", () => {
  for (const effect of findCalls(inner, "useEffect")) {
    if (findCalls(effect, "fitView").length === 0) continue;
    const deps = effect.arguments[1];
    assert.ok(deps && ts.isArrayLiteralExpression(deps));
    assert.ok(
      !deps.elements.some((e) => /runState|runStatus/.test(e.getText(sf))),
      `a fitView effect must not depend on the run: ${deps.getText(sf)}`,
    );
  }
});

test("P5 — a rerun repaints from the new run alone: the old run's colours do not survive", () => {
  const first: RunState = {
    status: "failed",
    nodes: {
      a: { status: "succeeded" },
      b: { status: "failed" },
    },
  };
  // Run from node `c` on another path: neither `a` nor `b` ran.
  const rerun: RunState = { status: "running", nodes: { c: { status: "running" } } };
  assert.equal(stepVisualState(first, "a"), "succeeded");
  assert.equal(stepVisualState(first, "b"), "failed");
  for (const id of ["a", "b"]) {
    const s = stepVisualState(rerun, id);
    assert.ok(s !== "succeeded" && s !== "failed", `${id} must lose the first run's paint (${s})`);
  }
  assert.equal(stepVisualState(rerun, "c"), "running");
  assert.equal(edgeRunState(first, "a", "success"), "taken", "PRECONDITION: a's edge was taken");
  assert.notEqual(edgeRunState(rerun, "a", "success"), "taken", "a's edge loses its paint");
  // An edit drops the run (host passes `undefined`): nothing is painted.
  assert.equal(stepVisualState(undefined, "a"), "no-run");
  assert.equal(edgeRunState(undefined, "a", "success"), undefined);
});
