// Run: node --test src/__tests__/WorkflowFlowEditor.step-problems-wiring.test.ts
//
// Structural gate (same AST idiom as run-state-wiring): `stepProblems` must reach
// the canvas through a live-repaint effect, never through `workflowToFlow`
// (which re-derives only on `value.id` and would never repaint after a rebind).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

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

const inner = findFunction("Inner");
const card = findFunction("StepNodeCard");

test("W1 — workflowToFlow stays one-arg (stepProblems never goes through it)", () => {
  const calls = findCalls(inner, "workflowToFlow");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].arguments.length, 1);
  assert.equal(calls[0].arguments[0].getText(sf), "value");
});

test("W2 — one useEffect keyed on stepProblems calls setNodes(applyStepProblems(...))", () => {
  const effects = findCalls(inner, "useEffect").filter((c) => {
    const deps = c.arguments[1];
    return (
      deps &&
      ts.isArrayLiteralExpression(deps) &&
      deps.elements.some((e) => e.getText(sf) === "stepProblems")
    );
  });
  assert.equal(effects.length, 1, "exactly one effect depends on stepProblems");
  assert.equal(effects[0].arguments[1].getText(sf), "[stepProblems, setNodes]");
  const body = effects[0].arguments[0].getText(sf);
  assert.match(body, /setNodes\(/);
  assert.match(body, /applyStepProblems\(/);
  assert.doesNotMatch(body, /setEdges\(/);
});

test("W3 — StepNodeCard stamps data-step-problem, title tooltip and an inline ring", () => {
  const text = card.getText(sf);
  assert.match(text, /data-step-problem=\{data\.stepProblem\?\.code\}/);
  assert.match(text, /stepProblemTooltip\(data\.stepProblem\)/);
  assert.match(text, /boxShadow: "0 0 0 2px var\(--w6w-danger\)"/);
  // the run-status border is still derived from the run visual
  assert.match(text, /visual\.borderColor/);
});

test("W5 — ControlNodeCard does not carry the problem stamp; prop is declared", () => {
  assert.doesNotMatch(findFunction("ControlNodeCard").getText(sf), /data-step-problem/);
  assert.match(source, /stepProblems\?: StepProblems;/);
});

test("W4 — StepEditModal never empties the connection list (no setConns([]))", () => {
  const text = findFunction("StepEditModal").getText(sf);
  assert.match(text, /setConns\(/, "the rig must actually see the setConns calls");
  assert.doesNotMatch(text, /setConns\(\s*\[\s*\]\s*\)/);
});
