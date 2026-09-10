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

// Mirrors packages/apps/apps/slack/actions/user-update-profile.ts's actual
// `customFields` shape: a `type: "group", repeat: true` param whose children
// `id`/`value` are each `required: true` while the group itself is not.
const CUSTOM_FIELDS_PARAM: ActionParam = {
  key: "customFields",
  label: "Custom fields",
  type: "group",
  repeat: true,
  children: [
    { key: "id", label: "Field ID", type: "string", required: true },
    { key: "value", label: "Value", type: "string", required: true },
    { key: "alt", label: "Alt text", type: "string" },
  ],
};

test("requiredParamsFilled walks a repeat group's nested rows, not the flat value", () => {
  // Before this node's `group` branch, `check()` had no `type === "group"` case
  // at all, so this fell to the generic `values[p.key]` check — a non-empty
  // array is truthy, so a row missing its required `value` sailed through.
  assert.equal(requiredParamsFilled([CUSTOM_FIELDS_PARAM], { customFields: [{ id: "x" }] }), false);
  assert.equal(
    requiredParamsFilled([CUSTOM_FIELDS_PARAM], {
      customFields: [{ id: "x", value: "y" }],
    }),
    true,
  );
});

test("an empty repeat-group list passes unless the group itself is required", () => {
  assert.equal(requiredParamsFilled([CUSTOM_FIELDS_PARAM], { customFields: [] }), true);
  assert.equal(requiredParamsFilled([CUSTOM_FIELDS_PARAM], {}), true);
  const required: ActionParam = { ...CUSTOM_FIELDS_PARAM, required: true };
  assert.equal(requiredParamsFilled([required], { customFields: [] }), false);
});

// Mirrors packages/apps/apps/companycam/actions/project-create.ts's `address`
// group shape: a non-repeat `type: "group"` with a required scalar child.
const ADDRESS_GROUP: ActionParam = {
  key: "address",
  label: "Address",
  type: "group",
  children: [
    { key: "street1", label: "Street address", type: "string", required: true },
    { key: "city", label: "City", type: "string" },
  ],
};

test("requiredParamsFilled recurses a non-repeat group against its NESTED value slice", () => {
  assert.equal(requiredParamsFilled([ADDRESS_GROUP], { address: { city: "Reno" } }), false);
  assert.equal(
    requiredParamsFilled([ADDRESS_GROUP], { address: { street1: "1 Main St", city: "Reno" } }),
    true,
  );
  // A required child read against the FLAT top-level value (the near-miss this
  // gate must kill) would look for `values.street1`, not `values.address.street1`.
  assert.equal(requiredParamsFilled([ADDRESS_GROUP], { street1: "1 Main St" }), false);
});

test("D-3: a group child's showIf resolves the group's OWN sibling first, not the enclosing form's", () => {
  // `mode` exists in BOTH scopes with DIFFERENT values — group-local-first
  // resolution must read the group's own `mode` ("b"), not the enclosing
  // form's ("a"). A fix that fell back to `eff` unconditionally would read
  // "a" and get this backwards.
  const params: ActionParam[] = [
    { key: "mode", type: "string", default: "a" },
    {
      key: "settings",
      type: "group",
      children: [
        { key: "mode", type: "string", default: "b" },
        {
          key: "flagged",
          type: "string",
          required: true,
          showIf: { field: "mode", equals: "b" },
        },
      ],
    },
  ];
  // Enclosing `mode` is "a" (would hide `flagged` if resolution weren't
  // group-local), but the group's own `mode` defaults to "b" → visible+empty
  // → blocks the gate.
  assert.equal(requiredParamsFilled(params, {}), false);
  assert.equal(requiredParamsFilled(params, { settings: { flagged: "x" } }), true);
  // A key the group does NOT declare (`mode` is declared, so use a different
  // one) falls back to the enclosing form.
  const outerOnly: ActionParam[] = [
    { key: "outerFlag", type: "boolean", default: true },
    {
      key: "settings2",
      type: "group",
      children: [
        {
          key: "flagged",
          type: "string",
          required: true,
          showIf: { field: "outerFlag", truthy: true },
        },
      ],
    },
  ];
  assert.equal(requiredParamsFilled(outerOnly, {}), false);
  assert.equal(requiredParamsFilled(outerOnly, { outerFlag: false }), true);
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
