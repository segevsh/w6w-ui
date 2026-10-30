// Run: node --test src/__tests__/flow-loop.test.ts   (Node 24, type-stripped)
//
// The pure loop core: the canvas-only `each` lane, body derivation (never trusted
// from a stored `with.body`), load + legacy conversion (D-A3), lifecycle helpers.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge } from "@xyflow/react";
import { renameStepInEdges } from "../flow-connect.ts";
import {
  type LoopInvalidReason,
  bridgeDeletedBodyStep,
  definitionLoops,
  loopBody,
  deleteStepMessage,
  loopMembership,
  stampLoopOf,
  stripBody,
} from "../flow-loop.ts";
import type { FlowEdge, FlowStep, FlowWorkflow } from "../flow-types.ts";
import {
  type StepNode,
  flowToWorkflow,
  paramsToJson,
  stepToJson,
  workflowToFlow,
} from "../flow-utils.ts";

const FE = { app: "@w6w/control", action: "foreach" };
const step = (id: string, extra: Partial<FlowStep> = {}, i = 0): FlowStep => ({
  id,
  uses: { app: "@w6w/script", action: "run" },
  position: { x: i * 10, y: 0 },
  ...extra,
});
const fe = (id: string, w: Record<string, unknown> = { items: ["a"] }, i = 0): FlowStep => ({
  id,
  uses: FE,
  with: w,
  position: { x: i * 10, y: 0 },
});
const wfOf = (nodes: FlowStep[], edges?: FlowEdge[]): FlowWorkflow =>
  ({ nodes, ...(edges ? { edges } : {}) }) as FlowWorkflow;
const roundTrip = (wf: FlowWorkflow) => {
  const g = workflowToFlow(wf);
  return flowToWorkflow(wf, g.nodes, g.edges);
};
const same = (wf: FlowWorkflow) => assert.equal(JSON.stringify(roundTrip(wf)), JSON.stringify(wf));
const eachEdges = (g: { edges: Edge[] }) =>
  g.edges.filter((e) => (e.data as { when?: string }).when === "each");

// ── §5.2 round trip ────────────────────────────────────────────────────────
test("round trip (a) body-less For each, no success successor", () => {
  same(wfOf([step("s", {}, 0), fe("f", { items: ["a"], x: 1 }, 1)], [{ from: "s", to: "f" }]));
});
test("round trip (b) 1-step body", () => {
  same(wfOf([fe("f", { items: ["a"], body: ["b1"], z: 1 }), step("b1", {}, 1)], []));
});
test("round trip (c) 3-step body", () => {
  same(
    wfOf(
      [
        fe("f", { items: ["a"], body: ["b1", "b2", "b3"], z: 1 }),
        step("b1", {}, 1),
        step("b2", {}, 2),
        step("b3", {}, 3),
      ],
      [],
    ),
  );
});
test("round trip (d) body + Done-side node", () => {
  same(
    wfOf(
      [fe("f", { items: ["a"], body: ["b1"], z: 1 }), step("b1", {}, 1), step("d", {}, 2)],
      [{ from: "f", to: "d" }],
    ),
  );
});
test("round trip (e) body + error edge out of the For each", () => {
  same(
    wfOf(
      [fe("f", { items: ["a"], body: ["b1"], z: 1 }), step("b1", {}, 1), step("h", {}, 2)],
      [{ from: "f", to: "h", when: "error" }],
    ),
  );
});
test("round trip (f) body: [] + Done-side node", () => {
  same(
    wfOf([fe("f", { items: ["a"], body: [], z: 1 }), step("d", {}, 1)], [{ from: "f", to: "d" }]),
  );
});
test("round trip (g) an invalid body is kept verbatim", () => {
  same(
    wfOf(
      [fe("f", { items: ["a"], body: ["ghost"], z: 1 }), step("d", {}, 1)],
      [{ from: "f", to: "d" }],
    ),
  );
});
test("round trip (h) a legacy_not_linear shape is kept (fan-out)", () => {
  same(
    wfOf(
      [fe("f", { items: ["a"], z: 1 }), step("x", {}, 1), step("y", {}, 2)],
      [
        { from: "f", to: "x" },
        { from: "f", to: "y" },
      ],
    ),
  );
});

