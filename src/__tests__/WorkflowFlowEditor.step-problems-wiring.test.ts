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
  assert.equal(effects[0].arguments[1].getText(sf), "[stepProblems, initial, setNodes]");
  const body = effects[0].arguments[0].getText(sf);
  assert.match(body, /setNodes\(/);
  assert.match(body, /applyStepProblems\(/);
  assert.doesNotMatch(body, /setEdges\(/);
});

test("W2b — the stamp effects run AFTER the workflow-swap reset and re-run when `initial` changes", () => {
  const effects = findCalls(inner, "useEffect");
  const depsOf = (c: ts.CallExpression) => c.arguments[1]?.getText(sf) ?? "";
  const reset = effects.find((c) => depsOf(c).startsWith("[initial, initialCanvas"));
  assert.ok(reset, "the swap reset effect (deps [initial, initialCanvas, ...]) exists");
  for (const key of ["stepProblems", "runState"]) {
    const stamp = effects.find((c) => {
      const d = c.arguments[1];
      return d && ts.isArrayLiteralExpression(d) && d.elements.some((e) => e.getText(sf) === key);
    });
    assert.ok(stamp, `the ${key} effect exists`);
    assert.match(
      depsOf(stamp),
      /\binitial\b/,
      `${key} effect must re-stamp after a swap (initial dep)`,
    );
    assert.ok(
      stamp.getStart(sf) > reset.getStart(sf),
      `${key} effect must be declared after the reset, or the mount-time reset wipes its stamp`,
    );
  }
});

test("W3 — StepNodeCard stamps data-step-problem + title via problemAttrs, and an inline ring", () => {
  const text = card.getText(sf);
  assert.match(text, /\.\.\.problemAttrs\(data\.stepProblems\)/);
  assert.match(text, /boxShadow: "0 0 0 2px var\(--w6w-danger\)"/);
  // the run-status border is still derived from the run visual
  assert.match(text, /visual\.borderColor/);
  const attrs = findFunction("problemAttrs").getText(sf);
  assert.match(attrs, /"data-step-problem": problems\.map\(\(p\) => p\.code\)\.join\(" "\)/);
  assert.match(attrs, /title: problems\.map\(stepProblemTooltip\)\.join\("\\n"\)/);
  assert.match(attrs, /problems\.length === 0\) return \{\}/);
});

test("W3b — the badge: role=img, aria-label+title tooltips, warning Icon, only with problems", () => {
  assert.match(card.getText(sf), /<ProblemBadge problems=\{data\.stepProblems\} \/>/);
  const text = findFunction("ProblemBadge").getText(sf);
  assert.match(text, /problems\.length === 0\) return null/);
  assert.match(text, /role="img"/);
  assert.match(text, /aria-label=\{tip\}/);
  assert.match(text, /title=\{tip\}[\s\S]*?<Icon name="warning"/);
  assert.match(text, /join\("\\n"\)/);
});

test("W5 — ControlNodeCard carries the same problem stamp, ring and badge; prop is declared", () => {
  const text = findFunction("ControlNodeCard").getText(sf);
  assert.match(text, /\.\.\.problemAttrs\(data\.stepProblems\)/);
  assert.match(text, /<ProblemBadge problems=\{data\.stepProblems\} \/>/);
  assert.match(text, /boxShadow: "0 0 0 2px var\(--w6w-danger\)"/);
  assert.match(source, /stepProblems\?: StepProblems;/);
});

test("W6 — every applyStepProblemFix( call sits inside a JSX onClick handler", () => {
  const calls = findCalls(sf, "applyStepProblemFix");
  assert.ok(calls.length >= 1, "the fix button must call it");
  for (const c of calls) {
    let n: ts.Node | undefined = c.parent;
    let ok = false;
    while (n) {
      if (ts.isJsxAttribute(n) && n.name.getText(sf) === "onClick" && n.initializer !== undefined) {
        ok = true;
        break;
      }
      n = n.parent;
    }
    assert.ok(ok, `applyStepProblemFix call at ${c.getStart(sf)} is not inside a JSX onClick`);
  }
});

test("W4 — StepEditModal never empties the connection list (no setConns([]))", () => {
  const text = findFunction("StepEditModal").getText(sf);
  assert.match(text, /setConns\(/, "the rig must actually see the setConns calls");
  assert.doesNotMatch(text, /setConns\(\s*\[\s*\]\s*\)/);
});

test("W7 — onConnectEnd consults connectDropRefusal before it can open the builder; pane click clears the notice", () => {
  const text = findFunction("Inner").getText(sf);
  const end = text.slice(text.indexOf("const onConnectEnd"));
  const refusal = end.indexOf("connectDropRefusal(");
  assert.ok(refusal > 0);
  assert.ok(refusal < end.indexOf("setBuilderOpen(true)"), "refusal check precedes the builder");
  assert.match(end, /setLoopNotice\(\{ nodeId: fromNode\.id, reason \}\);\s*return;/);
  // Both lane sites (refusal + builder) read the lane the drag STARTED on, not fromHandle.
  assert.equal(end.split("dragLane(connectStartRef.current").length - 1, 2);
  assert.doesNotMatch(end, /laneForSourceHandle\(connectionState/);
  assert.match(text, /onConnectStart=\{/);
  assert.match(text, /onPaneClick=\{\(\) => setLoopNotice\(null\)\}/);
});
