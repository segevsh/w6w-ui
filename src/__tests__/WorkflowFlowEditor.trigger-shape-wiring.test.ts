// Run: node --test src/__tests__/WorkflowFlowEditor.trigger-shape-wiring.test.ts  (Node 24, type-stripped)
//
// T-0.1 — a trigger node renders as a half-pill. A structural gate pins the
// mechanism's SHAPE inside the .tsx (the class + data attribute are driven by
// `isTrigger`, on ControlNodeCard's card div only); that the shape actually
// RENDERS is test/canvas-layer's job (real Chromium, computed border radius).
// Mirrors the AST rig from WorkflowFlowEditor.error-port-wiring.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const path = new URL("../WorkflowFlowEditor.tsx", import.meta.url).pathname;
const source = readFileSync(path, "utf8");
const sf = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const flowScss = readFileSync(new URL("../styles/_flow.scss", import.meta.url).pathname, "utf8");

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

type JsxEl = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

/** Every JSX element inside `root` that carries an attribute named `attr`. */
function elementsWithAttr(root: ts.Node, attr: string): JsxEl[] {
  const out: JsxEl[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === attr)
    ) {
      out.push(node);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
  return out;
}

/** The expression inside `attr={…}` on `el`. */
function attrExpr(el: JsxEl, attr: string): ts.Expression {
  const a = el.attributes.properties.find(
    (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === attr,
  ) as ts.JsxAttribute | undefined;
  assert.ok(a, `<${el.tagName.getText(sf)}> has no ${attr}`);
  const init = a.initializer;
  assert.ok(init && ts.isJsxExpression(init) && init.expression, `${attr} must be an {expression}`);
  return init.expression as ts.Expression;
}

/** Asserts `expr` is exactly `isTrigger ? "<value>" : undefined`. */
function assertTriggerConditional(expr: ts.Expression, value: string, attr: string) {
  assert.ok(ts.isConditionalExpression(expr), `${attr} must be conditional on isTrigger`);
  assert.equal(expr.condition.getText(sf), "isTrigger", `${attr}'s condition`);
  assert.ok(ts.isStringLiteral(expr.whenTrue), `${attr}'s trigger arm must be a string literal`);
  assert.equal(expr.whenTrue.text, value, `${attr}'s trigger arm`);
  assert.equal(expr.whenFalse.getText(sf), "undefined", `${attr} must be absent on non-triggers`);
}

/** ControlNodeCard's card div — the one element carrying data-run-status. */
function controlCard(): JsxEl {
  const els = elementsWithAttr(findFunction("ControlNodeCard"), "data-run-status");
  assert.equal(els.length, 1, "exactly one data-run-status element in ControlNodeCard");
  return els[0];
}

test("TS1 — isTrigger is derived from isTriggerApp(step.uses.app)", () => {
  const fn = findFunction("ControlNodeCard");
  let init: string | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === "isTrigger") {
      init = node.initializer?.getText(sf);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn, visit);
  assert.equal(init, "isTriggerApp(step.uses.app)");
});

test('TS2 — the card div carries className={isTrigger ? "w6w-node-trigger" : undefined}', () => {
  assertTriggerConditional(attrExpr(controlCard(), "className"), "w6w-node-trigger", "className");
});

test('TS3 — the card div carries data-node-kind={isTrigger ? "trigger" : undefined}', () => {
  assertTriggerConditional(attrExpr(controlCard(), "data-node-kind"), "trigger", "data-node-kind");
});

test("TS4 — StepNodeCard (app steps) carries neither marker", () => {
  const text = findFunction("StepNodeCard").getText(sf);
  assert.doesNotMatch(text, /data-node-kind/);
  assert.doesNotMatch(text, /w6w-node-trigger/);
});

test("TS5 — _flow.scss defines the half-pill rule under .w6w-flow", () => {
  const m = flowScss.match(/\.w6w-flow \.w6w-node-trigger\s*\{([^}]*)\}/);
  assert.ok(m, "rule `.w6w-flow .w6w-node-trigger { … }` not found in styles/_flow.scss");
  assert.match(m[1], /border-radius:\s*999px 4px 4px 999px;/);
});
