// Run: node --experimental-strip-types --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/state-shape.test.ts
// The merged workflow state a node reads at design time (T4.1.2, F-4): no run needed.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StateWriteConfig } from "@w6w/expr";
import { DATA_APP, TRIGGER_APP, WEBHOOK_APP } from "../flow-types.ts";
import type { FlowStep } from "../flow-types.ts";
import type { StepNode } from "../flow-utils.ts";
import { computeStateShape, stateWriteOrder } from "../state-shape.ts";
import type { StepShapeContext } from "../step-preview-state.ts";

function node(
  id: string,
  app = "@w6w/script",
  action = "run",
  extra: Partial<FlowStep> = {},
): StepNode {
  return {
    id,
    type: "step",
    position: { x: 0, y: 0 },
    data: { step: { id, uses: { app, action }, ...extra }, isInternal: false },
  };
}
const edge = (source: string, target: string) => ({ id: `${source}->${target}`, source, target });
const key = (k: string): StateWriteConfig => ({ mode: "key", key: k });
const fieldsOf = (s: ReturnType<typeof computeStateShape>) =>
  Object.fromEntries(s.fields.map((f) => [f.key, f.paths]));

// Send Confirmation: two entry paths converge on "Get entry", and BOTH write `state.order`:
// the webhook path fetches the order (declared output, key mode), the manual path maps its own
// fields onto it (pick mode). Nothing has run.
function sendConfirmation() {
  const nodes = [
    node("order_webhook", WEBHOOK_APP, "webhook"),
    node("manual", TRIGGER_APP, "manual", {
      with: {
        fields: [
          { key: "order_id", type: "string" },
          { key: "email", type: "string" },
        ],
      },
      state: {
        mode: "pick",
        map: [
          { from: "order_id", to: "order.id" },
          { from: "email", to: "order.email" },
        ],
      },
    }),
    node("fetch_order", "shop", "get_order", { state: key("order") }),
    node("get_entry", "sheets", "get_row"),
    node("send_confirmation", "mail", "send"),
  ];
  const edges = [
    edge("order_webhook", "fetch_order"),
    edge("fetch_order", "get_entry"),
    edge("manual", "get_entry"),
    edge("get_entry", "send_confirmation"),
  ];
  const shapes: StepShapeContext = {
    actionDef: (app, action) =>
      app === "shop" && action === "get_order"
        ? {
            output: [
              { key: "id", type: "string" },
              { key: "email", type: "string" },
              { key: "total", type: "number" },
            ],
          }
        : undefined,
  };
  return { nodes, edges, shapes };
}

test("Send Confirmation: the picker at Get entry shows state.order and its fields before any run", () => {
  const { nodes, edges, shapes } = sendConfirmation();
  const shape = computeStateShape({ anchorId: "get_entry", nodes, edges, shapes });
  assert.deepEqual(fieldsOf(shape), {
    order: "all",
    "order.id": "all",
    "order.email": "all",
    // Only the webhook path's fetch writes `total`.
    "order.total": "some",
  });
  for (const f of shape.fields) assert.equal(f.path, true);
  // Skeletons are never preview values.
  assert.deepEqual(shape.sampleValues, {});
});

test("downstream of the convergence the shape is unchanged; the writers' own anchors see less", () => {
  const { nodes, edges, shapes } = sendConfirmation();
  const after = computeStateShape({ anchorId: "send_confirmation", nodes, edges, shapes });
  assert.deepEqual(Object.keys(fieldsOf(after)), [
    "order",
    "order.id",
    "order.email",
    "order.total",
  ]);
  // A node never reads its own write; fetch_order's only ancestor writes nothing.
  assert.deepEqual(computeStateShape({ anchorId: "fetch_order", nodes, edges, shapes }).fields, []);
});

test("empty when nothing writes: no starting data, no variables, writers Off", () => {
  const nodes = [node("a"), node("b")];
  const shape = computeStateShape({ anchorId: "b", nodes, edges: [edge("a", "b")] });
  assert.deepEqual(shape, { fields: [], sampleValues: {} });
  assert.deepEqual(computeStateShape({ anchorId: null, nodes, edges: [] }).fields, []);
});

