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
