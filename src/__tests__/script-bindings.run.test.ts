// Run: node --experimental-strip-types --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/script-bindings.run.test.ts
// Script insertions emit the `run` / `state` / `vars` globals (R3, R15).
import assert from "node:assert/strict";
import { test } from "node:test";
import { codeReadFor, convertCodeBindingsToReads } from "../script-bindings.ts";

const CASES: [string, string, string][] = [
  ["nodes.a.output.total", "run.nodes.a.output.total", 'run["nodes"]["a"]["output"]["total"]'],
  ["steps.a.output", "run.nodes.a.output", 'run["nodes"]["a"]["output"]'],
  ["trigger.event.id", "run.trigger.event.id", 'run["trigger"]["event"]["id"]'],
  ["foreach.item", "run.foreach.item", 'run["foreach"]["item"]'],
  ["state.order.id", "state.order.id", 'state["order"]["id"]'],
  ["var.order.id", "state.order.id", 'state["order"]["id"]'],
  ["vars.order.id", "state.order.id", 'state["order"]["id"]'],
  ["state.nodes.x", "vars.nodes.x", 'vars["nodes"]["x"]'],
  ["var.trigger", "vars.trigger", 'vars["trigger"]'],
  ["vars.foreach.item", "vars.foreach.item", 'vars["foreach"]["item"]'],
  ["var", "vars", "vars"],
  ["const.tier", "consts.tier", 'consts["tier"]'],
];

test("A4 — codeReadFor, JavaScript and Python", () => {
  for (const [ref, js, py] of CASES) {
    assert.equal(codeReadFor(ref), js, ref);
    assert.equal(codeReadFor(ref, "python"), py, `${ref} (python)`);
  }
});

test("A4 — null cases unchanged", () => {
  for (const ref of ["secrets.K", "documents.d", "inputs.x", "a + b"]) {
    assert.equal(codeReadFor(ref), null, ref);
  }
});

test("A4 — R15: nothing is ever emitted on state.nodes / state.trigger / state.foreach", () => {
  const bad = /^state(\.|\[")(nodes|trigger|foreach)/;
  let seen = 0;
  for (const [ref] of CASES) {
    for (const lang of ["javascript", "python"] as const) {
      const out = codeReadFor(ref, lang);
      assert.ok(out !== null, ref);
      assert.ok(!bad.test(out), `${ref} -> ${out}`);
      seen++;
    }
  }
  assert.equal(seen, CASES.length * 2);
});

test("A4 — convertCodeBindingsToReads emits run.* and state.*", () => {
  assert.equal(
    convertCodeBindingsToReads("return '{{ nodes.s.output.id }}';").code,
    "return run.nodes.s.output.id;",
  );
  assert.equal(convertCodeBindingsToReads("return '{{ var.n }}';").code, "return state.n;");
});

test("A5 — the current JS script default never names state.nodes", async () => {
  const { internalNodeDefaults, SCRIPT_APP } = await import("../flow-types.ts");
  const code = String(internalNodeDefaults(SCRIPT_APP, "run").code);
  assert.ok(code.length > 0);
  assert.ok(!code.includes("state.nodes") && !code.includes('state["nodes"]'), code);
});
