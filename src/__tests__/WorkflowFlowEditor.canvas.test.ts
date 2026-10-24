// Run: node --test src/__tests__/WorkflowFlowEditor.canvas.test.ts  (Node 24, type-stripped)
//
// Source-shape pins for the notes/sections wiring in WorkflowFlowEditor (T4.2.2 · A4): the
// delete/rename/membership paths call the canvas helpers with the right ids, a section drop
// emits once, and readOnly gates every canvas control. Runtime behaviour is the browser
// harness's job (test/canvas-layer).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const path = new URL("../WorkflowFlowEditor.tsx", import.meta.url).pathname;
const source = readFileSync(path, "utf8");
const sf = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);

/** The initializer text of `const <name> = useCallback(...)` inside Inner. */
function callback(name: string): string {
  let found: string | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === name && node.initializer) {
      found = node.initializer.getText(sf);
    }
    if (found === undefined) ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  assert.ok(found, `${name} not found`);
  return found as string;
}

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

test("node delete prunes the deleted id from sections and emits the pruned canvas", () => {
  const body = callback("performDeleteStep");
  assert.match(body, /pruneSectionMembers\(canvas, id\)/);
  assert.match(body, /emitChange\(nextNodes, nextEdges, nextCanvas\)/);
  assert.equal(count(body, "emitChange("), 1);
});

test("rename remaps the member from the previous id to the new id", () => {
  assert.match(source, /renameSectionMember\(canvas, prevId, next\.id\)/);
  assert.match(source, /emitChange\(nextNodes, nextEdges, nextCanvas\)/);
});

test("section drop: members shift by the drag delta and there is exactly one emission", () => {
  const body = callback("onSectionDrop");
  assert.match(body, /if \(readOnly\) return;/);
  assert.match(body, /n\.position\.x \+ d\.dx/);
  assert.match(body, /n\.position\.y \+ d\.dy/);
  assert.equal(count(body, "emitChange("), 1);
  assert.equal(count(body, "onChange("), 0);
});

test("membership on node drag stop goes through assignMembership / pruneSectionMembers", () => {
  const start = source.indexOf("const membershipAfterDrag");
  assert.ok(start > 0);
  const body = source.slice(start, start + 1200);
  assert.match(body, /assignMembership\(/);
  assert.match(body, /pruneSectionMembers\(next, /);
  const stop = source.slice(source.indexOf("onNodeDragStop="), source.indexOf("onMoveEnd="));
  assert.match(stop, /membershipAfterDrag\(dragged as StepNode\[\]\)/);
  assert.equal(count(stop, "emitChange("), 1);
});

test("deleting a note or section is confirmed through ConfirmModal, never window.confirm", () => {
  assert.match(source, /<ConfirmModal[\s\S]{0,200}pendingCanvasDelete/);
  assert.doesNotMatch(source, /window\.confirm/);
  const body = callback("performCanvasDelete");
  assert.match(body, /n\.id !== id/);
  assert.match(body, /x\.id !== id/);
  // the frame goes, nodes are untouched
  assert.doesNotMatch(body, /setNodes|nodes\.filter/);
});

test("readOnly hides the toolbar controls and gates every canvas mutation", () => {
  const panel = source.indexOf("{!readOnly && (\n                      <Panel");
  assert.ok(panel > 0, "toolbar Panel must sit under !readOnly");
  const after = source.slice(panel, panel + 1600);
  assert.match(after, /data-testid="add-note"/);
  assert.match(after, /data-testid="draw-section"/);
  assert.match(source, /\{!readOnly && drawingSection && \(/, "the draw surface is gated");
  for (const name of [
    "addNote",
    "addSectionAt",
    "onSectionDrop",
    "performCanvasDelete",
    "addFromPort",
  ]) {
    assert.match(callback(name), /if \(readOnly\) return;/, `${name} must guard readOnly`);
  }
  assert.match(source, /<CanvasLayer[\s\S]{0,200}readOnly=\{readOnly\}/);
});

test("a drawn section takes the nodes whose centre it encloses, never the selection", () => {
  const body = callback("addSectionAt");
  assert.match(body, /assignMembership\(withNew, id, members\)/);
  assert.match(body, /nodeRect\(n\)/);
  assert.doesNotMatch(body, /selected/i);
});
