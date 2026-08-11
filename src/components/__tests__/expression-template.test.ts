// Run: node --test src/components/__tests__/expression-template.test.ts  (Node 24, type-stripped)
//
// The `{{ }}` GRAMMAR (parse/serialize) now lives in `@w6w/expr` and is tested
// there: core/packages/expr/tests/template.test.ts. What remains here is the
// editor-only surface this module keeps — `renderResult` (the preview policy
// that masks secrets as `•••`), `partsToValue` and `valueToParts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExprPart, ExprValue, SecretValue } from "../../types.ts";
import {
  partsToValue,
  renderResult,
  serializeTemplate,
  valueToParts,
} from "../expression-template.ts";

test("renderResult: var ref present in samples renders the value", () => {
  assert.equal(renderResult([{ kind: "var", ref: "vars.env" }], { "vars.env": "prod" }), "prod");
});

test("renderResult: var ref absent from samples renders empty string, not the {{ }} placeholder", () => {
  assert.equal(renderResult([{ kind: "var", ref: "steps.gate_1.output.first_name" }], {}), "");
});

test("renderResult: mixed text + present var + absent var", () => {
  assert.equal(
    renderResult(
      [
        { kind: "text", value: "Hi " },
        { kind: "var", ref: "vars.name" },
        { kind: "text", value: ", id " },
        { kind: "var", ref: "vars.missing" },
      ],
      { "vars.name": "Alex" },
    ),
    "Hi Alex, id ",
  );
});

test("renderResult: text parts concatenate literally", () => {
  assert.equal(
    renderResult(
      [
        { kind: "text", value: "Hello, " },
        { kind: "text", value: "world!" },
      ],
      {},
    ),
    "Hello, world!",
  );
});

test("renderResult: secret parts render masked, regardless of samples", () => {
  assert.equal(renderResult([{ kind: "secret", ref: "jwt_key" }], {}), "•••");
});

test("renderResult: expr parts fall back to their {{ }} template form", () => {
  assert.equal(
    renderResult([{ kind: "expr", expr: { var: "vars.n" } }], {}),
    '{{ ={"var":"vars.n"} }}',
  );
});

// --- partsToValue / valueToParts: the editable ⇄ wire forms ------------------

test("partsToValue: prunes empty text and collapses a lone text part to a plain string", () => {
  assert.equal(partsToValue([]), "");
  assert.equal(partsToValue([{ kind: "text", value: "" }]), "");
  assert.equal(partsToValue([{ kind: "text", value: "plain" }]), "plain");
});

test("partsToValue: anything multipart becomes an ExprValue of wire parts", () => {
  assert.deepEqual(
    partsToValue([
      { kind: "text", value: "Bearer " },
      { kind: "secret", ref: "jwt" },
    ]),
    {
      type: "expr",
      parts: [
        { kind: "text", value: "Bearer " },
        { kind: "secret", ref: "jwt" },
      ],
    },
  );
});

test("valueToParts: a plain string, an ExprValue, and a sealed secret", () => {
  assert.deepEqual(valueToParts("hi"), { parts: [{ kind: "text", value: "hi" }], sealed: null });
  assert.deepEqual(valueToParts(""), { parts: [], sealed: null });
  const v: ExprValue = { type: "expr", parts: [{ kind: "var", ref: "vars.env" }] };
  assert.deepEqual(valueToParts(v), { parts: [{ kind: "var", ref: "vars.env" }], sealed: null });
  const sealed: SecretValue = { type: "secret", ciphertext: "c", iv: "i" };
  assert.deepEqual(valueToParts(sealed), { parts: [], sealed });
});

test("partsToValue ∘ valueToParts round-trips a multipart value", () => {
  const v: ExprValue = {
    type: "expr",
    parts: [
      { kind: "text", value: "x=" },
      { kind: "var", ref: "vars.y" },
    ],
  };
  assert.deepEqual(partsToValue(valueToParts(v).parts), v);
});

test("the re-exported serializeTemplate is the one @w6w/expr defines", () => {
  const parts: ExprPart[] = [
    { kind: "text", value: "x=" },
    { kind: "var", ref: "vars.y" },
  ];
  assert.equal(serializeTemplate(parts), "x={{ vars.y }}");
});