// ── Body derivation + edge sink ────────────────────────────────────────────
const canvas = (nodes: FlowStep[], _edges: Edge[]): StepNode[] =>
  nodes.map((s) => ({
    id: s.id,
    type: "step",
    position: { x: 0, y: 0 },
    data: { step: s, isInternal: false },
  }));
const each = (from: string, to: string, fromFe = false): Edge => ({
  id: `${from}->${to}`,
  source: from,
  target: to,
  sourceHandle: fromFe ? "out-each" : undefined,
  data: { when: "each" },
});

test("a stale stored body is never trusted: the drawn chain is emitted", () => {
  const steps = [fe("f", { items: ["a"], body: ["x"] }), step("b1"), step("b2"), step("x")];
  const orig = wfOf(steps, []);
  const out = flowToWorkflow(orig, canvas(steps, []), [each("f", "b1", true), each("b1", "b2")]);
  assert.deepEqual(out.nodes[0].with?.body, ["b1", "b2"]);
});

test("a duplicated foreach (cloned body, no edges) emits no body; the original keeps its body once", () => {
  const f = fe("f", { items: ["a"], body: ["b1"] });
  const dup = fe("f_copy", { items: ["a"], body: ["b1"] });
  const steps = [f, step("b1"), dup];
  const out = flowToWorkflow(wfOf([f, step("b1")], []), canvas(steps, []), [each("f", "b1", true)]);
  assert.deepEqual(out.nodes.find((n) => n.id === "f")?.with?.body, ["b1"]);
  assert.equal("body" in (out.nodes.find((n) => n.id === "f_copy")?.with ?? {}), false);
});

test("converging chains emit disjoint bodies; edges[] has no each edge and none touching a body id", () => {
  const steps = [fe("f1"), fe("f2"), step("a"), step("m"), step("z")];
  const edges = [
    each("f1", "a", true),
    each("a", "m"),
    each("f2", "m", true),
    each("m", "z"),
    { id: "a->z", source: "a", target: "z", data: { when: "success" } } as Edge,
    { id: "z->q", source: "z", target: "q", data: { when: "error" } } as Edge,
    { id: "f1->z", source: "f1", target: "z", data: { when: "success" } } as Edge,
  ];
  const out = flowToWorkflow(wfOf(steps, []), canvas(steps, edges), edges);
  assert.deepEqual(out.nodes[0].with?.body, ["a", "m", "z"]);
  assert.equal("body" in (out.nodes[1].with ?? {}), false);
  assert.deepEqual(out.edges, []);
});

test("paramsToJson write-back (with lacking body) still emits the derived body", () => {
  const f = fe("f", { items: ["b"] });
  const steps = [f, step("b1")];
  const out = flowToWorkflow(
    wfOf([fe("f", { items: ["a"], body: ["b1"] }), step("b1")], []),
    canvas(steps, []),
    [each("f", "b1", true)],
  );
  assert.deepEqual(out.nodes[0].with, { items: ["b"], body: ["b1"] });
});

test("loopOf / legacyLoop never change the emitted output", () => {
  const wf = wfOf([fe("f", { items: ["a"] }), step("b1", {}, 1)], [{ from: "f", to: "b1" }]);
  const g = workflowToFlow(wf);
  const plain = g.nodes.map((n) => {
    const { loopOf: _l, legacyLoop: _g, ...data } = n.data;
    return { ...n, data };
  });
  assert.equal(
    JSON.stringify(flowToWorkflow(wf, g.nodes, g.edges)),
    JSON.stringify(flowToWorkflow(wf, plain, g.edges)),
  );
});

