// Run: node --test src/WorkflowFlowEditor.dblclick-wiring.test.ts  (Node 24, type-stripped)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const path = new URL("./WorkflowFlowEditor.tsx", import.meta.url).pathname;
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

// The JSX lives in `Inner` (WorkflowFlowEditor wraps it in <ReactFlowProvider><Inner/></ReactFlowProvider>).
const inner = findFunction("Inner");

function findReactFlowElement(): ts.JsxSelfClosingElement | ts.JsxOpeningElement {
  let el: ts.JsxSelfClosingElement | ts.JsxOpeningElement | undefined;
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(sf) === "ReactFlow"
    )
      el = node;
    if (!el) ts.forEachChild(node, visit);
  };
  ts.forEachChild(inner, visit);
  assert.ok(el, "<ReactFlow> not found in Inner");
  return el as ts.JsxSelfClosingElement | ts.JsxOpeningElement;
}

function findHandler(): ts.ArrowFunction {
  const el = findReactFlowElement();
  const attr = el.attributes.properties.find(
    (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "onNodeDoubleClick",
  );
  assert.ok(attr, "<ReactFlow> must receive an onNodeDoubleClick prop");
  const initializer =
    attr && ts.isJsxAttribute(attr) && attr.initializer && ts.isJsxExpression(attr.initializer)
      ? attr.initializer.expression
      : undefined;
  assert.ok(
    initializer && ts.isArrowFunction(initializer),
    "onNodeDoubleClick must be an arrow function",
  );
  return initializer as ts.ArrowFunction;
}

test("<ReactFlow> in Inner carries an onNodeDoubleClick attribute", () => {
  findHandler();
});

test("onNodeDoubleClick's first statement calls .stopPropagation() on the event param", () => {
  const handler = findHandler();
  const eventParamName = handler.parameters[0]?.name.getText(sf);
  assert.ok(eventParamName, "handler must take an event parameter");
  assert.ok(ts.isBlock(handler.body), "handler body must be a block");
  const body = handler.body as ts.Block;
  const first = body.statements[0];
  assert.ok(first, "handler body must have a first statement");
  assert.ok(ts.isExpressionStatement(first), "first statement must be an expression statement");
  const expr = (first as ts.ExpressionStatement).expression;
  assert.ok(ts.isCallExpression(expr), "first statement must be a call expression");
  const callee = (expr as ts.CallExpression).expression;
  assert.ok(ts.isPropertyAccessExpression(callee), "first statement must call a method");
  assert.equal(callee.name.text, "stopPropagation");
  assert.equal(callee.expression.getText(sf), eventParamName);
});

test("onNodeDoubleClick calls onEdit with the double-clicked node's id", () => {
  const handler = findHandler();
  const nodeParamName = handler.parameters[1]?.name.getText(sf);
  assert.ok(nodeParamName, "handler must take a node parameter");
  assert.ok(ts.isBlock(handler.body), "handler body must be a block");
  const body = handler.body as ts.Block;
  let call: ts.CallExpression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "onEdit"
    )
      call = node;
    if (!call) ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  assert.ok(call, "handler must call onEdit");
  const arg = (call as ts.CallExpression).arguments[0];
  assert.ok(arg, "onEdit must be called with an argument");
  assert.ok(ts.isPropertyAccessExpression(arg), "onEdit's argument must be a property access");
  assert.equal((arg as ts.PropertyAccessExpression).expression.getText(sf), nodeParamName);
  assert.equal((arg as ts.PropertyAccessExpression).name.text, "id");
});
