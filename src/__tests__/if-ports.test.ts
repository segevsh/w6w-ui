// Run: node --test src/__tests__/if-ports.test.ts  (Node 24, type-stripped)
//
// If ports (human report, 2026-10-31: "should not have error, it should have: true
// port and false port"). True sits on the right edge, False on the bottom edge (the
// error port's slot), labelled like the Router's ports; an If has no error port. True
// keeps the unnamed handle every saved If edge uses; False is `route:false`, which the
// engine takes only when the condition is false.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyConnect } from "../flow-connect.ts";
import { CONTROL_APP, type FlowWorkflow, IF_FALSE_ROUTE, ifPortLayout } from "../flow-types.ts";
import { flowToWorkflow, workflowToFlow } from "../flow-utils.ts";
import { edgeRunState } from "../run-visuals.ts";

const wf = (edges: FlowWorkflow["edges"]): FlowWorkflow => ({
  manifestVersion: "2",
  id: "wf_if",
  name: "If",
  nodes: [
    { id: "if_1", uses: { app: CONTROL_APP, action: "if" }, with: { condition: true } },
    { id: "yes", uses: { app: "example", action: "run" } },
    { id: "no", uses: { app: "example", action: "run" } },
  ],
  edges,
});

test("If lays out a True right handle and a False bottom handle", () => {
  const layout = ifPortLayout();
  assert.equal(layout.right[0].handleId, undefined, "True is the unnamed handle saved edges use");
  assert.deepEqual(layout.right, [{ id: "true", label: "True", top: "50%" }]);
  assert.deepEqual(layout.bottom, { id: "false", handleId: "route:false", label: "False" });
});

test("the If card renders no error handle and no error styling on False", () => {
  const source = readFileSync(
    new URL("../WorkflowFlowEditor.tsx", import.meta.url).pathname,
    "utf8",
  );
  const start = source.indexOf("function ControlNodeCard(");
  const card = source.slice(start, source.indexOf("\nfunction ", start + 1));
  assert.ok(start > 0, "ControlNodeCard not found");
  assert.match(card, /isIf \? ifPortLayout\(\)/);
  // The error port is gated off for an If …
  assert.match(card, /!isTrigger && !isRouter && !isIf && \(\s*<PortHandle[\s\S]*?variant="error"/);
  // … and the bottom (False) handle is an ordinary port, labelled beside itself.
  const bottom = card.slice(card.indexOf("{routerPorts.bottom && ("));
  const bottomHandle = bottom.slice(0, bottom.indexOf("/>"));
  assert.match(bottomHandle, /position=\{Position\.Bottom\}/);
  assert.ok(!bottomHandle.includes("variant"), "False is not styled as an error port");
  assert.match(bottom, /w6w-router-fallback-label[\s\S]*?\{routerPorts\.bottom\.label\}/);
});

test("an edge drawn from False is a false-branch edge that saves as route: false", () => {
  const graph = workflowToFlow(wf([]));
  const next = applyConnect("if_1", "no", graph.nodes, graph.edges, "success", undefined, "false");
  assert.ok(next, "False → no connects");
  const edge = next.find((e) => e.target === "no");
  assert.equal(edge?.sourceHandle, "route:false");
  assert.deepEqual(flowToWorkflow(wf([]), graph.nodes, next).edges, [
    { from: "if_1", to: "no", route: IF_FALSE_ROUTE },
  ]);
  // Both ports fan out, and an If names no other route.
  const both = applyConnect("if_1", "yes", graph.nodes, next, "success", undefined, "false");
  assert.ok(both, "False fans out like True");
  assert.equal(
    applyConnect("if_1", "yes", graph.nodes, graph.edges, "success", undefined, "maybe"),
    null,
  );
});

test("saved If edges load onto their ports; an old error edge becomes False", () => {
  const graph = workflowToFlow(
    wf([
      { from: "if_1", to: "yes" },
      { from: "if_1", to: "no", when: "error" },
    ]),
  );
  const yes = graph.edges.find((e) => e.target === "yes");
  const no = graph.edges.find((e) => e.target === "no");
  assert.equal(yes?.sourceHandle, undefined, "True keeps the unnamed handle");
  assert.equal(no?.sourceHandle, "route:false");
  assert.deepEqual(no?.data, { when: "success", route: "false" });
  assert.deepEqual(flowToWorkflow(wf([]), graph.nodes, graph.edges).edges, [
    { from: "if_1", to: "yes" },
    { from: "if_1", to: "no", route: "false" },
  ]);
});

test("a run paints the False edge taken only when the condition was false", () => {
  const state = (matched: boolean) =>
    ({
      nodes: { if_1: { nodeId: "if_1", status: "succeeded", attempt: 1, output: { matched } } },
    }) as unknown as Parameters<typeof edgeRunState>[0];
  assert.equal(edgeRunState(state(false), "if_1", "success", "false"), "taken");
  assert.equal(edgeRunState(state(true), "if_1", "success", "false"), "skipped");
});
