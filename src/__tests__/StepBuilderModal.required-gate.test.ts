// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.required-gate.test.ts  (Node 24)
//
// `requiredParamsFilled` gates the inline "Test run" button. Before this test,
// a `required` field hidden by its own `showIf` still blocked the gate — so no
// app could safely combine `required: true` with a conditional `showIf` (e.g.
// SendGrid mail-send's `contentValue`, required only when NOT using a dynamic
// template). Apps worked around it by leaving such fields non-required, which
// made the gate pass unconditionally and pushed the failure to a raw
// `hook_failed` runtime error from `execute()` instead of a pre-flight
// "required" flag in the Configure tab.
import assert from "node:assert/strict";
import { test } from "node:test";
import { requiredParamsFilled } from "../StepBuilderModal.tsx";
import type { ActionParam } from "../types.ts";

// Mirrors packages/apps/apps/sendgrid/actions/mail-send.ts's actual shape.
const MAIL_SEND_PARAMS: ActionParam[] = [
  { key: "toEmail", type: "string", required: true, default: "" },
  {
    key: "contentValue",
    type: "text",
    required: true,
    default: "",
    showIf: { field: "dynamicTemplate", truthy: false },
  },
  { key: "dynamicTemplate", type: "boolean", required: true, default: false },
  {
    key: "templateId",
    type: "string",
    required: true,
    default: "",
    showIf: { field: "dynamicTemplate", truthy: true },
  },
];

test("a required field hidden by showIf=false doesn't block the gate", () => {
  // dynamicTemplate: true (default overridden) → contentValue is hidden and
  // moot even though it's required and empty; templateId is visible+required.
  assert.equal(
    requiredParamsFilled(MAIL_SEND_PARAMS, {
      toEmail: "a@b.com",
      dynamicTemplate: true,
      templateId: "d-abc123",
    }),
    true,
  );
});

test("a required field visible under showIf still blocks when empty", () => {
  // dynamicTemplate defaults to false → contentValue is visible+required+empty.
  assert.equal(requiredParamsFilled(MAIL_SEND_PARAMS, { toEmail: "a@b.com" }), false);
});

test("a required field visible under showIf passes once filled", () => {
  assert.equal(
    requiredParamsFilled(MAIL_SEND_PARAMS, {
      toEmail: "a@b.com",
      contentValue: "hello",
    }),
    true,
  );
});

test("a required field required-and-visible in the OTHER branch still blocks when empty", () => {
  // dynamicTemplate: true → templateId is visible+required+empty; contentValue
  // is hidden so it doesn't matter that it's also empty.
  assert.equal(
    requiredParamsFilled(MAIL_SEND_PARAMS, { toEmail: "a@b.com", dynamicTemplate: true }),
    false,
  );
});

test("showIf resolves a sibling's DECLARED DEFAULT, not just an entered value", () => {
  // No `dynamicTemplate` key in values at all → falls back to its declared
  // default (false) for the showIf check, same as ParamsForm's `effective`.
  assert.equal(
    requiredParamsFilled(MAIL_SEND_PARAMS, { toEmail: "a@b.com", contentValue: "hi" }),
    true,
  );
});

test("a showIf referencing a field OUTSIDE its own section still resolves", () => {
  // The gate + sibling flag live in different `section` containers — this only
  // works if the sibling lookup is built from the FULL top-level tree once,
  // not rebuilt per-section on each recursive call.
  const params: ActionParam[] = [
    {
      key: "modeSection",
      type: "section",
      section: "group",
      children: [{ key: "dynamicTemplate", type: "boolean", required: true, default: false }],
    },
    {
      key: "bodySection",
      type: "section",
      section: "group",
      children: [
        {
          key: "contentValue",
          type: "text",
          required: true,
          default: "",
          showIf: { field: "dynamicTemplate", truthy: false },
        },
      ],
    },
  ];
  assert.equal(requiredParamsFilled(params, { dynamicTemplate: true }), true);
  assert.equal(requiredParamsFilled(params, { dynamicTemplate: false }), false);
});
