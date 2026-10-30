// Run: node --test src/__tests__/step-preview-state.test.ts  (Node 24, type-stripped)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CALL_APP,
  CONTROL_APP,
  DOCUMENT_APP,
  HTTP_APP,
  SCHEDULER_APP,
  TEMPLATE_APP,
  TRIGGER_APP,
  WEBHOOK_APP,
} from "../flow-types.ts";
import type { FlowEdge, FlowStep, FlowWorkflow } from "../flow-types.ts";
import type { StepNode } from "../flow-utils.ts";
import { workflowToFlow } from "../flow-utils.ts";
import type { StepMeta, StepTest } from "../provider.tsx";
import {
  fetchSeedSources,
  loopItemText,
  loopSeedFromSource,
  parseLoopSeed,
  resolveLoopItems,
  startStateFromSeeds,
  stepBuilderLoop,
  stepBuilderUpstreamSteps,
  stepMetaSampleValues,
  upstreamSampleValues,
  upstreamStateSources,
} from "../step-preview-state.ts";

function node(id: string, app = "@w6w/script", action = "run"): StepNode {
  return {
    id,
    type: "step",
    position: { x: 0, y: 0 },
    data: { step: { id, uses: { app, action } }, isInternal: false },
  };
}
function edge(source: string, target: string) {
  return { id: `${source}->${target}`, source, target };
}

test("stepBuilderUpstreamSteps — no pendingConnect (floating add) → []", () => {
  assert.deepEqual(stepBuilderUpstreamSteps(null, [node("gate_1")], []), []);
});

test("stepBuilderUpstreamSteps — dragged off a SOURCE handle → that node IS upstream", () => {
  const nodes = [node("gate_1"), node("mid")];
  const edges = [edge("gate_1", "mid")];
  const result = stepBuilderUpstreamSteps({ nodeId: "mid", handleType: "source" }, nodes, edges);
  assert.deepEqual(result.map((s) => s.id).sort(), ["gate_1", "mid"]);
});

test("stepBuilderUpstreamSteps — dragged off a TARGET handle → downstream, not upstream", () => {
  const nodes = [node("gate_1"), node("mid")];
  const edges = [edge("gate_1", "mid")];
  const result = stepBuilderUpstreamSteps({ nodeId: "mid", handleType: "target" }, nodes, edges);
  assert.deepEqual(result, []);
});

test("stepBuilderUpstreamSteps — source handle drag also carries the dragged node's OWN ancestors", () => {
  const nodes = [node("gate_1"), node("mid")];
  const edges = [edge("gate_1", "mid")];
  const result = stepBuilderUpstreamSteps({ nodeId: "mid", handleType: "source" }, nodes, edges);
  assert.ok(result.some((s) => s.id === "gate_1"));
});

function fixture(output: unknown): StepTest {
  return {
    id: "t1",
    workflowId: "w1",
    stepId: "gate_1",
    name: null,
    input: {},
    with: {},
    createdAt: "",
    updatedAt: "",
    lastRunOutput: output,
  };
}

test("fetchSeedSources — a saved fixture with output IS returned (value present)", async () => {
  const seeds = await fetchSeedSources(
    async (id) => (id === "gate_1" ? [fixture({ to: "a@b.com" })] : []),
    [{ id: "gate_1", label: "gate_1" }],
  );
  assert.deepEqual(seeds, [
    { stepId: "gate_1", label: "gate_1", test: fixture({ to: "a@b.com" }) },
  ]);
});

test("fetchSeedSources — no saved fixture yet contributes nothing (value absent)", async () => {
  const seeds = await fetchSeedSources(async () => [], [{ id: "gate_1", label: "gate_1" }]);
  assert.deepEqual(seeds, []);
});

test("startStateFromSeeds — a captured output projects to steps.<id>.output (value present)", () => {
  const seeds = [{ stepId: "gate_1", label: "gate_1", test: fixture({ to: "a@b.com" }) }];
  assert.deepEqual(startStateFromSeeds(seeds), {
    steps: { gate_1: { output: { to: "a@b.com" } } },
  });
});

test("startStateFromSeeds — no seeds at all → undefined, not {} (value absent)", () => {
  assert.equal(startStateFromSeeds([]), undefined);
});