test("starting data and variables seed fields on all paths, with real preview values", () => {
  const shape = computeStateShape({
    anchorId: "b",
    nodes: [node("a"), node("b")],
    edges: [edge("a", "b")],
    initialState: { region: "eu", limits: { max: 5 } },
    variables: [
      { key: "tier", type: "string", default: "gold" },
      { key: "count", type: "number" },
    ],
  });
  assert.deepEqual(fieldsOf(shape), {
    region: "all",
    limits: "all",
    "limits.max": "all",
    tier: "all",
    count: "all",
  });
  assert.deepEqual(shape.sampleValues, {
    "state.region": "eu",
    "state.limits": { max: 5 },
    "state.limits.max": 5,
    "state.tier": "gold",
  });
});

test("test outputs feed both the shape and the state.<path> preview values", () => {
  const nodes = [node("a", "@w6w/script", "run", { state: key("order") }), node("b")];
  const out = { id: "o-1", lines: [{ sku: "x" }] };
  const shape = computeStateShape({
    anchorId: "b",
    nodes,
    edges: [edge("a", "b")],
    shapes: { testOutputs: { a: out } },
    previewOutputs: { a: out },
  });
  assert.deepEqual(fieldsOf(shape), { order: "all", "order.id": "all", "order.lines": "all" });
  assert.equal(shape.sampleValues["state.order.id"], "o-1");
  assert.deepEqual(shape.sampleValues["state.order"], out);
});

test("@w6w/data set with no state config merges at root (R14); an Off writer is ignored", () => {
  const nodes = [
    node("set", DATA_APP, "set"),
    node("off", "@w6w/script", "run", { state: { mode: "off" } }),
    node("z"),
  ];
  const shape = computeStateShape({
    anchorId: "z",
    nodes,
    edges: [edge("set", "off"), edge("off", "z")],
    shapes: { testOutputs: { set: { flag: true }, off: { ignored: 1 } } },
  });
  assert.deepEqual(fieldsOf(shape), { flag: "all" });
});

test("writers fold in the engine's order: topological, edge declaration breaks ties", () => {
  // b and c both become ready after a. The edge a->b is declared first, so b runs first and
  // c's write lands last — whatever order the nodes themselves are declared in.
  const nodes = [
    node("a"),
    node("c", "@w6w/script", "run", { state: key("x") }),
    node("b", "@w6w/script", "run", { state: key("x") }),
    node("d"),
  ];
  const edges = [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")];
  assert.deepEqual(stateWriteOrder(nodes, edges), ["a", "b", "c", "d"]);
  const outputs = { b: "from-b", c: "from-c" };
  const shape = computeStateShape({
    anchorId: "d",
    nodes,
    edges,
    shapes: { testOutputs: outputs },
    previewOutputs: outputs,
  });
  assert.equal(shape.sampleValues["state.x"], "from-c");
  assert.deepEqual(fieldsOf(shape), { x: "all" });
  // Entry roots seed the queue in declared node order.
  assert.deepEqual(
    stateWriteOrder([node("r2"), node("r1"), node("t")], [edge("r1", "t"), edge("r2", "t")]),
    ["r2", "r1", "t"],
  );
});

test("a writer off the anchor's paths contributes nothing", () => {
  const nodes = [node("a"), node("side", "@w6w/script", "run", { state: key("side") }), node("b")];
  const shape = computeStateShape({
    anchorId: "b",
    nodes,
    edges: [edge("a", "b"), edge("a", "side")],
    shapes: { testOutputs: { side: { v: 1 } } },
  });
  assert.deepEqual(shape.fields, []);
});

test("a cycle neither hangs nor drops nodes from the order", () => {
  const nodes = [node("a"), node("b")];
  assert.deepEqual(stateWriteOrder(nodes, [edge("a", "b"), edge("b", "a")]), ["a", "b"]);
});
