// Run: node --test src/flow-utils.test.ts  (Node 24, type-stripped)
//
// The `Edge.when` round-trip (core rfcs/workflow.md · "Amendment — 2026-07-29:
// failure-conditioned edges"). The trap this suite exists to pin:
// `flowToWorkflow` used to collapse every edge to `{ from, to }`, so an
// authored error edge was silently dropped on save and the feature presented as
// an engine fault.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Edge } from "@xyflow/react";
import { renameStepInEdges } from "./flow-connect.ts";
import type { FlowWorkflow } from "./flow-types.ts";
import { type StepNode, flowToWorkflow, workflowToFlow } from "./flow-utils.ts";

/** Three steps, so an edge can be authored between any pair. */
const WF: FlowWorkflow = {
  manifestVersion: "2",
  id: "wf_test",
  name: "test",
  steps: [
    { id: "a", uses: { app: "@w6w/script", action: "run" } },
    { id: "b", uses: { app: "@w6w/script", action: "run" } },
    { id: "c", uses: { app: "@w6w/script", action: "run" } },
  ],
  edges: [{ from: "a", to: "b" }],
};

/** A React Flow edge as the canvas would hold it, carrying an explicit lane. */
function rfEdge(source: string, target: string, when: "success" | "error"): Edge {
  return { id: `${source}->${target}`, source, target, data: { when } };
}

/** The nodes flowToWorkflow needs to keep the step list intact. */
function nodesOf(wf: FlowWorkflow): StepNode[] {
  return workflowToFlow(wf).nodes;
}

test("workflowToFlow — an error edge carries data.when + the error class; a plain edge is success", () => {
  const { edges } = workflowToFlow({
    ...WF,
    edges: [
      { from: "a", to: "b", when: "error" },
      { from: "b", to: "c" },
    ],
  });

  const err = edges[0];
  assert.equal(err.data?.when, "error");
  assert.match(String(err.className ?? ""), /w6w-edge-error/);

  const ok = edges[1];
  assert.equal(ok.data?.when, "success");
  assert.doesNotMatch(String(ok.className ?? ""), /w6w-edge-error/);
});

test("flowToWorkflow — an RF edge carrying data.when === 'error' emits { from, to, when }", () => {
  const next = flowToWorkflow(WF, nodesOf(WF), [rfEdge("a", "b", "error")]);
  assert.deepEqual(next.edges, [{ from: "a", to: "b", when: "error" }]);
});

test("flowToWorkflow — a success edge emits exactly { from, to } (no stray `when` key)", () => {
  const next = flowToWorkflow(WF, nodesOf(WF), [rfEdge("a", "b", "success")]);
  // Deep equality, not a field check: a `when: "success"` or `when: undefined`
  // key would break every persisted definition's byte-identical round-trip.
  assert.deepEqual(next.edges, [{ from: "a", to: "b" }]);
});

test("round-trip — flowToWorkflow(workflowToFlow(wf)) reproduces the authored edges exactly", () => {
  const wf: FlowWorkflow = {
    ...WF,
    edges: [
      { from: "a", to: "c" },
      { from: "a", to: "b", when: "error" },
      { from: "b", to: "c" },
    ],
  };
  const { nodes, edges } = workflowToFlow(wf);
  assert.deepEqual(flowToWorkflow(wf, nodes, edges).edges, wf.edges);
});

// ── The same-target pair (D-T1-8): one success edge AND one error edge between
// the SAME two steps. The model permits it, so an error edge's React Flow id is
// qualified with `:error`. Until per-lane exit capacity (T3.2.2) the pair was
// unauthorable, which is why the qualifier had no regression coverage — dropping
// it left this suite fully green. These three cases pin it.

/** `a → b` twice: once as success, once as the error lane. */
const SAME_TARGET_PAIR: FlowWorkflow = {
  ...WF,
  edges: [
    { from: "a", to: "b" },
    { from: "a", to: "b", when: "error" },
  ],
};

test("same-target pair — the success and error edges get DISTINCT React Flow ids", () => {
  const { edges } = workflowToFlow(SAME_TARGET_PAIR);
  assert.deepEqual(
    edges.map((e) => e.id),
    ["a->b", "a->b:error"],
  );
});

test("same-target pair — survives an id-keyed Map (React Flow's store) with 2 entries", () => {
  // This is the assertion that actually models the loss: React Flow keys its
  // edge store by id, so two edges sharing one id collapse to one and a whole
  // lane disappears from the canvas without any error.
  const { edges } = workflowToFlow(SAME_TARGET_PAIR);
  const store = new Map(edges.map((e) => [e.id, e]));
  assert.equal(store.size, 2);
  assert.equal(store.get("a->b")?.data?.when, "success");
  assert.equal(store.get("a->b:error")?.data?.when, "error");
});

