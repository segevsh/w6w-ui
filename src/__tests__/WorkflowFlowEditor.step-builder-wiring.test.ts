// Run: node --test src/__tests__/WorkflowFlowEditor.step-builder-wiring.test.ts  (Node 24, type-stripped)
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

test("<StepBuilderModal> receives upstreamSteps derived from stepBuilderUpstreamSteps, not a literal []", () => {
  // The JSX lives in `Inner` (WorkflowFlowEditor wraps it in <ReactFlowProvider><Inner/></ReactFlowProvider>).
  const fn = findFunction("Inner");
  let el: ts.JsxSelfClosingElement | ts.JsxOpeningElement | undefined;
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(sf) === "StepBuilderModal"
    )
      el = node;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn, visit);
  assert.ok(el, "<StepBuilderModal> not found");
  const attr = el?.attributes.properties.find(
    (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "upstreamSteps",
  );
  assert.ok(attr, "<StepBuilderModal> must receive an upstreamSteps prop");
  const exprText =
    attr && ts.isJsxAttribute(attr) && attr.initializer && ts.isJsxExpression(attr.initializer)
      ? (attr.initializer.expression?.getText(sf) ?? "")
      : "";
  assert.notEqual(exprText.replace(/\s/g, ""), "[]");
  assert.match(exprText, /stepBuilderUpstreamSteps/);
});