test("a NEW foreach with only a Done edge emits body: [] and reloads on Done", () => {
  const f = fe("n");
  const steps = [f, step("d")];
  const edges = [{ id: "n->d", source: "n", target: "d", data: { when: "success" } } as Edge];
  const out = flowToWorkflow(wfOf([step("d")], []), canvas(steps, edges), edges);
  assert.deepEqual(out.nodes.find((n) => n.id === "n")?.with?.body, []);
  const g = workflowToFlow(out);
  assert.equal(eachEdges(g).length, 0);
  assert.equal(g.nodes.find((n) => n.id === "n")?.data.legacyLoop, undefined);
});

// ── Load + legacy (F0) ─────────────────────────────────────────────────────
const f0 = (): FlowWorkflow =>
  wfOf(
    [
      step("create_event_1", {}, 0),
      step("eventbrite_to_cohost_1", {}, 1),
      fe("for_each_1", { items: ["{{ nodes.eventbrite_to_cohost_1.output.tickets }}"] }, 2),
      step(
        "update_event_ticket_1",
        {
          with: {
            event: "{{ nodes.create_event_1.output.id }}",
            ticket: "{{ nodes.for_each_1.output }}",
          },
        },
        3,
      ),
    ],
    [
      { from: "create_event_1", to: "eventbrite_to_cohost_1" },
      { from: "eventbrite_to_cohost_1", to: "for_each_1" },
      { from: "for_each_1", to: "update_event_ticket_1" },
    ],
  );

test("F0 legacy loads as an each-lane edge and re-emits the fixed shape, expressions intact", () => {
  const wf = f0();
  const g = workflowToFlow(wf);
  const ee = eachEdges(g);
  assert.equal(ee.length, 1);
  assert.equal(ee[0].id, "for_each_1->update_event_ticket_1");
  assert.equal(ee[0].sourceHandle, "out-each");
  assert.equal(ee[0].className, "w6w-edge-each");
  assert.equal(g.nodes.find((n) => n.id === "for_each_1")?.data.legacyLoop, true);
  assert.equal(g.nodes.find((n) => n.id === "update_event_ticket_1")?.data.loopOf, "for_each_1");
  const out = flowToWorkflow(wf, g.nodes, g.edges);
  assert.deepEqual(out.nodes[2].with, {
    items: ["{{ nodes.eventbrite_to_cohost_1.output.tickets }}"],
    body: ["update_event_ticket_1"],
  });
  assert.deepEqual(out.nodes[3].with, wf.nodes[3].with);
  assert.deepEqual(out.edges, [
    { from: "create_event_1", to: "eventbrite_to_cohost_1" },
    { from: "eventbrite_to_cohost_1", to: "for_each_1" },
  ]);
});

const invalidFixtures: Record<LoopInvalidReason, FlowWorkflow> = {
  body_not_literal: wfOf([fe("f", { body: "{{ x }}" })], []),
  body_unknown_step: wfOf([fe("f", { body: ["ghost"] })], []),
  body_self: wfOf([fe("f", { body: ["f"] })], []),
  body_duplicate: wfOf([fe("f", { body: ["a", "a"] }), step("a")], []),
  body_claimed_twice: wfOf([fe("f", { body: ["a"] }), fe("g", { body: ["a"] }), step("a")], []),
  body_contains_control: wfOf([fe("f", { body: ["g"] }), fe("g", {})], []),
  body_step_has_edges: wfOf(
    [fe("f", { body: ["a"] }), step("a"), step("z")],
    [{ from: "a", to: "z" }],
  ),
  legacy_not_linear: wfOf(
    [fe("f"), step("x"), step("y")],
    [
      { from: "f", to: "x" },
      { from: "f", to: "y" },
    ],
  ),
};
for (const [reason, wf] of Object.entries(invalidFixtures)) {
  test(`definitionLoops: ${reason}`, () => {
    const r = definitionLoops(wf).f;
    assert.ok("invalid" in r, JSON.stringify(r));
    assert.equal(r.invalid.reason, reason);
    assert.doesNotThrow(() => workflowToFlow(wf));
    assert.equal(eachEdges(workflowToFlow(wf)).length, 0);
  });
}

