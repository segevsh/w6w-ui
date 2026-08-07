// Run: node --test src/__tests__/StepBuilderModal.wiring.test.ts  (Node 24, type-stripped)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const path = new URL("../StepBuilderModal.tsx", import.meta.url).pathname;
const source = readFileSync(path, "utf8");
const sf = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);

function findFunction(name: string): ts.FunctionDeclaration {
  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  assert.ok(found, `function ${name} not found in StepBuilderModal.tsx`);
  return found as ts.FunctionDeclaration;
}

function stepTestRunElements(scope: ts.Node): { hasState: boolean }[] {
  const out: { hasState: boolean }[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(sf) === "StepTestRun"
    ) {
      const hasState = node.attributes.properties.some(
        (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "state",
      );
      out.push({ hasState });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(scope, visit);
  return out;
}

function callHasArgIdentifier(scope: ts.Node, callee: string, argIdentifier: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === callee &&
      node.arguments.some((a) => ts.isIdentifier(a) && a.text === argIdentifier)
    )
      found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  ts.forEachChild(scope, visit);
  return found;
}

function paramsText(fn: ts.FunctionDeclaration): string {
  return fn.parameters.map((p) => p.getText(sf)).join(", ");
}

test("StepBuilderModalProps declares upstreamSteps", () => {
  let iface: ts.InterfaceDeclaration | undefined;
  ts.forEachChild(sf, function visit(node) {
    if (ts.isInterfaceDeclaration(node) && node.name.text === "StepBuilderModalProps") iface = node;
    if (!iface) ts.forEachChild(node, visit);
  });
  assert.ok(iface);
  assert.equal(
    iface?.members.some(
      (m) => m.name && ts.isIdentifier(m.name) && m.name.text === "upstreamSteps",
    ),
    true,
  );
});

test("StepBuilderModal forwards upstreamSteps to AppStepConfig and ControlStepConfig", () => {
  const fn = findFunction("StepBuilderModal");
  let appCall: ts.JsxSelfClosingElement | ts.JsxOpeningElement | undefined;
  let controlCall: ts.JsxSelfClosingElement | ts.JsxOpeningElement | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(sf);
      if (tag === "AppStepConfig") appCall = node;
      if (tag === "ControlStepConfig") controlCall = node;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn, visit);
  assert.ok(appCall);
  assert.ok(controlCall);
  for (const el of [appCall, controlCall]) {
    assert.equal(
      el?.attributes.properties.some(
        (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "upstreamSteps",
      ),
      true,
    );
  }
});

test("AppStepConfig accepts upstreamSteps and threads it into useSeedSources", () => {
  const fn = findFunction("AppStepConfig");
  assert.match(paramsText(fn), /\bupstreamSteps\b/);
  assert.equal(callHasArgIdentifier(fn, "useSeedSources", "upstreamSteps"), true);
});

test("AppStepConfig's Test-tab StepTestRun carries a state attribute", () => {
  const elements = stepTestRunElements(findFunction("AppStepConfig"));
  assert.equal(elements.length, 1);
  assert.equal(elements[0].hasState, true);
});

test("ControlStepConfig accepts upstreamSteps and threads it into useSeedSources", () => {
  const fn = findFunction("ControlStepConfig");
  assert.match(paramsText(fn), /\bupstreamSteps\b/);
  assert.equal(callHasArgIdentifier(fn, "useSeedSources", "upstreamSteps"), true);
});

test("ControlStepConfig's Test-tab StepTestRun carries a state attribute", () => {
  const elements = stepTestRunElements(findFunction("ControlStepConfig"));
  assert.equal(elements.length, 1);
  assert.equal(elements[0].hasState, true);
});
