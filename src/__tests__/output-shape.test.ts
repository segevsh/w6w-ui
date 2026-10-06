// Run: node --test src/__tests__/output-shape.test.ts  (Node 24, type-stripped)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  declaredOutputFields,
  inferOutputFields,
  resolveOutputShape,
  valueAtPath,
} from "../output-shape.ts";

test("declaredOutputFields — an OutputField[] becomes path fields, label kept", () => {
  assert.deepEqual(
    declaredOutputFields([
      { key: "id", type: "string", label: "Event ID" },
      { key: "start.utc", type: "string", label: "" },
    ]),
    [
      { key: "id", label: "Event ID", path: true },
      { key: "start.utc", path: true },
    ],
  );
});

test("declaredOutputFields — a DynamicOutput, an empty list or junk entries declare nothing", () => {
  assert.equal(declaredOutputFields({ source: "outputFor" }), undefined);
  assert.equal(declaredOutputFields([]), undefined);
  assert.equal(declaredOutputFields(undefined), undefined);
  assert.equal(declaredOutputFields([{ key: "" }, { label: "x" }, null, "id"]), undefined);
});

test("inferOutputFields — every key, nested plain objects recursed, arrays are leaves", () => {
  assert.deepEqual(
    inferOutputFields({ id: "1", name: { text: "Gala", html: "<b>Gala</b>" }, tags: [{ a: 1 }] }),
    [
      { key: "id", path: true },
      { key: "name", path: true },
      { key: "name.text", path: true },
      { key: "name.html", path: true },
      { key: "tags", path: true },
    ],
  );
});

test("inferOutputFields — stops recursing at depth 3", () => {
  const keys = inferOutputFields({ a: { b: { c: { d: 1 } } } })?.map((f) => f.key);
  assert.deepEqual(keys, ["a", "a.b", "a.b.c"]);
});

test("inferOutputFields — scalars, arrays and empty objects infer nothing", () => {
  assert.equal(inferOutputFields("x"), undefined);
  assert.equal(inferOutputFields([{ a: 1 }]), undefined);
  assert.equal(inferOutputFields({}), undefined);
  assert.equal(inferOutputFields(null), undefined);
});

test("inferOutputFields — caps a huge payload at 100 fields", () => {
  const big = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, i]));
  assert.equal(inferOutputFields(big)?.length, 100);
});

test("valueAtPath — walks nested objects; a missing segment is undefined", () => {
  const v = { start: { utc: "2026-10-06T10:00:00Z" }, n: 0 };
  assert.equal(valueAtPath(v, "start.utc"), "2026-10-06T10:00:00Z");
  assert.equal(valueAtPath(v, "n"), 0);
  assert.equal(valueAtPath(v, "start.local"), undefined);
  assert.equal(valueAtPath(v, "n.x"), undefined);
});

test("resolveOutputShape — declared beats sample beats test run", () => {
  const output = [{ key: "id", type: "string", label: "ID" }];
  const sample = { fromSample: 1 };
  const testOutput = { fromTest: 1 };
  assert.equal(resolveOutputShape({ output, sample }, testOutput)?.from, "declared");
  assert.deepEqual(resolveOutputShape({ sample }, testOutput), {
    fields: [{ key: "fromSample", path: true }],
    from: "sample",
  });
  assert.deepEqual(resolveOutputShape({}, testOutput), {
    fields: [{ key: "fromTest", path: true }],
    from: "test",
  });
  assert.deepEqual(resolveOutputShape(undefined, testOutput)?.from, "test");
  assert.equal(resolveOutputShape({ output: { source: "x" } }, undefined), undefined);
});