test("startStateFromSeeds — a fixture that never captured an output is skipped, not seeded as null", () => {
  const seeds = [{ stepId: "gate_1", label: "gate_1", test: fixture(null) }];
  assert.equal(startStateFromSeeds(seeds), undefined);
});

test("upstreamStateSources — a manual trigger ancestor is flagged and carries declared field outputs", () => {
  const trig = node("gate_1", TRIGGER_APP, "manual");
  trig.data.step.with = { fields: [{ key: "to" }, { key: "first_name" }] };
  const nodes = [trig, node("mid")];
  const edges = [edge("gate_1", "mid")];
  const { steps, hasTrigger } = upstreamStateSources("mid", nodes, edges);
  assert.equal(hasTrigger, true);
  assert.deepEqual(
    steps.find((s) => s.id === "gate_1")?.outputs?.map((o) => o.key),
    ["to", "first_name"],
  );
});

test("upstreamStateSources — a webhook entry node is still flagged as hasTrigger, but its with.fields must NOT project as outputs", () => {
  const trig = node("gate_1", WEBHOOK_APP, "webhook");
  trig.data.step.with = { fields: [{ key: "to" }, { key: "first_name" }] };
  const nodes = [trig, node("mid")];
  const edges = [edge("gate_1", "mid")];
  const { steps, hasTrigger } = upstreamStateSources("mid", nodes, edges);
  assert.equal(hasTrigger, true, "hasTrigger must stay true for a webhook entry node");
  assert.equal(
    steps.find((s) => s.id === "gate_1")?.outputs,
    undefined,
    "webhook must project NO outputs",
  );
});

test("upstreamStateSources — a scheduler entry node is still flagged as hasTrigger, but its with.fields must NOT project as outputs", () => {
  const trig = node("gate_1", SCHEDULER_APP, "schedule");
  trig.data.step.with = { fields: [{ key: "to" }, { key: "first_name" }] };
  const nodes = [trig, node("mid")];
  const edges = [edge("gate_1", "mid")];
  const { steps, hasTrigger } = upstreamStateSources("mid", nodes, edges);
  assert.equal(hasTrigger, true, "hasTrigger must stay true for a scheduler entry node");
  assert.equal(
    steps.find((s) => s.id === "gate_1")?.outputs,
    undefined,
    "scheduler must project NO outputs",
  );
});

test("upstreamStateSources — a @w6w/template · render ancestor projects its static `result` output", () => {
  const tmpl = node("gate_1", TEMPLATE_APP, "render");
  const nodes = [tmpl, node("mid")];
  const edges = [edge("gate_1", "mid")];
  const { steps } = upstreamStateSources("mid", nodes, edges);
  assert.deepEqual(
    steps.find((s) => s.id === "gate_1")?.outputs?.map((o) => o.key),
    ["result"],
  );
});

test("upstreamStateSources — a @w6w/http · request ancestor projects its static output keys, in order", () => {
  const req = node("gate_1", HTTP_APP, "request");
  const nodes = [req, node("mid")];
  const edges = [edge("gate_1", "mid")];
  const { steps } = upstreamStateSources("mid", nodes, edges);
  assert.deepEqual(
    steps.find((s) => s.id === "gate_1")?.outputs?.map((o) => o.key),
    ["status", "statusText", "ok", "headers", "body"],
  );
});

test("upstreamStateSources — a @w6w/document · get ancestor declares NO static output (undefined, not [])", () => {
  const doc = node("gate_1", DOCUMENT_APP, "get");
  const nodes = [doc, node("mid")];
  const edges = [edge("gate_1", "mid")];
  const { steps } = upstreamStateSources("mid", nodes, edges);
  assert.equal(
    steps.find((s) => s.id === "gate_1")?.outputs,
    undefined,
    "@w6w/document · get's output is not statically knowable — must stay undefined",
  );
});

test("upstreamStateSources — a manual trigger with no with.fields declares NO outputs (undefined, not [])", () => {
  const trig = node("gate_1", TRIGGER_APP, "manual");
  const nodes = [trig, node("mid")];
  const edges = [edge("gate_1", "mid")];
  const { steps, hasTrigger } = upstreamStateSources("mid", nodes, edges);
  assert.equal(hasTrigger, true);
  assert.equal(
    steps.find((s) => s.id === "gate_1")?.outputs,
    undefined,
    "a manual trigger with no declared fields must not fall through to a static declaration",
  );
});

