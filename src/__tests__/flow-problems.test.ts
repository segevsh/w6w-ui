// Run: node --experimental-strip-types --test src/__tests__/flow-problems.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { loopMembership } from "../flow-loop.ts";
import { applyStepProblemFix, findLoopProblems } from "../flow-problems.ts";
import type { FlowStep } from "../flow-types.ts";
import { workflowToFlow } from "../flow-utils.ts";
import type { StepProblem } from "../step-problems.ts";

const FE = { app: "@w6w/control", action: "foreach" };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const legacyNodes = (): FlowStep[] => [
  { id: "create_event_1", uses: { app: "cohost", action: "create-event" } },
  {
    id: "for_each_1",
    uses: FE,
    with: { items: ["{{ nodes.eventbrite_to_cohost_1.output.tickets }}"] },
  },
  {
    id: "update_event_ticket_1",
    uses: { app: "cohost", action: "update-ticket" },
    with: {
      event: "{{ nodes.create_event_1.output.id }}",
      ticket: "{{ nodes.for_each_1.output }}",
    },
  },
];
const F0 = () => ({
  manifestVersion: "2",
  id: "wf",
  name: "f0",
  nodes: legacyNodes(),
  edges: [
    { from: "create_event_1", to: "for_each_1" },
    { from: "for_each_1", to: "update_event_ticket_1" },
  ],
});
const F0_FIXED = () => {
  const nodes = legacyNodes();
  nodes[1].with = {
    items: "{{ nodes.eventbrite_to_cohost_1.output.tickets }}",
    body: ["update_event_ticket_1"],
  };
  nodes[2].with = {
    event: "{{ nodes.create_event_1.output.id }}",
    ticket: "{{ foreach.item }}",
  };
  return {
    manifestVersion: "2",
    id: "wf",
    name: "f0",
    nodes,
    edges: [{ from: "create_event_1", to: "for_each_1" }],
  };
};

test("F0 legacy: exactly the two steps, one problem each, event ref untouched", () => {
  const out = findLoopProblems(F0() as never);
  assert.deepEqual(Object.keys(out).sort(), ["for_each_1", "update_event_ticket_1"]);
  assert.deepEqual(
    out.for_each_1.map((p) => p.code),
    ["foreach_wrapped_items"],
  );
  assert.equal(out.update_event_ticket_1.length, 1);
  const p = out.update_event_ticket_1[0];
  assert.equal(p.code, "foreach_body_refs_output");
  if (p.code === "foreach_body_refs_output") {
    assert.equal(p.foreachId, "for_each_1");
    assert.deepEqual(p.refs, ["nodes.for_each_1.output"]);
  }
});

test("F0 legacy under the steps key gives the same result", () => {
  const { nodes, ...rest } = F0();
  assert.deepEqual(
    findLoopProblems({ ...rest, steps: nodes } as never),
    findLoopProblems(F0() as never),
  );
});

test("F0 fixed is clean; nodes+steps together returns {} without throwing", () => {
  assert.deepEqual(findLoopProblems(F0_FIXED() as never), {});
  const both = { ...F0(), steps: legacyNodes() };
  assert.deepEqual(findLoopProblems(both as never), {});
});

test("garbage input never throws", () => {
  for (const bad of [null, undefined, 3, {}, { nodes: "x" }, { nodes: [null] }]) {
    assert.doesNotThrow(() => findLoopProblems(bad as never));
  }
});

// A fixed loop whose body step carries `with`.
const loopOf = (w: Record<string, unknown>, extra: FlowStep[] = [], edges: unknown[] = []) => ({
  manifestVersion: "2",
  id: "wf",
  name: "n",
  nodes: [
    { id: "f", uses: FE, with: { items: "{{ vars.xs }}", body: ["s"] } },
    { id: "s", uses: { app: "x", action: "y" }, with: w },
    ...extra,
  ],
  edges,
});
const refsOf = (w: Record<string, unknown>): string[] | undefined => {
  const p = findLoopProblems(loopOf(w) as never).s?.[0];
  return p?.code === "foreach_body_refs_output" ? p.refs : undefined;
};

test("matcher: both roots, mixed text, $ markers, nesting", () => {
  assert.deepEqual(refsOf({ a: "{{ nodes.f.output }}" }), ["nodes.f.output"]);
  assert.deepEqual(refsOf({ a: "{{ steps.f.output.x }}" }), ["steps.f.output.x"]);
  assert.deepEqual(refsOf({ a: "Ticket {{ nodes.f.output.name }} x" }), ["nodes.f.output.name"]);
  assert.deepEqual(refsOf({ a: { $: "nodes.f.output.id" } }), ["nodes.f.output.id"]);
  assert.deepEqual(refsOf({ a: { b: [{ c: "{{ nodes.f.output[0] }}" }] } }), ["nodes.f.output[0]"]);
  assert.deepEqual(
    refsOf({
      z: "{{ nodes.f.output.b }}",
      a: ["{{ nodes.f.output.a }}", "{{ nodes.f.output.b }}"],
    }),
    ["nodes.f.output.b", "nodes.f.output.a"],
  );
});

test("matcher: negatives (boundary, other loop, vendor tag, $expr var, expr part)", () => {
  assert.equal(refsOf({ a: "{{ nodes.f.outputs }}" }), undefined);
  assert.equal(refsOf({ a: "{{ nodes.f.output_x }}" }), undefined);
  assert.equal(refsOf({ a: "{{ nodes.f0.output }}" }), undefined);
  assert.equal(refsOf({ a: "{{ nodes.for_each_10.output }}" }), undefined);
  assert.equal(refsOf({ a: "{{tag}}" }), undefined);
  assert.equal(refsOf({ a: "{{ vars.q }}" }), undefined);
  assert.equal(refsOf({ a: { $expr: { var: "nodes.f.output" } } }), undefined);
  assert.equal(refsOf({ a: '{{ nodes.f.output || "x" }}' }), undefined);
  assert.equal(refsOf({ a: { $: "nodes.f.outputs" } }), undefined);
});

