// Run: node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/flow-nodes-compat.test.ts
//
// T4.1.1: the data layer reads a definition in either shape (`steps[]` legacy,
// `nodes[]` canonical) and writes `nodes[]`.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowStep } from "../flow-types.ts";
import { flowToWorkflow, workflowToFlow } from "../flow-utils.ts";
import type { StepStartState } from "../provider.tsx";
import { buildResolveScope, resolveParamValue } from "../resolve-params.ts";
import { type RunState, edgeRunState, stepVisualState } from "../run-visuals.ts";
import { startStateFromSeeds } from "../step-preview-state.ts";

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

// ── A3: run wire readers accept nodes, steps, or both ──

test("A3 run-visuals identical for nodes-only, steps-only, both", () => {
  const recs = { a: { status: "succeeded" as const }, b: { status: "failed" as const } };
  const runs: RunState[] = [
    { status: "failed", nodes: recs },
    { status: "failed", steps: recs },
    { status: "failed", nodes: recs, steps: recs },
  ];
  for (const r of runs) {
    assert.equal(stepVisualState(r, "a"), "succeeded");
    assert.equal(stepVisualState(r, "b"), "failed");
    assert.equal(stepVisualState(r, "z"), "pending");
    assert.equal(edgeRunState(r, "a", "success"), "taken");
    assert.equal(edgeRunState(r, "b", "success"), "skipped");
    assert.equal(edgeRunState(r, "z", undefined), undefined);
  }
});

test("A3 step-preview-state start state is independent of wire shape", () => {
  const seeds = [
    { stepId: "a", label: "a", test: { lastRunOutput: { x: 1 }, lastRunStatus: "succeeded" } },
  ] as never;
  assert.deepEqual(startStateFromSeeds(seeds), { steps: { a: { output: { x: 1 } } } });
});

test("A4 — nodes.x.output.f and steps.x.output.f resolve to the same value in resolve-params", () => {
  const scope = buildResolveScope(undefined, {
    steps: { x: { output: { f: 7 } } },
    trigger: {},
  } as unknown as StepStartState);
  const r = (ref: string) =>
    resolveParamValue({ type: "expr", parts: [{ kind: "var", ref }] }, scope);
  assert.deepEqual(r("nodes.x.output.f"), [
    { status: "resolved", ref: "nodes.x.output.f", value: 7 },
  ]);
  assert.deepEqual(r("steps.x.output.f"), [
    { status: "resolved", ref: "steps.x.output.f", value: 7 },
  ]);
});