// ── App-action output shapes (declared → sample → last test run) ────────────

const EVENTBRITE = "io.w6w.eventbrite";
const getEventDef = {
  output: [
    { key: "id", type: "string", label: "Event ID" },
    { key: "start.utc", type: "string", label: "Start (UTC)" },
  ],
};

test("upstreamStateSources — an app action's declared output projects as path fields", () => {
  const nodes = [node("ev", EVENTBRITE, "get-event"), node("next")];
  const { steps } = upstreamStateSources("next", nodes, [edge("ev", "next")], {
    actionDef: (app, action) =>
      app === EVENTBRITE && action === "get-event" ? getEventDef : undefined,
    testOutputs: { ev: { ignored: true } },
  });
  assert.deepEqual(steps, [
    {
      id: "ev",
      label: "ev",
      outputs: [
        { key: "id", label: "Event ID", path: true },
        { key: "start.utc", label: "Start (UTC)", path: true },
      ],
      outputsFrom: "declared",
      hasMeta: true,
    },
  ]);
});

test("upstreamStateSources — no declared shape: the last test run's fields are offered", () => {
  const nodes = [node("ev", EVENTBRITE, "get-event"), node("next")];
  const { steps } = upstreamStateSources("next", nodes, [edge("ev", "next")], {
    actionDef: () => ({}),
    testOutputs: { ev: { id: "1", name: { text: "Gala" } } },
  });
  assert.equal(steps[0].outputsFrom, "test");
  assert.deepEqual(
    steps[0].outputs?.map((o) => o.key),
    ["id", "name", "name.text"],
  );
  assert.equal(steps[0].needsTest, undefined);
});

test("upstreamStateSources — no shape and no test run: the step needs a test", () => {
  const nodes = [node("ev", EVENTBRITE, "get-event"), node("next")];
  const { steps } = upstreamStateSources("next", nodes, [edge("ev", "next")], {
    actionDef: () => ({}),
  });
  assert.deepEqual(steps, [{ id: "ev", label: "ev", needsTest: true, hasMeta: true }]);
});

test("upstreamStateSources — action definition not loaded yet: no needs-test claim", () => {
  const nodes = [node("ev", EVENTBRITE, "get-event"), node("next")];
  const { steps } = upstreamStateSources("next", nodes, [edge("ev", "next")], {
    actionDef: () => undefined,
  });
  assert.deepEqual(steps, [{ id: "ev", label: "ev", hasMeta: true }]);
});

test("upstreamStateSources — a built-in node with no static output falls back to its test run, never needs-test", () => {
  const nodes = [node("code"), node("next")];
  const withTest = upstreamStateSources("next", nodes, [edge("code", "next")], {
    actionDef: () => ({}),
    testOutputs: { code: { total: 3 } },
  });
  assert.deepEqual(withTest.steps[0].outputs, [{ key: "total", path: true }]);
  assert.equal(withTest.steps[0].outputsFrom, "test");
  const without = upstreamStateSources("next", nodes, [edge("code", "next")], {
    actionDef: () => ({}),
  });
  assert.deepEqual(without.steps, [{ id: "code", label: "code" }]);
});

test("upstreamStateSources — a webhook entry node takes no fallback shape from its test run", () => {
  const nodes = [node("hook", WEBHOOK_APP, "webhook"), node("next")];
  const { steps } = upstreamStateSources("next", nodes, [edge("hook", "next")], {
    testOutputs: { hook: { body: {} } },
  });
  assert.deepEqual(steps, [{ id: "hook", label: "hook" }]);
});

test("upstreamStateSources — without a shape context the projection is unchanged", () => {
  const nodes = [node("ev", EVENTBRITE, "get-event"), node("next")];
  const { steps } = upstreamStateSources("next", nodes, [edge("ev", "next")]);
  assert.deepEqual(steps, [{ id: "ev", label: "ev", hasMeta: true }]);
});

