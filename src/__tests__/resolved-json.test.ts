// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/resolved-json.test.ts  (Node 24)
import assert from "node:assert/strict";
import { test } from "node:test";
import { type ResolveScope, isDollarExpr, isDollarPath } from "../resolve-params.ts";
import { foldResolvedSegments, resolveParamJson, resolveVarsJson } from "../resolved-json.ts";

const emptyScope: ResolveScope = { vars: {}, documents: {}, steps: {}, trigger: {} };

test("A6 — single resolved segment: seg.value verbatim, type preserved (incl. falsy)", () => {
  assert.equal(resolveParamJson("Hello", emptyScope), "Hello");
  assert.equal(resolveParamJson(false, emptyScope), false);
  assert.deepStrictEqual(resolveParamJson({}, emptyScope), {});
  assert.deepStrictEqual(resolveParamJson(null, emptyScope), null);
  assert.equal(resolveParamJson("", emptyScope), "");
  assert.equal(resolveParamJson(0, emptyScope), 0);
});

test("M4 — a resolved segment whose value is `undefined` folds to the literal token, never an omitted key", () => {
  assert.deepStrictEqual(
    foldResolvedSegments([{ status: "resolved", value: undefined }]),
    "<not set>",
  );
  // Same rule inside an object: the key survives, not silently dropped by
  // `JSON.stringify`'s own undefined-key behaviour.
  const obj = { a: resolveParamJson(undefined, emptyScope) };
  const parsed = JSON.parse(JSON.stringify(obj));
  assert.equal("a" in parsed, true, "no key is ever dropped");
  assert.equal(parsed.a, "<not set>");
});

test("M5 — an unresolved segment folds to its ref-carrying token, never the ref standing in as the value", () => {
  const value = resolveParamJson(
    { type: "expr", parts: [{ kind: "var", ref: "vars.missing_var" }] },
    emptyScope,
  );
  assert.equal(value, "<unresolved: vars.missing_var>");
});

test("A6 — a not-evaluated segment folds to its fixed token", () => {
  const value = resolveParamJson(
    { type: "expr", parts: [{ kind: "expr", expr: { var: "x" } }] },
    emptyScope,
  );
  assert.equal(value, "<not evaluated>");
});

test("M3 — a masked segment (SecretValue envelope) folds to the fixed token, never ciphertext/plaintext", () => {
  const value = resolveParamJson(
    { type: "secret", ciphertext: "Y2lwaGVydGV4dC1zZW50aW5lbA", iv: "aXYtc2VudGluZWw" },
    emptyScope,
  );
  assert.equal(value, "<masked>");
  assert.equal(JSON.stringify(value).includes("Y2lwaGVydGV4dC1zZW50aW5lbA"), false);
  assert.equal(JSON.stringify(value).includes("ciphertext"), false);
});

test("M3 — a masked segment carrying a ref folds to the ref-qualified token", () => {
  const value = resolveParamJson(
    { type: "expr", parts: [{ kind: "secret", ref: "api_key" }] },
    emptyScope,
  );
  assert.equal(value, "<masked: api_key>");
});

test("A6 — multiple segments concatenate into one string; resolved text as-is, everything else as its token", () => {
  const value = resolveParamJson(
    {
      type: "expr",
      parts: [
        { kind: "text", value: "Hi " },
        { kind: "var", ref: "vars.missing" },
        { kind: "text", value: ", welcome" },
      ],
    },
    emptyScope,
  );
  assert.equal(value, "Hi <unresolved: vars.missing>, welcome");
});

test("A6 — multiple segments: a non-string resolved part is JSON.stringify'd inline", () => {
  const value = foldResolvedSegments([
    { status: "resolved", value: "count=" },
    { status: "resolved", value: 3 },
  ]);
  assert.equal(value, "count=3");
});

test("A6 — a vars-typed param folds to an object keyed by each row's key, falling back to '(no key)'", () => {
  const scope: ResolveScope = {
    vars: { from: "hi@example.com" },
    documents: {},
    steps: {},
    trigger: {},
  };
  const rows = [
    {
      key: "sender",
      value: { type: "expr" as const, parts: [{ kind: "var" as const, ref: "vars.from" }] },
    },
    { key: "", value: 3 },
  ];
  assert.deepStrictEqual(resolveVarsJson(rows, scope), {
    sender: "hi@example.com",
    "(no key)": 3,
  });
});

// T3.2.1 - whole-value `{ "$": ref }` binding folds through the same path as any other value.
const dollarScope: ResolveScope = {
  vars: { o: { a: 1 }, arr: [1, 2], nul: null, f: false, z: 0, e: "" },
  documents: {},
  steps: {},
  trigger: {},
};

test('T3.2.1 - whole-value $ preserves object/array/null/false/0/""', () => {
  assert.deepStrictEqual(resolveParamJson({ $: "vars.o" }, dollarScope), { a: 1 });
  assert.deepStrictEqual(resolveParamJson({ $: "vars.arr" }, dollarScope), [1, 2]);
  assert.deepStrictEqual(resolveParamJson({ $: "vars.nul" }, dollarScope), null);
  assert.deepStrictEqual(resolveParamJson({ $: "vars.f" }, dollarScope), false);
  assert.deepStrictEqual(resolveParamJson({ $: "vars.z" }, dollarScope), 0);
  assert.deepStrictEqual(resolveParamJson({ $: "vars.e" }, dollarScope), "");
});

test("T3.2.1 - whole-value $ with no value folds to the unresolved token", () => {
  assert.equal(
    resolveParamJson({ $: "steps.a.output" }, dollarScope),
    "<unresolved: steps.a.output>",
  );
});

test("T3.2.1 - a nested $ marker stays literal", () => {
  const v = { outer: { $: "vars.o" } };
  assert.deepStrictEqual(resolveParamJson(v, dollarScope), v);
});

test("T3.2.1 - isDollarPath / isDollarExpr: true for exactly one key only", () => {
  assert.equal(isDollarPath({ $: "x" }), true);
  assert.equal(isDollarPath({ $: "x", y: 1 }), false);
  assert.equal(isDollarPath([{ $: "x" }]), false);
  assert.equal(isDollarPath(null), false);
  assert.equal(isDollarExpr({ $expr: {} }), true);
  assert.equal(isDollarExpr({ $expr: {}, y: 1 }), false);
  assert.equal(isDollarExpr([{ $expr: {} }]), false);
  assert.equal(isDollarExpr(null), false);
});
