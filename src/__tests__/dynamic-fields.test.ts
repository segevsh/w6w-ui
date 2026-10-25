// Run (from packages/ui): node --max-old-space-size=2048 --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/dynamic-fields.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cacheKey,
  fieldsOverlap,
  isCacheable,
  noFetchReason,
  planRequests,
  reconcileValue,
  splitForm,
} from "../dynamic-fields.ts";
import type { ActionParam } from "../types.ts";

const expr = { type: "expr", parts: ["x"] };
const secret = { type: "secret", ciphertext: "c", iv: "i" };
const params: ActionParam[] = [
  { key: "org", label: "Organization", type: "string" },
  { key: "model", type: "string", options: { source: "resolveFields" } },
  {
    key: "organizer",
    type: "string",
    options: { source: "resolveFields", refreshOn: ["org"] },
  },
  {
    key: "sec",
    type: "section",
    children: [{ key: "tone", type: "string", default: "calm" }],
  },
  { key: "plain", type: "string", options: [{ value: "a", label: "A" }] },
];
const ctx = { appId: "evb", actionKey: "list", version: "1", connectionId: "c1" };

test("A2 splitForm: defaults, sections, D-5 omission", () => {
  const s = splitForm(params, { org: expr, model: secret, plain: { $: "x" }, extra: 1 });
  assert.deepEqual(s.form, { tone: "calm" });
  assert.deepEqual(s.unresolved.sort(), ["model", "org", "plain"]);
  for (const k of ["org", "model", "plain"]) assert.ok(!(k in s.form));
});

test("A2 init: fields whose refreshOn all resolved", () => {
  const r = planRequests(params, { org: "o1" }, "init");
  assert.deepEqual(r, {
    reason: "init",
    form: { org: "o1", tone: "calm" },
    fields: ["model", "organizer"],
    unresolved: [],
  });
  const u = planRequests(params, { org: expr, model: secret }, "init");
  assert.deepEqual(u?.fields, ["model"]);
  assert.deepEqual(u?.unresolved.sort(), ["model", "org"]);
  assert.deepEqual(u?.form, { tone: "calm" });
  assert.equal(planRequests([params[0]], {}, "init"), null);
});

test("A3 change: only dependents, previous, changed", () => {
  const r = planRequests(params, { org: "o2" }, "change", ["org"], { org: "o1" });
  assert.deepEqual(r, {
    reason: "change",
    form: { org: "o2", tone: "calm" },
    fields: ["organizer"],
    unresolved: [],
    changed: ["org"],
    previous: { org: "o1", tone: "calm" },
  });
  assert.equal(planRequests(params, { org: "o2" }, "change", ["plain"], {}), null);
  assert.equal(planRequests(params, { org: expr }, "change", ["org"], { org: "o1" }), null);
  const p = planRequests(params, { org: "o2", model: expr }, "change", ["org"], { org: expr });
  assert.deepEqual(p?.previous, { tone: "calm" });
  assert.deepEqual(p?.unresolved, ["model"]);
});

test("A4 cache key, none, overlap", () => {
  const org = params[2];
  const a = cacheKey(ctx, org, { org: "o1" });
  assert.equal(a, cacheKey(ctx, org, { org: "o1", other: 2 }));
  assert.notEqual(a, cacheKey(ctx, org, { org: "o2" }));
  assert.notEqual(a, cacheKey({ ...ctx, connectionId: "c2" }, org, { org: "o1" }));
  assert.notEqual(a, cacheKey({ ...ctx, version: "2" }, org, { org: "o1" }));
  assert.notEqual(a, cacheKey({ ...ctx, actionKey: "x" }, org, { org: "o1" }));
  assert.notEqual(a, cacheKey({ ...ctx, appId: "x" }, org, { org: "o1" }));
  assert.notEqual(a, cacheKey(ctx, params[1], { org: "o1" }));
  assert.equal(isCacheable(org), true);
  assert.equal(
    isCacheable({ key: "k", type: "string", options: { source: "resolveFields", cache: "none" } }),
    false,
  );
  assert.equal(fieldsOverlap(["a", "b"], ["b"]), true);
  assert.equal(fieldsOverlap(["a"], ["b"]), false);
});

test("A5 reconcile keep/flag/clear", () => {
  const opts = [
    { value: "a", label: "A" },
    { value: 2, label: "Two" },
  ];
  const o = (reason: "init" | "change", allowCustom: boolean) => ({
    reason,
    allowCustom,
    appLabel: "Anthropic",
  });
  assert.deepEqual(reconcileValue("a", opts, o("change", false)), { action: "keep" });
  assert.deepEqual(reconcileValue(2, opts, o("init", false)), { action: "keep" });
  assert.deepEqual(reconcileValue("zz", opts, o("init", false)), {
    action: "flag",
    message: "Not in the list returned by Anthropic",
  });
  assert.deepEqual(reconcileValue("zz", opts, o("change", true)).action, "flag");
  assert.deepEqual(reconcileValue("zz", opts, o("change", false)), { action: "clear" });
  for (const v of [expr, secret, { $: "p" }]) {
    assert.deepEqual(reconcileValue(v, opts, o("change", false)), { action: "keep" });
  }
  assert.deepEqual(reconcileValue(undefined, opts, o("change", false)), { action: "keep" });
});

test("A6 no-fetch reasons and hints", () => {
  const org = params[2];
  assert.deepEqual(noFetchReason(org, params, { org: "o" }, {}), {
    reason: "no-connection",
    hint: "Connect an account to load choices",
  });
  assert.deepEqual(noFetchReason(org, params, { org: expr }, ctx), {
    reason: "unresolved-dependency",
    hint: "Options unavailable while Organization is an expression",
  });
  assert.equal(noFetchReason(org, params, { org: "o" }, ctx), null);
});