test("fan-in and control-in-chain legacy shapes load on Done", () => {
  const fanIn = wfOf(
    [fe("f"), step("x"), step("y")],
    [
      { from: "f", to: "x" },
      { from: "y", to: "x" },
    ],
  );
  const ctl = wfOf([fe("f"), fe("g", { items: ["a"] })], [{ from: "f", to: "g" }]);
  for (const wf of [fanIn, ctl]) {
    const g = workflowToFlow(wf);
    assert.equal(eachEdges(g).length, 0);
    assert.equal(g.edges.length, wf.edges?.length);
    assert.equal(
      g.nodes.some((n) => n.data.legacyLoop),
      false,
    );
  }
});

test("edges-absent: if.then and foreach.body members get no success edge", () => {
  const wf = wfOf([
    step("t"),
    {
      id: "i",
      uses: { app: "@w6w/control", action: "if" },
      // biome-ignore lint/suspicious/noThenProperty: the engine's `if` param is literally `then`
      with: { then: ["x"] },
    },
    fe("f", { items: ["a"], body: ["y"] }),
    step("x"),
    step("y"),
    step("end"),
  ]);
  const g = workflowToFlow(wf);
  const touched = g.edges
    .filter((e) => (e.data as { when?: string }).when !== "each")
    .flatMap((e) => [e.source, e.target]);
  assert.equal(touched.includes("x"), false);
  assert.equal(touched.includes("y"), false);
  assert.deepEqual(
    eachEdges(g).map((e) => e.id),
    ["f->y"],
  );
});

// ── Lifecycle ──────────────────────────────────────────────────────────────
const chainGraph = () => {
  const steps = [fe("f"), step("b1"), step("b2"), step("b3")];
  const edges = [each("f", "b1", true), each("b1", "b2"), each("b2", "b3")];
  return { steps, nodes: canvas(steps, edges), edges };
};

test("loopBody / loopMembership follow the each lane and terminate on a cycle", () => {
  const { nodes, edges } = chainGraph();
  assert.deepEqual(loopBody("f", nodes, edges), ["b1", "b2", "b3"]);
  assert.deepEqual(loopMembership(nodes, edges), { b1: "f", b2: "f", b3: "f" });
  assert.deepEqual(loopBody("f", nodes, [...edges, each("b3", "b1"), each("b3", "f")]), [
    "b1",
    "b2",
    "b3",
  ]);
});

test("rename keeps the lane and sourceHandle; the body lists the new id in place", () => {
  const { steps, edges } = chainGraph();
  const ren = renameStepInEdges(renameStepInEdges(edges, "b2", "m"), "f", "loop");
  assert.deepEqual(
    ren.map((e) => [e.id, (e.data as { when: string }).when, e.sourceHandle]),
    [
      ["loop->b1", "each", "out-each"],
      ["b1->m", "each", undefined],
      ["m->b3", "each", undefined],
    ],
  );
  const renamed = steps.map((s) =>
    s.id === "b2" ? { ...s, id: "m" } : s.id === "f" ? { ...s, id: "loop" } : s,
  );
  const out = flowToWorkflow(wfOf(steps, []), canvas(renamed, ren), ren);
  assert.deepEqual(out.nodes.find((n) => n.id === "loop")?.with?.body, ["b1", "m", "b3"]);
});