// ── T3.2.3: hasMeta (R-7) ────────────────────────────────────────────────────

test("P1 — an external app ancestor with a test output carries hasMeta: true", () => {
  const nodes = [node("ev", EVENTBRITE, "get-event"), node("next")];
  const { steps } = upstreamStateSources("next", nodes, [edge("ev", "next")], {
    actionDef: () => ({}),
    testOutputs: { ev: { id: "1" } },
  });
  assert.equal(steps[0].outputsFrom, "test");
  assert.equal(steps[0].hasMeta, true);
});

test("P2 — hasMeta is a missing key (not false) for triggers and every @w6w/* node", () => {
  const cases: [string, string, string][] = [
    ["manual", TRIGGER_APP, "trigger"],
    ["hook", WEBHOOK_APP, "webhook"],
    ["code", "@w6w/script", "run"],
    ["call", CALL_APP, "call"],
    ["ctl", CONTROL_APP, "merge"],
    ["tpl", TEMPLATE_APP, "render"],
    ["http", HTTP_APP, "request"],
  ];
  const nodes = [...cases.map(([id, app, action]) => node(id, app, action)), node("next")];
  const edges = cases.map(([id]) => edge(id, "next"));
  const { steps } = upstreamStateSources("next", nodes, edges, { actionDef: () => ({}) });
  assert.equal(steps.length, cases.length);
  for (const [id] of cases) {
    const s = steps.find((x) => x.id === id);
    assert.ok(s, `${id} projected`);
    assert.equal(Object.hasOwn(s, "hasMeta"), false, `${id} has no hasMeta key`);
  }
});

test("P2b — a blank or whitespace-only uses.app gets no hasMeta key (any shape path)", () => {
  for (const app of ["", "   "]) {
    for (const opts of [
      { actionDef: () => ({}), testOutputs: { ev: { id: "1" } } },
      { actionDef: () => ({}) },
      { actionDef: () => undefined },
    ]) {
      const nodes = [node("ev", app, "get-event"), node("next")];
      const { steps } = upstreamStateSources("next", nodes, [edge("ev", "next")], opts);
      assert.equal(steps.length, 1);
      assert.equal(Object.hasOwn(steps[0], "hasMeta"), false, `app ${JSON.stringify(app)}`);
    }
  }
});

test("P3 — a downstream or unrelated external app step is not projected", () => {
  const nodes = [
    node("ev", EVENTBRITE, "get-event"),
    node("next"),
    node("later", EVENTBRITE, "get-event"),
    node("other", EVENTBRITE, "get-event"),
  ];
  const edges = [edge("ev", "next"), edge("next", "later")];
  const { steps } = upstreamStateSources("next", nodes, edges, { actionDef: () => ({}) });
  assert.deepEqual(
    steps.map((s) => s.id),
    ["ev"],
  );
  const viaBuilder = stepBuilderUpstreamSteps(
    { nodeId: "next", handleType: "source" },
    nodes,
    edges,
    {
      actionDef: () => ({}),
    },
  );
  assert.deepEqual(
    viaBuilder.map((s) => s.id),
    ["ev", "next"],
  );
  assert.equal(
    viaBuilder.some((s) => s.id === "later" || s.id === "other"),
    false,
  );
});

// ── T3.2.2: step metadata ────────────────────────────────────────────────────
const META: StepMeta = { app: "gate", version: "1.0.0", action: "check", connectionId: "c1" };
function seedOf(patch: Partial<StepTest>) {
  const test: StepTest = {
    id: "st1",
    workflowId: "wf",
    stepId: "gate_1",
    name: null,
    input: {},
    with: {},
    createdAt: "",
    updatedAt: "",
    ...patch,
  };
  return [{ stepId: "gate_1", label: "gate_1", test }];
}

test("S1 — startStateFromSeeds: meta rides with the output", () => {
  const r = startStateFromSeeds(
    seedOf({ lastRunStatus: "succeeded", lastRunOutput: { a: 1 }, lastRunMeta: META }),
  );
  assert.deepEqual(r, { steps: { gate_1: { output: { a: 1 }, meta: META } } });
});