test("same-target pair — round-trips deep-equal with the error edge FIRST as well as second", () => {
  for (const order of [
    SAME_TARGET_PAIR.edges ?? [],
    [...(SAME_TARGET_PAIR.edges ?? [])].reverse(),
  ]) {
    const wf: FlowWorkflow = { ...WF, edges: order };
    const { nodes, edges } = workflowToFlow(wf);
    assert.equal(new Map(edges.map((e) => [e.id, e])).size, 2, "both lanes must reach the canvas");
    assert.deepEqual(flowToWorkflow(wf, nodes, edges).edges, order);
  }
});

test("renaming a step keeps the lane qualifier — a same-target pair stays TWO edges", () => {
  // `updateStep`'s id rewrite (via renameStepInEdges) used to rebuild every id
  // as `${source}->${target}`, dropping `:error` — so renaming `a` collapsed the
  // pair into one edge. Both id sites now mint through the shared `flowEdgeId`.
  const { edges } = workflowToFlow(SAME_TARGET_PAIR);
  const renamed = renameStepInEdges(edges, "a", "sendgrid");
  assert.deepEqual(
    renamed.map((e) => e.id),
    ["sendgrid->b", "sendgrid->b:error"],
  );
  assert.equal(new Map(renamed.map((e) => [e.id, e])).size, 2);
  // The endpoints and the lanes both moved across intact.
  assert.deepEqual(
    renamed.map((e) => `${e.source}->${e.target}:${e.data?.when}`),
    ["sendgrid->b:success", "sendgrid->b:error"],
  );
});

// ── `Step.position` / `Workflow.settings` round-trip (core rfcs/workflow.md ·
// "Amendment — 2026-07-29: authoring presentation"). The layout constants are
// COLUMN_WIDTH 240 / ROW_HEIGHT 100 / MARGIN_X 40 / MARGIN_Y 40, so a two-step
// chain computes to a = {40,40} and b = {280,40}. The fallback cases assert those
// ABSOLUTELY: they are what "the computed layout is unchanged" means, and every
// existing workflow (none of which stores a position yet) opens through them.

/** Two steps and one edge — the smallest graph with a second column. */
const CHAIN: FlowWorkflow = {
  manifestVersion: "2",
  id: "wf_chain",
  name: "chain",
  steps: [
    { id: "a", uses: { app: "@w6w/script", action: "run" } },
    { id: "b", uses: { app: "@w6w/script", action: "run" } },
  ],
  edges: [{ from: "a", to: "b" }],
};

test("workflowToFlow — a stored step.position wins over the computed slot", () => {
  const { nodes } = workflowToFlow({
    ...CHAIN,
    steps: [{ ...CHAIN.steps[0], position: { x: 123, y: 456 } }, CHAIN.steps[1]],
  });
  assert.deepEqual(nodes[0].position, { x: 123, y: 456 });
});

test("workflowToFlow — with NO positions the computed layout is exactly today's", () => {
  const { nodes } = workflowToFlow(CHAIN);
  assert.deepEqual(
    nodes.map((n) => n.position),
    [
      { x: 40, y: 40 },
      { x: 280, y: 40 },
    ],
  );
});

test("workflowToFlow — a partially positioned graph mixes stored and computed", () => {
  // `b` is positioned, `a` is not: `a` must still land on the slot it would have
  // taken with no positions at all (the computed coordinate is a function of the
  // graph, not of which neighbours happen to carry one).
  const { nodes } = workflowToFlow({
    ...CHAIN,
    steps: [CHAIN.steps[0], { ...CHAIN.steps[1], position: { x: -7, y: 900 } }],
  });
  assert.deepEqual(
    nodes.map((n) => n.position),
    [
      { x: 40, y: 40 },
      { x: -7, y: 900 },
    ],
  );
});

test("flowToWorkflow — with `settings` absent, every step gets an INTEGER position", () => {
  // Absent settings ⇒ savePosition is ON (the amendment's `?? true`, read here as
  // `!== false`). React Flow reports fractional coordinates, so the written value
  // must be rounded — an unrounded float makes a no-op render look like a change
  // to an auto-save that dedupes on the serialized payload.
  const nodes = nodesOf(WF).map((n, i) => ({ ...n, position: { x: 100.4 + i, y: 200.6 - i } }));
  const next = flowToWorkflow(WF, nodes, []);
  assert.equal(next.settings, undefined, "settings must not be invented");
  assert.deepEqual(
    next.steps.map((s) => s.position),
    [
      { x: 100, y: 201 },
      { x: 101, y: 200 },
      { x: 102, y: 199 },
    ],
  );
  for (const s of next.steps) {
    assert.ok(Number.isInteger(s.position?.x), `x not an integer: ${s.position?.x}`);
    assert.ok(Number.isInteger(s.position?.y), `y not an integer: ${s.position?.y}`);
  }
});

