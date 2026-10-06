// Run: node --test src/__tests__/step-preview-state.test.ts  (Node 24, type-stripped)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DOCUMENT_APP,
  HTTP_APP,
  SCHEDULER_APP,
  TEMPLATE_APP,
  TRIGGER_APP,
  WEBHOOK_APP,
} from "../flow-types.ts";
import type { StepNode } from "../flow-utils.ts";
import type { StepTest } from "../provider.tsx";
import {
  fetchSeedSources,
  startStateFromSeeds,
  stepBuilderUpstreamSteps,
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
  assert.deepEqual(steps, [{ id: "ev", label: "ev", needsTest: true }]);
});

test("upstreamStateSources — action definition not loaded yet: no needs-test claim", () => {
  const nodes = [node("ev", EVENTBRITE, "get-event"), node("next")];
  const { steps } = upstreamStateSources("next", nodes, [edge("ev", "next")], {
    actionDef: () => undefined,
  });
  assert.deepEqual(steps, [{ id: "ev", label: "ev" }]);
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
  assert.deepEqual(steps, [{ id: "ev", label: "ev" }]);
});