test("S2 — legacy fixture (meta undefined or null) has no meta key", () => {
  for (const lastRunMeta of [undefined, null]) {
    const r = startStateFromSeeds(seedOf({ lastRunOutput: { a: 1 }, lastRunMeta }));
    assert.deepEqual(r, { steps: { gate_1: { output: { a: 1 } } } });
    assert.equal(Object.hasOwn(r?.steps?.gate_1 ?? {}, "meta"), false);
  }
});

test("S3 — a succeeded run with null output seeds { output: null }, with and without meta", () => {
  const without = startStateFromSeeds(seedOf({ lastRunStatus: "succeeded", lastRunOutput: null }));
  assert.deepEqual(without, { steps: { gate_1: { output: null } } });
  assert.equal(Object.hasOwn(without?.steps?.gate_1 ?? {}, "output"), true);
  assert.equal(Object.hasOwn(without?.steps?.gate_1 ?? {}, "meta"), false);
  const withMeta = startStateFromSeeds(
    seedOf({ lastRunStatus: "succeeded", lastRunOutput: null, lastRunMeta: META }),
  );
  assert.deepEqual(withMeta, { steps: { gate_1: { output: null, meta: META } } });
  // never ran: no entry
  assert.equal(startStateFromSeeds(seedOf({ lastRunOutput: null })), undefined);
});

test("S4 — a failed run is not seeded even when it carries meta", () => {
  assert.equal(
    startStateFromSeeds(
      seedOf({ lastRunStatus: "failed", lastRunOutput: null, lastRunMeta: META }),
    ),
    undefined,
  );
});

test("S5 — stepMetaSampleValues: {} when absent; exactly the 8 named keys (nodes + steps) otherwise", () => {
  assert.deepEqual(stepMetaSampleValues("s", undefined), {});
  assert.deepEqual(stepMetaSampleValues("s", null), {});
  const withExtra = { ...META, connectionId: null, token: "secret" } as unknown as StepMeta;
  assert.deepEqual(stepMetaSampleValues("s", withExtra), {
    "nodes.s.meta.app": "gate",
    "nodes.s.meta.version": "1.0.0",
    "nodes.s.meta.action": "check",
    "nodes.s.meta.connectionId": null,
    "steps.s.meta.app": "gate",
    "steps.s.meta.version": "1.0.0",
    "steps.s.meta.action": "check",
    "steps.s.meta.connectionId": null,
  });
});

// ── Loop-aware projection (T2.4.1) ─────────────────────────────────────────
const FE = { app: "@w6w/control", action: "foreach" };
const STUB = "io.w6w.stub";
const ITEMS_REF = "{{ nodes.eventbrite_to_cohost_1.output.tickets }}";
const TICKETS = [
  { name: "GA", sourceId: "s1", price: 10, quantity: 5 },
  { name: "VIP", sourceId: "s2", seats: 2 },
];
const fstep = (id: string, app = STUB, w?: Record<string, unknown>): FlowStep => ({
  id,
  uses: { app, action: "run" },
  ...(w ? { with: w } : {}),
  position: { x: 0, y: 0 },
});
const wf = (nodes: FlowStep[], edges: FlowEdge[]) =>
  workflowToFlow({ nodes, edges } as FlowWorkflow);
const E = (from: string, to: string): FlowEdge => ({ from, to });
const f0 = (opts: { body?: string[]; after?: boolean; items?: unknown; legacy?: boolean } = {}) => {
  const body = opts.body ?? ["update_event_ticket_1"];
  const items = opts.items ?? (opts.legacy ? [ITEMS_REF] : ITEMS_REF);
  const nodes = [
    fstep("create_event_1"),
    fstep("eventbrite_to_cohost_1"),
    {
      ...fstep("for_each_1", "@w6w/control", { items, ...(opts.legacy ? {} : { body }) }),
      uses: FE,
    },
    ...body.map((b) => fstep(b)),
    ...(opts.after ? [fstep("after_1")] : []),
  ];
  const edges = [
    E("create_event_1", "eventbrite_to_cohost_1"),
    E("eventbrite_to_cohost_1", "for_each_1"),
  ];
  if (opts.legacy) {
    edges.push(E("for_each_1", body[0]));
    for (let i = 1; i < body.length; i++) edges.push(E(body[i - 1], body[i]));
  }
  if (opts.after) edges.push(E("for_each_1", "after_1"));
  return wf(nodes, edges);
};
const withTickets = { testOutputs: { eventbrite_to_cohost_1: { tickets: TICKETS } } };
const ids = (r: { steps: { id: string }[] }) => r.steps.map((x) => x.id).sort();

