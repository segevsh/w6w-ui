// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.trigger-fields.test.ts
//
// The Call-workflow step's Configure stage reads the target's trigger fields from GET
// /workflows/:id. A manifest-v2 definition carries `nodes[]` and no `steps[]`, so reading only
// `steps` threw "Cannot read properties of undefined (reading 'find')" for every v2 target.
import assert from "node:assert/strict";
import { test } from "node:test";
import { triggerFieldsOf } from "../StepBuilderModal.tsx";

const trigger = {
  id: "start",
  uses: { app: "@w6w/trigger", action: "manual" },
  with: {
    fields: [
      { key: "email", type: "string", required: true },
      { key: "n", type: "number" },
    ],
  },
};
const want = [
  { key: "email", label: "email", type: "string", default: undefined, required: true },
  { key: "n", label: "n", type: "number", default: undefined, required: false },
];

test("reads the trigger's fields from a v2 definition's nodes[]", () => {
  assert.deepEqual(triggerFieldsOf({ id: "wf", name: "wf", nodes: [trigger] }), want);
});

test("still reads a legacy definition's steps[]", () => {
  assert.deepEqual(triggerFieldsOf({ id: "wf", name: "wf", steps: [trigger] }), want);
});

test("a definition with no trigger, or no step list at all, has no inputs", () => {
  const call = { id: "c", uses: { app: "@w6w/call", action: "call" } };
  assert.deepEqual(triggerFieldsOf({ id: "wf", name: "wf", nodes: [call] }), []);
  assert.deepEqual(triggerFieldsOf({ id: "wf", name: "wf" }), []);
});
