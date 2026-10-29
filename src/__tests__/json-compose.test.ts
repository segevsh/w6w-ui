import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bareRefBinding,
  insideJsonString,
  refInsertion,
  resolveComposed,
  sampleStepsState,
} from "../components/json-compose.ts";

test("insideJsonString: after an opening quote, not after a closing one; escapes skip", () => {
  const t = '{ "a": "x\\"y", "b": 1 }';
  assert.equal(insideJsonString(t, t.indexOf("x")), true);
  assert.equal(insideJsonString(t, t.indexOf("y")), true, "an escaped quote does not close");
  assert.equal(insideJsonString(t, t.indexOf("1")), false);
  assert.equal(insideJsonString(t, 0), false);
});

test("refInsertion: a $ object where a value goes, {{ }} inside a string", () => {
  assert.equal(refInsertion('{ "a": ', 7, "nodes.s.output"), '{ "$": "nodes.s.output" }');
  assert.equal(refInsertion('{ "a": "id ', 11, "vars.k"), "{{ vars.k }}");
});

test("bareRefBinding: one rooted marker is a binding; anything else is not", () => {
  assert.deepEqual(bareRefBinding(" {{ nodes.s.meta.app }} "), { $: "nodes.s.meta.app" });
  assert.deepEqual(bareRefBinding("{{vars.k}}"), { $: "vars.k" });
  assert.equal(bareRefBinding("{{ name }}"), null, "unrooted");
  assert.equal(bareRefBinding("{{ secrets.k }}"), null, "secrets never bind a JSON field");
  assert.equal(bareRefBinding('{ "a": "{{ vars.k }}" }'), null);
  assert.equal(bareRefBinding("{{ vars.a }} {{ vars.b }}"), null);
});

test("sampleStepsState: outputs from steps./nodes. keys, metadata from meta.<field> keys", () => {
  const s = sampleStepsState({
    "nodes.a.output": { id: 1 },
    "steps.a.meta.app": "io.w6w.x",
    "steps.a.meta.connectionId": "conn_1",
    "vars.k": "v",
  });
  assert.deepEqual(s, {
    steps: { a: { output: { id: 1 }, meta: { app: "io.w6w.x", connectionId: "conn_1" } } },
  });
});

test("resolveComposed: $ objects and rooted {{ }} strings resolve at any depth; the rest is literal", () => {
  const seen: unknown[] = [];
  const out = resolveComposed(
    { a: { $: "vars.k" }, b: ["x {{ vars.k }}", "{{ name }}"], c: { $: 1 }, d: 2 },
    (leaf) => {
      seen.push(leaf);
      return "R";
    },
  );
  assert.deepEqual(out, { a: "R", b: ["R", "{{ name }}"], c: { $: 1 }, d: 2 });
  assert.equal(seen.length, 2);
});