test("L1 — body step: loop source with element [0] and its fields; For each dropped", () => {
  const g = f0();
  const r = upstreamStateSources("update_event_ticket_1", g.nodes, g.edges, withTickets);
  assert.deepEqual(r.loop, {
    foreachId: "for_each_1",
    itemSample: TICKETS[0],
    itemOutputs: ["name", "sourceId", "price", "quantity"].map((key) => ({ key, path: true })),
  });
  assert.deepEqual(ids(r), ["create_event_1", "eventbrite_to_cohost_1"]);
  assert.equal(r.extraSampleIds, undefined);
});

test("L2a — legacy F0 gives the same body projection", () => {
  const g = f0({ legacy: true });
  const r = upstreamStateSources("update_event_ticket_1", g.nodes, g.edges);
  assert.deepEqual(ids(r), ["create_event_1", "eventbrite_to_cohost_1"]);
  assert.equal(r.loop?.foreachId, "for_each_1");
});

test("L2b — 2-step body: later step sees the earlier body step, never the For each", () => {
  const g = f0({ body: ["update_event_ticket_1", "notify_1"] });
  const r = upstreamStateSources("notify_1", g.nodes, g.edges);
  assert.ok(r.steps.some((x) => x.id === "update_event_ticket_1"));
  assert.ok(!r.steps.some((x) => x.id === "for_each_1"));
});

test("L2c/d — builder drag: Each-item handle and body step exclude the For each; Done keeps it", () => {
  const g = f0();
  const each = stepBuilderUpstreamSteps(
    { nodeId: "for_each_1", handleType: "source", lane: "each" },
    g.nodes,
    g.edges,
  );
  assert.ok(!each.some((x) => x.id === "for_each_1"));
  assert.ok(each.some((x) => x.id === "eventbrite_to_cohost_1"));
  const fromBody = stepBuilderUpstreamSteps(
    { nodeId: "update_event_ticket_1", handleType: "source", lane: "success" },
    g.nodes,
    g.edges,
  );
  assert.ok(!fromBody.some((x) => x.id === "for_each_1"));
  const done = stepBuilderUpstreamSteps(
    { nodeId: "for_each_1", handleType: "source", lane: "success" },
    g.nodes,
    g.edges,
  );
  assert.ok(done.some((x) => x.id === "for_each_1"));
});

test("L2e — draft anchor: a body draft gets a loop; a non-body draft is byte-identical to null", () => {
  const g = f0({ after: true });
  const r = upstreamStateSources(null, g.nodes, g.edges, withTickets, "update_event_ticket_1");
  assert.equal(r.loop?.foreachId, "for_each_1");
  assert.ok(!r.steps.some((x) => x.id === "for_each_1"));
  const plain = upstreamStateSources(null, g.nodes, g.edges, withTickets);
  assert.deepEqual(upstreamStateSources(null, g.nodes, g.edges, withTickets, "after_1"), plain);
  assert.deepEqual(upstreamStateSources(null, g.nodes, g.edges, withTickets, null), plain);
});

test("L3 — after the loop: For each offers items + LAST body step fields; never body steps", () => {
  const g = f0({ body: ["update_event_ticket_1", "notify_1"], after: true });
  const sd = {
    testOutputs: {
      update_event_ticket_1: { alpha: 1, beta: 2 },
      notify_1: { sent: true, to: "x" },
    },
  };
  const r = upstreamStateSources("after_1", g.nodes, g.edges, sd);
  const fe = r.steps.find((x) => x.id === "for_each_1");
  assert.deepEqual(fe?.outputs?.[0], { key: "items", path: true });
  assert.deepEqual(
    fe?.outputs?.slice(1).map((o) => o.key),
    ["items.0.sent", "items.0.to"],
  );
  assert.ok(fe?.outputs?.every((o) => o.path === true));
  assert.deepEqual(r.extraSampleIds, ["notify_1"]);
  assert.equal(r.loop, undefined);
  assert.ok(!r.steps.some((x) => ["update_event_ticket_1", "notify_1"].includes(x.id)));
  // a hand-added body -> after edge never surfaces a body step
  const hand = [...g.edges, { id: "h", source: "notify_1", target: "after_1" }];
  assert.ok(
    !upstreamStateSources("after_1", g.nodes, hand, sd).steps.some((x) => x.id === "notify_1"),
  );
  // no last-body shape
  const bare = upstreamStateSources("after_1", g.nodes, g.edges);
  assert.deepEqual(bare.steps.find((x) => x.id === "for_each_1")?.outputs, [
    { key: "items", path: true },
  ]);
});

