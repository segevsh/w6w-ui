// Run: node --test src/components/__tests__/expression-template.test.ts  (Node 24, type-stripped)
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExprPart } from "../../types.ts";
import { parseTemplate, renderResult, serializeTemplate } from "../expression-template.ts";

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

// --- balanced `}}` close: an expr arm whose JSON ends in an object ----------

test("=<json ending in an object> parses to the parsed object, not a truncated raw string", () => {
  assert.deepEqual(parseTemplate('{{ ={"missing":{"var":"a"}} }}'), [
    { kind: "expr", expr: { missing: { var: "a" } } },
  ]);
  assert.deepEqual(parseTemplate('{{ ={"map":{"var":"x"}} }}'), [
    { kind: "expr", expr: { map: { var: "x" } } },
  ]);
});

test("the balanced close is string-aware: a `}}` inside a JSON string does not end the arm", () => {
  assert.deepEqual(parseTemplate('{{ ={"a":"}}"} }}'), [{ kind: "expr", expr: { a: "}}" } }]);
});

test("neighbours on both sides of an object-ending expr arm stay intact", () => {
  assert.deepEqual(parseTemplate('x {{ ={"a":{"b":1}} }} y {{ vars.z }}'), [
    { kind: "text", value: "x " },
    { kind: "expr", expr: { a: { b: 1 } } },
    { kind: "text", value: " y " },
    { kind: "var", ref: "vars.z" },
  ]);
});

test("unbalanced/half-typed expr input falls back to today's first-`}}` behaviour", () => {
  assert.deepEqual(parseTemplate('{{ ={"a": 1 }}'), [{ kind: "expr", expr: '{"a": 1' }]);
});

// --- idempotent round trip over the nine measured cases (stream B) ---------

test("idempotent round trip + fidelity over the measured corpus", () => {
  const CORPUS: ExprPart[][] = [
    [{ kind: "expr", expr: { missing: { var: "a" } } }],
    [{ kind: "var", ref: "secrets.foo" }],
    [{ kind: "text", value: "literal {{ vars.x }} here" }],
    [{ kind: "secret", ref: "jwt_key" }],
    [{ kind: "expr", expr: { if: [{ var: "x" }, { var: "y" }, "n"] } }],
    [
      { kind: "text", value: "line1\nline2 " },
      { kind: "var", ref: "vars.x" },
      { kind: "text", value: "\n" },
    ],
    [
      { kind: "var", ref: "vars.a" },
      { kind: "var", ref: "vars.b" },
    ],
    [
      { kind: "var", ref: "vars.a" },
      { kind: "text", value: " " },
      { kind: "var", ref: "vars.b" },
    ],
    [{ kind: "expr", expr: "a + b" }],
  ];
  for (const [n, parts] of CORPUS.entries()) {
    const t = serializeTemplate(parts);
    assert.equal(serializeTemplate(parseTemplate(t)), t, `case ${n + 1} not idempotent`);
  }
  // full fidelity for every case except the two by-design promotions (index 1, 2)
  for (const i of [0, 3, 4, 5, 6, 7, 8]) {
    assert.deepEqual(
      parseTemplate(serializeTemplate(CORPUS[i])),
      CORPUS[i],
      `case ${i + 1} fidelity`,
    );
  }
});

test("a `var` ref starting `secrets.` promotes to a `secret` part on round trip (by design)", () => {
  const parts: ExprPart[] = [{ kind: "var", ref: "secrets.foo" }];
  assert.deepEqual(parseTemplate(serializeTemplate(parts)), [{ kind: "secret", ref: "foo" }]);
});

test("text containing `{{ … }}` promotes that span to a chip on round trip (by design)", () => {
  const parts: ExprPart[] = [{ kind: "text", value: "literal {{ vars.x }} here" }];
  assert.deepEqual(parseTemplate(serializeTemplate(parts))[1], { kind: "var", ref: "vars.x" });
});

test("a value ending in a trailing newline survives the round trip", () => {
  const parts: ExprPart[] = [
    { kind: "var", ref: "vars.x" },
    { kind: "text", value: "\n" },
  ];
  const t = serializeTemplate(parts);
  assert.equal(serializeTemplate(parseTemplate(t)), t);
  assert.deepEqual(parseTemplate(t), parts);
});

// --- render mode: structural, not a post-filter -----------------------------

test("render mode: secrets.NAME falls through to the var arm — not dropped, not text", () => {
  assert.deepEqual(parseTemplate("{{ secrets.foo }}", "render"), [
    { kind: "var", ref: "secrets.foo" },
  ]);
});

test("render mode: nothing is dropped and order is preserved", () => {
  assert.deepEqual(parseTemplate("Hi {{ secrets.a }} and {{ vars.b }}!", "render"), [
    { kind: "text", value: "Hi " },
    { kind: "var", ref: "secrets.a" },
    { kind: "text", value: " and " },
    { kind: "var", ref: "vars.b" },
    { kind: "text", value: "!" },
  ]);
});

test("render mode keeps the `=` arm, including the balanced scan", () => {
  assert.deepEqual(parseTemplate('{{ ={"var":"vars.n"} }}', "render"), [
    { kind: "expr", expr: { var: "vars.n" } },
  ]);
  assert.deepEqual(parseTemplate('{{ ={"missing":{"var":"a"}} }}', "render"), [
    { kind: "expr", expr: { missing: { var: "a" } } },
  ]);
});

test("editor mode (the default) still promotes secrets.NAME to a secret part", () => {
  assert.deepEqual(parseTemplate("{{ secrets.foo }}"), [{ kind: "secret", ref: "foo" }]);
});

test("render mode never emits a secret part, over hostile spellings", () => {
  const hostile = [
    "{{ secrets.API_KEY }}",
    "{{ secrets. }}",
    "{{   secrets.a.b   }}",
    '{{ ={"var":"secrets.API_KEY"} }}',
    "{{ render:doc }}",
    "{{ =render }}",
  ];
  for (const t of hostile) {
    for (const p of parseTemplate(t, "render")) {
      assert.ok(["text", "var", "expr"].includes(p.kind), `emitted kind=${p.kind} for ${t}`);
    }
  }
});
