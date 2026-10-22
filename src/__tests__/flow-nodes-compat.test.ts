// Run: node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/flow-nodes-compat.test.ts
//
// T4.1.1: the data layer reads a definition in either shape (`steps[]` legacy,
// `nodes[]` canonical) and writes `nodes[]`.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowStep } from "../flow-types.ts";
import { flowToWorkflow, workflowToFlow } from "../flow-utils.ts";

const list: FlowStep[] = [
  { id: "a", uses: { app: "@w6w/script", action: "run" } },
  { id: "b", uses: { app: "@w6w/script", action: "run" }, position: { x: 5, y: 6 } },
];
const base = { manifestVersion: "2", id: "wf", name: "wf" };

test("A1 steps definition and nodes twin give deep-equal flow graphs", () => {
  const fromSteps = workflowToFlow({ ...base, steps: list });
  const fromNodes = workflowToFlow({ ...base, nodes: list });
  assert.deepEqual(fromSteps, fromNodes);
  assert.equal(fromNodes.nodes.length, 2);
});

test("A1 flowToWorkflow of either writes nodes and never steps", () => {
  for (const def of [
    { ...base, steps: list },
    { ...base, nodes: list },
  ]) {
    const g = workflowToFlow(def);
    const out = flowToWorkflow(def, g.nodes, g.edges);
    assert.ok(Array.isArray(out.nodes));
    assert.equal("steps" in out, false);
    assert.deepEqual(
      out.nodes.map((n) => n.id),
      ["a", "b"],
    );
  }
});

test("A1 both nodes and steps present throws", () => {
  assert.throws(
    () => workflowToFlow({ ...base, nodes: list, steps: list } as never),
    /workflow carries both nodes and steps/,
  );
});