test("a Done-side (non-body) step referencing the For each is not flagged", () => {
  const def = loopOf(
    {},
    [{ id: "after", uses: { app: "x", action: "y" }, with: { a: "{{ nodes.f.output }}" } }],
    [{ from: "f", to: "after" }],
  );
  assert.deepEqual(findLoopProblems(def as never), {});
});

test("every flagged step is a loop member of the flagged foreachId (relation)", () => {
  for (const def of [F0(), loopOf({ a: "{{ nodes.f.output }}" })]) {
    const out = findLoopProblems(def as never);
    const { nodes, edges } = workflowToFlow(def as never);
    const M = loopMembership(nodes, edges);
    for (const [id, ps] of Object.entries(out)) {
      for (const p of ps) {
        if (p.code === "foreach_body_refs_output") assert.equal(M[id], p.foreachId);
      }
    }
  }
});

const wrappedOf = (items: unknown) =>
  findLoopProblems({
    manifestVersion: "2",
    id: "w",
    name: "n",
    nodes: [{ id: "f", uses: FE, with: { items } }],
    edges: [],
  } as never).f?.some((p) => p.code === "foreach_wrapped_items") ?? false;

test("wrapped Items: exactly a length-1 array holding a whole-value ref", () => {
  assert.equal(wrappedOf(["{{ vars.a }}"]), true);
  assert.equal(wrappedOf([{ $: "vars.a" }]), true);
  for (const no of [
    ["a"],
    [],
    ["{{ vars.a }}", "{{ vars.b }}"],
    ["x {{ vars.a }}"],
    "{{ vars.a }}",
    [{ $: 1 }],
  ]) {
    assert.equal(wrappedOf(no), false, JSON.stringify(no));
  }
});

test("invalid loops get exactly one loop_body_invalid with that reason and no fix", () => {
  const second = F0() as { nodes: FlowStep[]; edges: unknown[] };
  second.nodes.push({ id: "other", uses: { app: "x", action: "y" } });
  second.edges.push({ from: "for_each_1", to: "other" });
  const a = findLoopProblems(second as never).for_each_1.filter(
    (p) => p.code === "loop_body_invalid",
  );
  assert.equal(a.length, 1);
  assert.equal("fix" in a[0], false);
  assert.deepEqual((a[0] as { reason: unknown }).reason, {
    reason: "legacy_not_linear",
    stepId: "for_each_1",
  });
  const lit = loopOf({}) as { nodes: FlowStep[] };
  lit.nodes[0].with = { items: "{{ vars.xs }}", body: "s" };
  const b = findLoopProblems(lit as never).f;
  assert.equal(b.length, 1);
  assert.equal(b[0].code, "loop_body_invalid");
  assert.equal((b[0] as { reason: { reason: string } }).reason.reason, "body_not_literal");
});

test("fixes: both on F0 legacy give exactly F0-fixed `with`; input never mutated", () => {
  const def = F0();
  const frozen = clone(def);
  const out = findLoopProblems(def as never);
  assert.deepEqual(def, frozen);
  let [fe, upd] = [def.nodes[1], def.nodes[2]];
  fe = applyStepProblemFix(fe, out.for_each_1[0]);
  upd = applyStepProblemFix(upd, out.update_event_ticket_1[0]);
  assert.deepEqual(def, frozen);
  const fixed = F0_FIXED();
  assert.equal(
    (fe.with as { items: unknown }).items,
    (fixed.nodes[1].with as { items: unknown }).items,
  );
  assert.deepEqual(upd.with, fixed.nodes[2].with);
});

test("applier: rewrites every ref, preserves surrounding text, re-scans the step", () => {
  const step: FlowStep = {
    id: "s",
    uses: { app: "x", action: "y" },
    with: {
      a: "A {{ nodes.f.output.n }} B {{ steps.f.output }} C {{ nodes.g.output }}",
      b: { $: "nodes.f.output.k" },
    },
  };
  const stale: StepProblem = {
    code: "foreach_body_refs_output",
    foreachId: "f",
    refs: [],
    fix: { kind: "use_current_item", foreachId: "f", label: "Use Current item" },
  };
  const next = applyStepProblemFix(step, stale);
  assert.deepEqual(next.with, {
    a: "A {{ foreach.item.n }} B {{ foreach.item }} C {{ nodes.g.output }}",
    b: { $: "foreach.item.k" },
  });
  assert.equal(
    (step.with as { a: string }).a,
    "A {{ nodes.f.output.n }} B {{ steps.f.output }} C {{ nodes.g.output }}",
  );
});

test("applier returns the same reference when there is nothing to do or no fix", () => {
  const step: FlowStep = { id: "s", uses: { app: "x", action: "y" }, with: { a: "plain" } };
  const conn: StepProblem = { code: "unknown_connection", connection: "c" };
  const inv: StepProblem = { code: "loop_body_invalid", reason: { reason: "body_self" } };
  assert.equal(applyStepProblemFix(step, conn), step);
  assert.equal(applyStepProblemFix(step, inv), step);
  const refs: StepProblem = {
    code: "foreach_body_refs_output",
    foreachId: "f",
    refs: ["x"],
    fix: { kind: "use_current_item", foreachId: "f", label: "Use Current item" },
  };
  assert.equal(applyStepProblemFix(step, refs), step);
  assert.equal(
    applyStepProblemFix(step, {
      code: "foreach_wrapped_items",
      fix: { kind: "unwrap_items", label: "Unwrap Items" },
    }),
    step,
  );
});
