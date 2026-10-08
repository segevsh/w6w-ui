// Run: node --test src/__tests__/flow-fanout.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge } from "@xyflow/react";
import { fanOutState, setFanOut } from "../flow-fanout.ts";
import type { FlowStep } from "../flow-types.ts";
import type { FlowWorkflow } from "../flow-types.ts";
import { type StepNode, flowToWorkflow } from "../flow-utils.ts";

const e = (t: string, when: "success" | "error"): Edge => ({
  id: `a->${t}${when === "error" ? ":error" : ""}`,
  source: "a",
  target: t,
  data: { when },
});

test("A1 fanOutState", () => {
  assert.deepEqual(fanOutState("a", []), { enabled: false, count: 0 });
  assert.deepEqual(fanOutState("a", [e("b", "success")]), { enabled: false, count: 1 });
  assert.deepEqual(fanOutState("a", [e("b", "success"), e("c", "success"), e("d", "error")]), {
    enabled: true,
    count: 2,
  });
  assert.deepEqual(fanOutState("a", [e("b", "error"), e("c", "error"), e("d", "error")]), {
    enabled: true,
    count: 3,
  });
  assert.equal(fanOutState("z", [e("b", "success"), e("c", "success")]).enabled, false);
});

const step: FlowStep = { id: "a", uses: { app: "@w6w/script", action: "run" } };

test("A2 setFanOut + round trip", () => {
  const p = setFanOut(step, "parallel");
  assert.equal(p.fanOut, "parallel");
  const s = setFanOut(p, "sequential");
  assert.equal("fanOut" in s, false);
  const wf = { id: "w", name: "w", steps: [step], edges: [] } as unknown as FlowWorkflow;
  const nd = (st: FlowStep): StepNode =>
    ({
      id: "a",
      type: "step",
      position: { x: 0, y: 0 },
      data: { step: st, isInternal: false },
    }) as StepNode;
  assert.equal(flowToWorkflow(wf, [nd(p)], []).steps[0].fanOut, "parallel");
  assert.equal("fanOut" in flowToWorkflow(wf, [nd(s)], []).steps[0], false);
});
