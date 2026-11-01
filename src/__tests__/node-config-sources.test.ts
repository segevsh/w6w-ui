// Run: node --test src/__tests__/node-config-sources.test.ts  (Node 24, type-stripped)
//
// The picker's Metadata › config entry: every node's `nodes.<id>.meta.config.<key>` — its literal
// settings (never a sealed secret, never a binding) plus a webhook trigger's `url` — offered
// whether or not the node is upstream of the step being edited.
import assert from "node:assert/strict";
import { test } from "node:test";
import { TRIGGER_APP, WEBHOOK_APP } from "../flow-types.ts";
import type { FlowWorkflow } from "../flow-types.ts";
import { workflowToFlow } from "../flow-utils.ts";
import { nodeConfigSources, nodeConfigValues } from "../step-preview-state.ts";

const flow = workflowToFlow({
  nodes: [
    { id: "manual_trigger_1", uses: { app: TRIGGER_APP, action: "manual" }, with: {} },
    {
      id: "webhook_1",
      uses: { app: WEBHOOK_APP, action: "webhook" },
      with: {
        auth: "basic",
        basicPassword: { type: "secret", ciphertext: "c", iv: "i" },
        methods: ["POST"],
        bound: { $: "trigger.event" },
      },
    },
    { id: "ev", uses: { app: "eventbrite", action: "order-placed", trigger: true } },
    { id: "data_1", uses: { app: "@w6w/data", action: "set" }, with: { vars: [] } },
  ],
  edges: [{ from: "manual_trigger_1", to: "data_1" }],
} as unknown as FlowWorkflow);

test("every node with configuration is offered — upstream or not", () => {
  assert.deepEqual(nodeConfigSources(flow.nodes), [
    { id: "webhook_1", keys: ["url", "auth", "methods"] },
    { id: "ev", keys: ["url"] },
    { id: "data_1", keys: ["vars"] },
  ]);
});

test("each node's config values: static `with` (no secret, no binding) + a webhook's subscription url", () => {
  const subs = [
    {
      id: "sub_ev",
      appId: "eventbrite",
      triggerKey: "x",
      workflowId: "w",
      connectionId: null,
      nodeId: "ev",
    },
    {
      id: "sub_hook",
      appId: WEBHOOK_APP,
      triggerKey: "webhook",
      workflowId: "w",
      connectionId: null,
      webhookUrl: "https://h/triggers/webhooks/sub_hook",
    },
  ];
  assert.deepEqual(nodeConfigValues(flow.nodes, subs), {
    webhook_1: { auth: "basic", methods: ["POST"], url: "https://h/triggers/webhooks/sub_hook" },
    data_1: { vars: [] },
  });
  // No subscription loaded: the authored literals only, never a sealed value.
  const bare = nodeConfigValues(flow.nodes, []);
  assert.deepEqual(bare.webhook_1, { auth: "basic", methods: ["POST"] });
  assert.ok(!JSON.stringify(bare).includes("ciphertext"));
});

test("each node's static meta: app/action/connectionId from the definition + a webhook's subscription", async () => {
  const { nodeMetaValues, nodeMetaSampleValues } = await import("../step-preview-state.ts");
  const withConn = workflowToFlow({
    nodes: [
      { id: "webhook_1", uses: { app: WEBHOOK_APP, action: "webhook" } },
      {
        id: "list",
        uses: { app: "io.w6w.eventbrite", action: "list-webhooks", connection: "conn_1" },
      },
    ],
    edges: [],
  } as unknown as FlowWorkflow);
  const subs = [
    {
      id: "sub_hook",
      appId: WEBHOOK_APP,
      triggerKey: "webhook",
      workflowId: "w",
      connectionId: null,
      webhookUrl: "https://h/triggers/webhooks/sub_hook",
    },
  ];
  const meta = nodeMetaValues(withConn.nodes, subs);
  assert.deepEqual(meta, {
    // The generic webhook has no connection: `null`, never a borrowed one.
    webhook_1: {
      app: WEBHOOK_APP,
      action: "webhook",
      connectionId: null,
      subscriptionId: "sub_hook",
      url: "https://h/triggers/webhooks/sub_hook",
    },
    list: { app: "io.w6w.eventbrite", action: "list-webhooks", connectionId: "conn_1" },
  });
  const samples = nodeMetaSampleValues(meta);
  assert.equal(samples["nodes.list.meta.connectionId"], "conn_1");
  assert.equal(samples["steps.webhook_1.meta.subscriptionId"], "sub_hook");
  // No subscription loaded: the definition's meta only.
  assert.deepEqual(nodeMetaValues(withConn.nodes, []).webhook_1, {
    app: WEBHOOK_APP,
    action: "webhook",
    connectionId: null,
  });
});

test("static meta.version is the version the canvas labels the node with; unknown stays at-run", async () => {
  const { nodeMetaValues, nodeMetaSampleValues } = await import("../step-preview-state.ts");
  const { buildResolveScope, resolveParamValue } = await import("../resolve-params.ts");
  const flow = workflowToFlow({
    nodes: [
      { id: "find", uses: { app: "io.w6w.eventbrite", action: "find_webhook" } },
      { id: "other", uses: { app: "io.w6w.unknown", action: "x" } },
    ],
    edges: [],
  } as unknown as FlowWorkflow);
  // The same `apps` summary the canvas renders `find - v0.4.3` from.
  const apps = new Map([["io.w6w.eventbrite", { version: "0.4.3" }]]);
  const meta = nodeMetaValues(flow.nodes, [], apps);
  assert.equal(meta.find?.version, "0.4.3");
  assert.ok(!Object.hasOwn(meta.other ?? {}, "version"));
  assert.equal(nodeMetaSampleValues(meta)["nodes.find.meta.version"], "0.4.3");
  const scope = buildResolveScope(undefined, undefined, undefined, meta);
  const seg = (r: string, sc = scope) => resolveParamValue({ $: r }, sc)[0];
  assert.deepEqual(seg("nodes.find.meta.version"), {
    status: "resolved",
    ref: "nodes.find.meta.version",
    value: "0.4.3",
  });
  // The canvas has no version for this app: the preview falls back to "resolved at run".
  assert.equal(seg("nodes.other.meta.version")?.status, "at-run");
  // A run's reported meta overrides the static one.
  const run = { steps: { find: { meta: { version: "0.4.4" } } } } as never;
  const ran = buildResolveScope(undefined, run, undefined, meta);
  assert.deepEqual(seg("nodes.find.meta.version", ran), {
    status: "resolved",
    ref: "nodes.find.meta.version",
    value: "0.4.4",
  });
});
