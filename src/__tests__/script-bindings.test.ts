// Run (from packages/ui): node --experimental-strip-types --test src/__tests__/script-bindings.test.ts
//
// `{{ }}` typed into a Run script's code: found where it would run, and moved to Input on request.
import assert from "node:assert/strict";
import { test } from "node:test";
import { findCodeBindings, moveCodeBindingsToInput } from "../script-bindings.ts";

// The script a user wrote (wf "Update ticket price"): Test substituted these markers, a full run
// did not, and the run failed "Cannot join mismatching currencies".
const USER_CODE = `// Runs as a function body. Return the step's output.
function extractAmount(cost) {
  const [currency, amount] = cost.split(',');
  return { currency, amount: Number(amount) };
}
const cost_total = '{{ nodes.get_event_ticket_1.output.costs.total }}';
const cost_tax = '{{ nodes.get_event_ticket_1.output.costs.tax }}';
return addAmounts([cost_total,'-',cost_tax]);
`;

test("finds markers in strings and code, never in comments", () => {
  const code = `// {{ nodes.a.output }} in a comment\n/* {{ x }} */\nconst a = {{ nodes.a.output.n }};\nconst b = "{{ var.region }}";`;
  const found = findCodeBindings(code);
  assert.deepEqual(
    found.map((b) => [b.ref, b.context.kind]),
    [
      ["nodes.a.output.n", "code"],
      ["var.region", "string"],
    ],
  );
  assert.deepEqual(findCodeBindings("return input;"), []);
  assert.deepEqual(findCodeBindings("# {{ nodes.a.output }}\nreturn input", "python"), []);
});

test("the user's script: each whole-string marker becomes input.<name>, bound under Input", () => {
  const r = moveCodeBindingsToInput(USER_CODE, undefined);
  assert.ok(r.ok);
  assert.equal(r.moved, 2);
  assert.equal(r.left, 0);
  assert.ok(r.code.includes("const cost_total = input.total;"));
  assert.ok(r.code.includes("const cost_tax = input.tax;"));
  assert.ok(!r.code.includes("{{"), "no marker left in the code");
  assert.deepEqual(r.input, {
    total: "{{ nodes.get_event_ticket_1.output.costs.total }}",
    tax: "{{ nodes.get_event_ticket_1.output.costs.tax }}",
  });
  assert.deepEqual(findCodeBindings(r.code), [], "nothing left to warn about");
});

test("names: entire output takes the step id; collisions widen, then number; a repeat reuses", () => {
  const code =
    "a = {{ nodes.s1.output }}; b = {{ nodes.s1.output.x.id }}; c = {{ nodes.s2.output.y.id }}; d = {{ nodes.s1.output }};";
  const r = moveCodeBindingsToInput(code, { id: 1 });
  assert.ok(r.ok);
  assert.equal(r.code, "a = input.s1; b = input.x_id; c = input.y_id; d = input.s1;");
  assert.deepEqual(r.input, {
    id: 1,
    s1: "{{ nodes.s1.output }}",
    x_id: "{{ nodes.s1.output.x.id }}",
    y_id: "{{ nodes.s2.output.y.id }}",
  });
});

test("an existing Input key with the same binding is reused, not duplicated", () => {
  const r = moveCodeBindingsToInput("return '{{ var.region }}';", { region: "{{ var.region }}" });
  assert.ok(r.ok);
  assert.equal(r.code, "return input.region;");
  assert.deepEqual(r.input, { region: "{{ var.region }}" });
});

test("JavaScript: inside a template literal or a longer string the read is spliced in", () => {
  const r = moveCodeBindingsToInput(
    "const a = `id ${1} {{ nodes.s.output.id }}`; const b = 'n: {{ var.n }}!';",
    undefined,
  );
  assert.ok(r.ok);
  assert.equal(r.code, "const a = `id ${1} ${input.id}`; const b = 'n: ' + input.n + '!';");
});

test("Python: dict reads; a marker inside a longer string is left and counted", () => {
  const r = moveCodeBindingsToInput(
    "a = '{{ nodes.s.output.total }}'\nb = f'x {{ var.n }}'\nreturn a",
    undefined,
    "python",
  );
  assert.ok(r.ok);
  assert.equal(r.left, 1);
  assert.equal(r.code, "a = input[\"total\"]\nb = f'x {{ var.n }}'\nreturn a");
  assert.deepEqual(r.input, { total: "{{ nodes.s.output.total }}" });
});

test("refuses when Input is a single bound value (turning it into an object changes `input`)", () => {
  for (const input of ["{{ nodes.a.output }}", { $: "nodes.a.output" }, [1, 2], 3]) {
    const r = moveCodeBindingsToInput("return '{{ var.x }}';", input);
    assert.equal(r.ok, false, JSON.stringify(input));
  }
});
