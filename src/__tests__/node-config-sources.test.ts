// Run: node --test src/__tests__/node-config-sources.test.ts  (Node 24, type-stripped)
//
// The picker's "Node settings" group: every node's `nodes.<id>.config.<key>` — its literal
// settings (never a sealed secret, never a binding) plus a webhook trigger's `url` — offered
// whether or not the node is upstream of the step being edited.
import assert from "node:assert/strict";
import { test } from "node:test";
import { TRIGGER_APP, WEBHOOK_APP } from "../flow-types.ts";
import type { FlowWorkflow } from "../flow-types.ts";
import { workflowToFlow } from "../flow-utils.ts";
import { nodeConfigSources } from "../step-preview-state.ts";

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