test("L4 — no sample: loop is exactly {foreachId}; a literal items array needs no test", () => {
  const g = f0();
  const r = upstreamStateSources("update_event_ticket_1", g.nodes, g.edges);
  assert.deepEqual(r.loop, { foreachId: "for_each_1" });
  assert.equal("itemSample" in (r.loop as object), false);
  assert.equal("itemOutputs" in (r.loop as object), false);
  const lit = f0({ items: [{ a: 1 }, { b: 2 }] });
  const l = upstreamStateSources("update_event_ticket_1", lit.nodes, lit.edges);
  assert.deepEqual(l.loop?.itemSample, { a: 1 });
});

test("L5 — resolveLoopItems: whole-value ref, literal array, anything else", () => {
  const out = { eventbrite_to_cohost_1: { tickets: TICKETS } };
  assert.deepEqual(resolveLoopItems(ITEMS_REF, out), TICKETS);
  assert.deepEqual(
    resolveLoopItems({ $: "nodes.eventbrite_to_cohost_1.output.tickets" }, out),
    TICKETS,
  );
  assert.deepEqual(resolveLoopItems([1, 2], {}), [1, 2]);
  assert.equal(resolveLoopItems(ITEMS_REF, {}), undefined);
  assert.equal(resolveLoopItems("plain", out), undefined);
  assert.equal(
    resolveLoopItems("{{ nodes.eventbrite_to_cohost_1.output.tickets.0 }}", out),
    undefined,
  );
});

test("L6 — upstreamSampleValues: nodes. keys mirrored under steps.; foreach.* only with an item sample", () => {
  const steps = [{ id: "a", outputs: [{ key: "x.y", path: true }] }];
  const outputs = { a: { id: "E1", x: { y: 7 } } };
  const v = upstreamSampleValues(steps, outputs, {});
  for (const k of ["a.output", "a.output.id", "a.output.x.y"]) {
    assert.ok(`nodes.${k}` in v, k);
    assert.deepEqual(v[`steps.${k}`], v[`nodes.${k}`]);
  }
  assert.equal(v["nodes.a.output.id"], "E1");
  assert.ok(!Object.keys(v).some((k) => k.startsWith("foreach.")));
  const withLoop = upstreamSampleValues(
    steps,
    outputs,
    {},
    {
      foreachId: "f",
      itemSample: TICKETS[0],
      itemOutputs: [{ key: "name", path: true }],
    },
  );
  assert.equal(withLoop["foreach.item.name"], "GA");
  assert.equal(withLoop["foreach.index"], 0);
  assert.deepEqual(withLoop["foreach.item"], TICKETS[0]);
  assert.ok(
    !Object.keys(upstreamSampleValues(steps, outputs, {}, { foreachId: "f" })).some((k) =>
      k.startsWith("foreach."),
    ),
  );
});

// ── Loop seed (T2.4.2) ─────────────────────────────────────────────────────
const SIX = Array.from({ length: 6 }, (_, i) => ({
  name: `T${i}`,
  sourceId: `s${i}`,
  price: i * 10,
  quantity: i + 1,
}));
const seedWithOutput = [
  {
    stepId: "gate_1",
    label: "gate_1",
    test: { ...fixture({ to: "a@b.com" }), lastRunStatus: "succeeded" as const },
  },
];

