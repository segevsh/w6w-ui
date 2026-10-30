// Run: node --test src/__tests__/WorkflowFlowEditor.each-port-wiring.test.ts  (Node 24, type-stripped)
//
// Structural gate for the For each wiring inside the `.tsx` (T2.3.1): the Each item
// handle, the node-anchored loop notice, the loopOf stamp effect, and the delete /
// duplicate / lane-panel lifecycle. The pure rules are pinned in `flow-connect.test.ts`
// and `flow-loop.test.ts`. Same AST rig as `error-port-wiring.test.ts`.
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

/**
 * The body of a `const <name> = useCallback(fn, deps)` binding declared
 * anywhere inside `root` — narrows the AST search to exactly one callback
 * (`onConnect`, `onConnectEnd`, `addBuiltStep`) instead of scanning the whole
 * 2000+-line component, so a call with the same name inside an unrelated
 * callback can't false-positive the assertion.
 */
function findCallbackBody(root: ts.Node, name: string): ts.Node {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(sf) === "useCallback"
    ) {
      found = node.initializer.arguments[0];
    }
    if (!found) ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
  assert.ok(found, `useCallback-bound '${name}' not found`);
  return found as ts.Node;
}

/** Every `name(...)` call expression found anywhere inside `root`. */
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

/** The `{cond && <PortHandle id={EACH_SOURCE_HANDLE}/>}` expression inside `fnName`, if any. */
function eachHandleGuard(fnName: string): ts.JsxExpression | undefined {
  let guard: ts.JsxExpression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      ts.isBinaryExpression(node.expression) &&
      node.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      /id=\{EACH_SOURCE_HANDLE\}/.test(node.expression.right.getText(sf)) &&
      /<PortHandle/.test(node.expression.right.getText(sf))
    ) {
      guard = node;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(findFunction(fnName), visit);
  return guard;
}

test("C12 — onConnect and every refusing addBuiltStep auto-wire site set the loop notice", () => {
  const onConnectBody = findCallbackBody(inner, "onConnect");
  assert.ok(findCalls(onConnectBody, "setLoopNotice").length >= 2, "onConnect sets + clears it");
  assert.match(onConnectBody.getText(sf), /refused === "loop"/);
  const add = findCallbackBody(inner, "addBuiltStep");
  const applies = findCalls(add, "applyConnect");
  assert.equal(applies.length, 3, "addBuiltStep has three auto-wire sites");
  const refusalNotes = findCalls(add, "noteLoopRefusal");
  assert.equal(refusalNotes.length, 3, "each applyConnect site has a refusal branch");
  assert.ok(findCalls(add, "setLoopNotice").length >= 1);
  assert.match(add.getText(sf), /connectRefusal\(/);
});

test("C12 — a role=alert element renders loopNotice, anchored to its node", () => {
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.attributes.getText(sf).includes('role="alert"') &&
      node.parent.getText(sf).includes("loopNotice")
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(inner, visit);
  assert.ok(found, "a role=alert element must render loopNotice");
  assert.match(inner.getText(sf), /nodeId=\{loopNotice\.nodeId\}/);
});

test("C13 — only the foreach ControlNodeCard renders the Each item handle, with both labels", () => {
  const guard = eachHandleGuard("ControlNodeCard");
  assert.ok(
    guard,
    "ControlNodeCard must render <PortHandle id={EACH_SOURCE_HANDLE}> behind a guard",
  );
  assert.match(
    (guard.expression as ts.BinaryExpression).left.getText(sf),
    /foreach/i,
    "the guard must be a foreach predicate",
  );
  const card = findFunction("ControlNodeCard").getText(sf);
  assert.match(card, /isForeachCard\(step\)/);
  assert.match(card, />\s*Each item\s*</);
  assert.match(card, />\s*Done\s*</);
  assert.match(source, /step\.uses\.app === CONTROL_APP && step\.uses\.action === "foreach"/);
  assert.doesNotMatch(findFunction("StepNodeCard").getText(sf), /EACH_SOURCE_HANDLE/);
});

test("C15 — the legacy notice sits behind legacyLoop; the loopOf effect watches edges, never canvas", () => {
  const card = findFunction("ControlNodeCard").getText(sf);
  assert.match(card, /data\.legacyLoop && \(/);
  assert.match(card, /converted from an older definition/);
  let effectText = "";
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sf) === "useEffect" &&
      node.arguments[0]?.getText(sf).includes("stampLoopOf")
    ) {
      effectText = node.getText(sf);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(inner, visit);
  assert.ok(effectText, "an effect calling stampLoopOf");
  assert.match(effectText, /\[edges,/);
  assert.doesNotMatch(effectText, /setCanvas|sections/);
});

test("C16 — delete bridges, the confirm text and duplicate come from the loop helpers; each lane has no panel", () => {
  assert.equal(
    findCalls(findCallbackBody(inner, "performDeleteStep"), "bridgeDeletedBodyStep").length,
    1,
  );
  assert.equal(findCalls(findCallbackBody(inner, "duplicateStep"), "stripBody").length, 1);
  assert.equal(findCalls(inner, "deleteStepMessage").length, 1);
  assert.match(inner.getText(sf), /message=\{deleteStepMessage\(/);
  assert.match(
    source,
    /selectedEdge && edgeLane\(selectedEdge\) !== "each" && \(\s*<Panel position="top-right">/,
  );
});