test("flowToWorkflow — savePosition:false writes NO position and ERASES none", () => {
  // "Not written" is not "erased": turning your own toggle off must not destroy a
  // coordinate a colleague already stored (amendment — "any values already stored
  // are left as they are, not erased"). Deep equality against the INPUT steps is
  // the only assertion that catches a delete, so it is deliberately whole-object.
  const wf: FlowWorkflow = {
    ...WF,
    steps: [{ ...WF.steps[0], position: { x: 11, y: 22 } }, WF.steps[1], WF.steps[2]],
    settings: { savePosition: false },
  };
  const nodes = nodesOf(wf).map((n) => ({ ...n, position: { x: 999.5, y: 888.5 } }));
  const next = flowToWorkflow(wf, nodes, []);
  assert.deepEqual(next.steps, wf.steps);
});

// ── ADDENDUM A: `computeLayers` must TERMINATE on a cyclic graph ─────────────
//
// The layering iterated `while (changed)` to a fixpoint on the stated assumption
// "for a DAG this converges". The engine rejects cycles at plan time — but this
// editor lets you DRAW one, and `workflowToFlow` calls the layering on open, so a
// cyclic workflow froze the tab on load (and would have frozen it mid-edit once
// an auto-layout button called the same code from a click).

/** `a → b → c → a`: the cycle the editor lets an author draw. */
const CYCLIC: FlowWorkflow = {
  ...WF,
  edges: [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "a" },
  ],
};

/** A one-step cycle — the degenerate case, drawable by dropping an edge on itself. */
const SELF_LOOP: FlowWorkflow = { ...WF, edges: [{ from: "a", to: "a" }] };

test("workflowToFlow TERMINATES on a cyclic graph (hard timeout, out of process)", () => {
  // Asserted in a CHILD process under a wall-clock timeout, because the loop this
  // pins is *synchronous*: node:test's own `timeout` option cannot interrupt a
  // spinning `while`, so a regression here would hang this suite instead of
  // failing it. The child prints TERMINATED only if workflowToFlow returns.
  const here = dirname(fileURLToPath(import.meta.url));
  const modUrl = pathToFileURL(join(here, "flow-utils.ts")).href;
  const probe = [
    `const { workflowToFlow } = await import(${JSON.stringify(modUrl)});`,
    `const { nodes } = workflowToFlow(${JSON.stringify(CYCLIC)});`,
    "if (nodes.length !== 3) throw new Error(`node count ${nodes.length}`);",
    'process.stdout.write("TERMINATED");',
  ].join("\n");
  const r = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(
    r.signal,
    null,
    `child killed by ${r.signal} — the layering did not terminate on a cycle`,
  );
  assert.equal(r.status, 0, `child failed: ${r.stderr}`);
  assert.equal(r.stdout.trim(), "TERMINATED");
});

test("a cyclic graph still lays out USABLY — on canvas, no two steps on one point", () => {
  // Terminating is not enough: the author has to be able to SEE the loop they
  // drew in order to delete an edge, so a cycle must not push nodes to an
  // unreachable coordinate and must not stack them on top of each other. Runaway
  // columns are clamped to the last real one (3 steps ⇒ columns 0..2 ⇒ x ≤ 520).
  for (const wf of [CYCLIC, SELF_LOOP]) {
    const { nodes } = workflowToFlow(wf);
    assert.equal(nodes.length, 3);
    for (const n of nodes) {
      assert.ok(Number.isFinite(n.position.x), `${n.id}: x is ${n.position.x}`);
      assert.ok(Number.isFinite(n.position.y), `${n.id}: y is ${n.position.y}`);
      assert.ok(n.position.x >= 40 && n.position.x <= 40 + 2 * 240, `${n.id}: x ${n.position.x}`);
      assert.ok(n.position.y >= 40 && n.position.y <= 40 + 2 * 100, `${n.id}: y ${n.position.y}`);
    }
    assert.equal(
      new Set(nodes.map((n) => `${n.position.x},${n.position.y}`)).size,
      3,
      "two steps landed on the same point",
    );
  }
});