test("bridgeDeletedBodyStep: mid, first, last, the foreach, a non-body step", () => {
  const { nodes, edges } = chainGraph();
  const ids = (es: Edge[]) => es.map((e) => `${e.id}|${e.sourceHandle ?? ""}`);
  assert.deepEqual(ids(bridgeDeletedBodyStep("b2", nodes, edges)), ["f->b1|out-each", "b1->b3|"]);
  assert.deepEqual(ids(bridgeDeletedBodyStep("b1", nodes, edges)), ["b2->b3|", "f->b2|out-each"]);
  assert.deepEqual(ids(bridgeDeletedBodyStep("b3", nodes, edges)), ["f->b1|out-each", "b1->b2|"]);
  assert.deepEqual(bridgeDeletedBodyStep("f", nodes, edges), []);
  const bridged = bridgeDeletedBodyStep("b1", nodes, edges).find((e) => e.id === "f->b2");
  assert.deepEqual(bridged?.data, { when: "each" });
  const extra = [...nodes, ...canvas([step("o")], [])];
  const other = [
    ...edges,
    { id: "o->b1", source: "o", target: "b1", data: { when: "success" } } as Edge,
  ];
  assert.deepEqual(
    bridgeDeletedBodyStep("o", extra, other),
    other.filter((e) => e.source !== "o" && e.target !== "o"),
  );
});

test("stripBody and the JSON view drop body from a foreach only (P1)", () => {
  const f = fe("f", { items: ["a"], body: ["b"] });
  const http = step("h", {
    uses: { app: "@w6w/http", action: "request" },
    with: { body: { a: 1 } },
  });
  assert.deepEqual(stripBody(f).with, { items: ["a"] });
  assert.deepEqual(stripBody(http).with, { body: { a: 1 } });
  assert.equal(stripBody(http), http);
  assert.equal("body" in JSON.parse(paramsToJson(f)), false);
  assert.equal("body" in (JSON.parse(stepToJson(f)).with ?? {}), false);
  assert.deepEqual(JSON.parse(paramsToJson(http)), { body: { a: 1 } });
  assert.deepEqual(JSON.parse(stepToJson(http)).with, { body: { a: 1 } });
});

test("the persisted FlowEdge.when never gains 'each'", () => {
  // @ts-expect-error — "each" is canvas-only; widening the persisted type must turn tsc red.
  const bad: FlowEdge = { from: "a", to: "b", when: "each" };
  assert.ok(bad);
});

// ── T2.3.1: stamp + delete message ─────────────────────────────────────────
test("C14 stampLoopOf stamps F0 legacy, is identity on re-run, clears on edge removal", () => {
  const g = workflowToFlow(f0());
  const bare = g.nodes.map((n) => {
    const { loopOf: _l, ...data } = n.data;
    return { ...n, data };
  });
  const stamped = stampLoopOf(bare, g.edges);
  assert.equal(stamped.find((n) => n.id === "update_event_ticket_1")?.data.loopOf, "for_each_1");
  assert.equal(stampLoopOf(stamped, g.edges), stamped);
  const cleared = stampLoopOf(
    stamped,
    g.edges.filter((e) => (e.data as { when?: string }).when !== "each"),
  );
  assert.equal(cleared.find((n) => n.id === "update_event_ticket_1")?.data.loopOf, undefined);
  assert.equal("loopOf" in (cleared.find((n) => n.id === "update_event_ticket_1")?.data ?? {}), false);
  assert.equal(cleared[0], stamped[0]);
});

test("C17 deleteStepMessage: plain text unless a For each owns a body", () => {
  const g = workflowToFlow(f0());
  const plain = (id: string) => `Delete node "${id}"? Its connections are removed too.`;
  assert.equal(deleteStepMessage("create_event_1", g.nodes, g.edges), plain("create_event_1"));
  const noBody = workflowToFlow(wfOf([fe("only")]));
  assert.equal(deleteStepMessage("only", noBody.nodes, noBody.edges), plain("only"));
  const m = deleteStepMessage("for_each_1", g.nodes, g.edges);
  assert.ok(m.startsWith(plain("for_each_1")));
  assert.ok(m.includes('"update_event_ticket_1"'));
});
