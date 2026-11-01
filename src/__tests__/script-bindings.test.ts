// Run (from packages/ui): node --experimental-strip-types --test src/__tests__/script-bindings.test.ts
//
// `{{ }}` typed into a Run script's code: found where it would run, and converted to the code
// reads a script's globals offer (`state.nodes.<id>.output`, `vars`, `consts`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { codeReadFor, convertCodeBindingsToReads, findCodeBindings } from "../script-bindings.ts";

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

test("codeReadFor: step outputs, vars and consts, in JavaScript and Python", () => {
  assert.equal(codeReadFor("nodes.a.output.costs.total"), "run.nodes.a.output.costs.total");
  assert.equal(codeReadFor("steps.a.output"), "run.nodes.a.output");
  assert.equal(codeReadFor("var.region"), "state.region");
  assert.equal(codeReadFor("const.tier"), "consts.tier");
  assert.equal(codeReadFor("trigger.event.id"), "run.trigger.event.id");
  assert.equal(codeReadFor("foreach.item"), "run.foreach.item");
  assert.equal(
    codeReadFor("nodes.a.output.items[0].first-name"),
    'run.nodes.a.output.items[0]["first-name"]',
  );
  assert.equal(
    codeReadFor("nodes.a.output.costs.total", "python"),
    'run["nodes"]["a"]["output"]["costs"]["total"]',
  );
  assert.equal(codeReadFor("var.region", "python"), 'state["region"]');
  assert.equal(codeReadFor("const.tier", "python"), 'consts["tier"]');
  assert.equal(
    codeReadFor("nodes.a.output.items[0]", "python"),
    'run["nodes"]["a"]["output"]["items"][0]',
  );
});

test("codeReadFor: nothing a script can't read as code", () => {
  for (const ref of [
    "secrets.K",
    "documents.d",
    "inputs.x",
    "nodes.a.output | upper",
    "a + b",
    "",
  ]) {
    assert.equal(codeReadFor(ref), null, ref);
  }
});

test("the user's script: each whole-string marker becomes a state read", () => {
  const r = convertCodeBindingsToReads(USER_CODE);
  assert.equal(r.converted, 2);
  assert.equal(r.left, 0);
  assert.ok(
    r.code.includes("const cost_total = run.nodes.get_event_ticket_1.output.costs.total;"),
  );
  assert.ok(r.code.includes("const cost_tax = run.nodes.get_event_ticket_1.output.costs.tax;"));
  assert.deepEqual(findCodeBindings(r.code), [], "nothing left");
});

test("JavaScript: bare, template-literal and longer-string markers", () => {
  const r = convertCodeBindingsToReads(
    "const n = {{ nodes.s.output.id }}; const a = `id ${1} {{ var.n }}`; const b = 'n: {{ const.c }}!'; const c = '{{ var.x }}/{{ var.y }}';",
  );
  assert.equal(r.converted, 5);
  assert.equal(
    r.code,
    "const n = run.nodes.s.output.id; const a = `id ${1} ${state.n}`; const b = 'n: ' + consts.c + '!'; const c = state.x + '/' + state.y;",
  );
});

test("Python: dict reads; str() inside a plain string; prefixed strings and secrets are left", () => {
  const r = convertCodeBindingsToReads(
    "a = '{{ nodes.s.output.total }}'\nb = 'x {{ var.n }}'\nc = f'x {{ var.n }}'\nd = '{{ secrets.K }}'\nreturn a",
    "python",
  );
  assert.equal(r.converted, 2);
  assert.equal(r.left, 2);
  assert.equal(
    r.code,
    'a = run["nodes"]["s"]["output"]["total"]\nb = \'x \' + str(state["n"])\nc = f\'x {{ var.n }}\'\nd = \'{{ secrets.K }}\'\nreturn a',
  );
});

test("no markers: the code comes back unchanged", () => {
  const code = "// {{ nodes.a.output }}\nreturn input;";
  assert.deepEqual(convertCodeBindingsToReads(code), {
    code,
    converted: 0,
    left: 0,
  });
});
