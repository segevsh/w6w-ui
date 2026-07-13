// Run: node --test src/components/expression-template.test.ts  (Node 24, type-stripped)
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTemplate, serializeTemplate } from "./expression-template.ts";

test("plain text → single text part", () => {
  assert.deepEqual(parseTemplate("hello world"), [{ kind: "text", value: "hello world" }]);
});

test("empty string → no parts", () => {
  assert.deepEqual(parseTemplate(""), []);
});

test("a variable path → var part with the full path", () => {
  assert.deepEqual(parseTemplate("{{ vars.env }}"), [{ kind: "var", ref: "vars.env" }]);
});

test("a step-output path → var part", () => {
  assert.deepEqual(parseTemplate("{{ steps.fetch.output.title }}"), [
    { kind: "var", ref: "steps.fetch.output.title" },
  ]);
});

test("secrets.NAME → secret part keyed by bare name", () => {
  assert.deepEqual(parseTemplate("{{ secrets.jwt_key }}"), [{ kind: "secret", ref: "jwt_key" }]);
});

test("=<json> → expr part with parsed JSONLogic", () => {
  assert.deepEqual(parseTemplate('{{ ={"var":"vars.n"} }}'), [
    { kind: "expr", expr: { var: "vars.n" } },
  ]);
});

test("=<non-json> → expr part keeps the raw string", () => {
  assert.deepEqual(parseTemplate("{{ =a + b }}"), [{ kind: "expr", expr: "a + b" }]);
});

test("mixed literal + refs preserves order and text runs", () => {
  assert.deepEqual(parseTemplate("Bearer {{ secrets.jwt }} on {{ vars.env }}!"), [
    { kind: "text", value: "Bearer " },
    { kind: "secret", ref: "jwt" },
    { kind: "text", value: " on " },
    { kind: "var", ref: "vars.env" },
    { kind: "text", value: "!" },
  ]);
});

test("unterminated {{ is treated as literal text", () => {
  assert.deepEqual(parseTemplate("a {{ vars.x"), [{ kind: "text", value: "a {{ vars.x" }]);
});

test("whitespace inside braces is trimmed", () => {
  assert.deepEqual(parseTemplate("{{    vars.env    }}"), [{ kind: "var", ref: "vars.env" }]);
});

test("serialize is the inverse of parse (round-trip)", () => {
  const src = "Bearer {{ secrets.jwt }} on {{ vars.env }} #{{ steps.a.output.n }}";
  assert.equal(serializeTemplate(parseTemplate(src)), src);
});

test("round-trip of an expr part", () => {
  const parts = parseTemplate('{{ ={"+":[1,2]} }}');
  assert.equal(serializeTemplate(parts), '{{ ={"+":[1,2]} }}');
});

test("serialize prunes nothing and masks nothing structurally", () => {
  assert.equal(
    serializeTemplate([
      { kind: "text", value: "x=" },
      { kind: "var", ref: "vars.y" },
    ]),
    "x={{ vars.y }}",
  );
});