test("S1 — startStateFromSeeds: no loop is byte-identical (1 arg === explicit undefined)", () => {
  assert.deepEqual(
    startStateFromSeeds(seedWithOutput),
    startStateFromSeeds(seedWithOutput, undefined),
  );
  assert.equal(startStateFromSeeds([]), undefined);
  assert.equal(startStateFromSeeds([], undefined), undefined);
  assert.equal("foreach" in (startStateFromSeeds(seedWithOutput) ?? {}), false);
});

test("S2 — startStateFromSeeds: loop adds foreach, index defaults to 0, item key only when defined", () => {
  const s = startStateFromSeeds(seedWithOutput, { item: SIX[0] });
  assert.deepEqual(s?.foreach, { item: SIX[0], index: 0 });
  assert.ok(s?.steps?.gate_1);
  assert.deepEqual(startStateFromSeeds([], { index: 3 }), { foreach: { index: 3 } });
  assert.equal("item" in (startStateFromSeeds([], {})?.foreach ?? {}), false);
  assert.deepEqual(startStateFromSeeds([], { item: null, index: 2 }), {
    foreach: { item: null, index: 2 },
  });
});

test("S3 — parseLoopSeed: valid, blank, and refused inputs", () => {
  assert.deepEqual(parseLoopSeed('{"a":1}', "3"), {
    ok: true,
    value: { item: { a: 1 }, index: 3 },
  });
  assert.deepEqual(parseLoopSeed("", ""), { ok: true, value: { index: 0 } });
  for (const bad of [
    ["{nope", "0"],
    ["{}", "-1"],
    ["{}", "1.5"],
    ["{}", "x"],
  ] as const) {
    assert.equal(parseLoopSeed(bad[0], bad[1]).ok, false, bad.join("|"));
  }
});

test("S4 — loopSeedFromSource / loopItemText follow the loop's itemSample", () => {
  assert.equal(loopSeedFromSource(undefined), undefined);
  assert.deepEqual(loopSeedFromSource({ foreachId: "f", itemSample: SIX[0] }), {
    item: SIX[0],
    index: 0,
  });
  assert.deepEqual(loopSeedFromSource({ foreachId: "f" }), { index: 0 });
  assert.equal(loopItemText({ foreachId: "f" }), "");
  assert.deepEqual(JSON.parse(loopItemText({ foreachId: "f", itemSample: SIX[0] })), SIX[0]);
});

test("S5 — N items: resolveLoopItems(F0 items) has length 6 and [0] is the body step's itemSample", () => {
  const g = f0();
  const outs = { eventbrite_to_cohost_1: { tickets: SIX } };
  const feItems = g.nodes.find((n) => n.id === "for_each_1")?.data.step.with?.items;
  const arr = resolveLoopItems(feItems, outs);
  assert.equal(arr?.length, 6);
  assert.notDeepEqual(SIX[0], SIX[1]);
  const body = upstreamStateSources("update_event_ticket_1", g.nodes, g.edges, {
    testOutputs: outs,
  });
  assert.deepEqual(arr?.[0], body.loop?.itemSample);
  assert.notDeepEqual(arr?.[0], SIX[5]);
  assert.equal(resolveLoopItems(feItems, {}), undefined);
});

test("S6 — stepBuilderLoop follows the builder's own-loop decision", () => {
  const g = f0();
  const shapes = { testOutputs: { eventbrite_to_cohost_1: { tickets: SIX } } };
  assert.equal(stepBuilderLoop(null, g.nodes, g.edges, shapes), undefined);
  assert.equal(
    stepBuilderLoop({ nodeId: "for_each_1", handleType: "target" }, g.nodes, g.edges, shapes),
    undefined,
  );
  assert.deepEqual(
    stepBuilderLoop(
      { nodeId: "for_each_1", handleType: "source", lane: "each" },
      g.nodes,
      g.edges,
      shapes,
    )?.itemSample,
    SIX[0],
  );
  assert.equal(
    stepBuilderLoop({ nodeId: "for_each_1", handleType: "source" }, g.nodes, g.edges, shapes),
    undefined,
  );
  assert.equal(
    stepBuilderLoop(
      { nodeId: "update_event_ticket_1", handleType: "source" },
      g.nodes,
      g.edges,
      shapes,
    )?.foreachId,
    "for_each_1",
  );
});
