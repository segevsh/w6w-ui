// Run: node --test src/trigger-fields.test.ts  (Node 24, type-stripped)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  asFieldDefs,
  coerceDefault,
  fieldWidget,
  fieldsToParams,
  seedValues,
} from "./trigger-fields.ts";

/** The intake's own example: a manual trigger with two required string fields. */
const TWO_FIELDS = [
  { key: "email", type: "string", default: "", required: true },
  { key: "first_name", type: "string", default: "", required: true },
];

test("fieldsToParams — the intake's two-field trigger projects to two params", () => {
  assert.deepEqual(fieldsToParams(TWO_FIELDS), [
    { key: "email", label: "email", type: "string", required: true },
    { key: "first_name", label: "first_name", type: "string", required: true },
  ]);
});

test("fieldsToParams — a blank or missing key is skipped", () => {
  const params = fieldsToParams([
    { key: "keep", type: "string" },
    { key: "   ", type: "string" },
    { key: "", type: "string" },
    { type: "string" },
  ]);
  assert.deepEqual(
    params.map((p) => p.key),
    ["keep"],
  );
});

test("fieldWidget — the three real widgets map to themselves", () => {
  assert.equal(fieldWidget("number"), "number");
  assert.equal(fieldWidget("boolean"), "boolean");
  assert.equal(fieldWidget("json"), "json");
});

test("fieldWidget — anything else falls back to string", () => {
  assert.equal(fieldWidget("string"), "string");
  assert.equal(fieldWidget(undefined), "string");
  assert.equal(fieldWidget(""), "string");
  // An unknown/unsupported declared type must still render SOMETHING fillable.
  assert.equal(fieldWidget("datetime"), "string");
  assert.equal(fieldWidget("Number"), "string");
});

test("coerceDefault — an empty/absent default yields undefined", () => {
  assert.equal(coerceDefault("string", ""), undefined);
  assert.equal(coerceDefault("string", null), undefined);
  assert.equal(coerceDefault("string", undefined), undefined);
  assert.equal(coerceDefault("number", ""), undefined);
});

test("coerceDefault — a number default becomes a number", () => {
  assert.equal(coerceDefault("number", "42"), 42);
  assert.equal(coerceDefault("number", 42), 42);
  // Not a number → no seed at all, rather than NaN in the form.
  assert.equal(coerceDefault("number", "abc"), undefined);
});

test("coerceDefault — a boolean default becomes a boolean", () => {
  assert.equal(coerceDefault("boolean", "true"), true);
  assert.equal(coerceDefault("boolean", true), true);
  assert.equal(coerceDefault("boolean", "false"), false);
  assert.equal(coerceDefault("boolean", "yes"), false);
});

test("coerceDefault — a json default is parsed, an invalid one is dropped", () => {
  assert.deepEqual(coerceDefault("json", '{"a":1}'), { a: 1 });
  assert.equal(coerceDefault("json", "{oops"), undefined);
});

test("coerceDefault — anything else stringifies", () => {
  assert.equal(coerceDefault("string", "hi"), "hi");
  assert.equal(coerceDefault(undefined, 7), "7");
});

test("seedValues — omits keys whose coerced default is undefined", () => {
  assert.deepEqual(
    seedValues([
      { key: "email", type: "string", default: "" },
      { key: "count", type: "number", default: "3" },
      { key: "bad", type: "number", default: "abc" },
      { key: "flag", type: "boolean", default: "true" },
      { key: "  ", type: "string", default: "x" },
    ]),
    { count: 3, flag: true },
  );
});

test("seedValues — the intake's two-field trigger seeds nothing (both defaults blank)", () => {
  assert.deepEqual(seedValues(TWO_FIELDS), {});
});

test("asFieldDefs — a non-array fields value reads as no fields", () => {
  assert.deepEqual(asFieldDefs(undefined), []);
  assert.deepEqual(asFieldDefs({ key: "email" }), []);
  assert.deepEqual(asFieldDefs(TWO_FIELDS), TWO_FIELDS);
});
