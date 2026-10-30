// Run: node --test src/__tests__/WorkflowFlowEditor.loop-picker-wiring.test.ts  (Node 24, type-stripped)
//
// T2.4.1 wiring pins (AST, same technique as WorkflowFlowEditor.step-test-meta.test.ts): the
// picker memos in WFE feed the loop-aware projection and nothing re-derives a loop there.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const src = readFileSync(new URL("../WorkflowFlowEditor.tsx", import.meta.url), "utf8");
const sf = ts.createSourceFile("WorkflowFlowEditor.tsx", src, ts.ScriptTarget.Latest, true);

function constInit(name: string): ts.Node {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer)
      found = n.initializer;
    if (!found) ts.forEachChild(n, visit);
  };
  ts.forEachChild(sf, visit);
  assert.ok(found, `const ${name} not found`);
  return found;
}
function calls(root: ts.Node, name: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === name) out.push(n);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(root, visit);
  return out;
}

test("G1 - stepSampleValues calls upstreamSampleValues with steps and loop", () => {
  const c = calls(constInit("stepSampleValues"), "upstreamSampleValues");
  assert.equal(c.length, 1);
  assert.equal(c[0].arguments[0].getText(sf), "upstreamState.steps");
  assert.equal(c[0].arguments[3].getText(sf), "upstreamState.loop");
});

test("G2 - upstreamIdsKey includes extraSampleIds", () => {
  assert.ok(constInit("upstreamIdsKey").getText(sf).includes("upstreamState.extraSampleIds"));
});

test("G3 - mergedExprOptions carries loop", () => {
  assert.ok(/\bloop:\s*upstreamState\.loop\b/.test(constInit("mergedExprOptions").getText(sf)));
});

test("G4 - upstreamState passes draftStepId as the 5th argument", () => {
  const c = calls(constInit("upstreamState"), "upstreamStateSources");
  assert.equal(c.length, 1);
  assert.equal(c[0].arguments[4]?.getText(sf), "draftStepId");
});

test("G5 - collect form keeps calling the projection with no caller-side filter", () => {
  const c = calls(constInit("runUpstreamSteps"), "upstreamStateSources");
  assert.equal(c.length, 1);
  assert.equal(c[0].arguments[0].getText(sf), "runResult.stepId");
  assert.equal(/loopMembership|loopBody/.test(src), false);
});

test("G6 - the D-X1 steps.-only key template is gone from WFE", () => {
  assert.equal((src.match(/steps\.\$\{st\.id\}\.output/g) ?? []).length, 0);
});
