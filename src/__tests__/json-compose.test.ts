import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addRefToDraft,
  bareRefBinding,
  insideJsonString,
  keyForRef,
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

test("refInsertion: a quoted marker where a value goes, a bare {{ }} inside a string", () => {
  assert.equal(refInsertion('{ "a": ', 7, "nodes.s.output"), '"{{ nodes.s.output }}"');
  assert.equal(refInsertion('{ "a": "id ', 11, "vars.k"), "{{ vars.k }}");
});

test("bareRefBinding: one rooted marker is a binding; anything else is not", () => {
  assert.equal(bareRefBinding(" {{ nodes.s.meta.app }} "), "{{ nodes.s.meta.app }}");
  assert.equal(bareRefBinding("{{vars.k}}"), "{{ vars.k }}");
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

test("addRefToDraft: adds to the draft, never replaces it", () => {
  const ml = '{\n  "companyId": "c1"\n}';
  // Caret not in a value/property slot (e.g. never placed): a new property at the end.
  assert.equal(
    addRefToDraft(ml, ml.length, "nodes.ev.output").text,
    '{\n  "companyId": "c1",\n  "ev": "{{ nodes.ev.output }}"\n}',
  );
  assert.equal(addRefToDraft("{}", 2, "var.region").text, '{ "region": "{{ var.region }}" }');
  // A taken key gets a suffix.
  assert.equal(
    addRefToDraft('{ "ev": 1 }', 11, "nodes.ev.output").text,
    '{ "ev": 1, "ev_2": "{{ nodes.ev.output }}" }',
  );
  // Caret where a value goes / inside a string / where a property goes.
  assert.equal(addRefToDraft('{ "a": }', 7, "var.x").text, '{ "a": "{{ var.x }}"}');
  assert.equal(addRefToDraft('{ "a": "id " }', 11, "var.x").text, '{ "a": "id {{ var.x }}" }');
  assert.equal(
    addRefToDraft('{ "a": 1, }', 9, "const.account_id").text,
    '{ "a": 1, "account_id": "{{ const.account_id }}" }',
  );
  // An array gets a new element.
  assert.equal(addRefToDraft("[1, 2]", 6, "var.x").text, '[1, 2, "{{ var.x }}" ]');
});

test("keyForRef: the last meaningful segment", () => {
  assert.equal(keyForRef("var.region"), "region");
  assert.equal(keyForRef("nodes.get_event.output"), "get_event");
  assert.equal(keyForRef("nodes.get_event.output.id"), "id");
  assert.equal(keyForRef("nodes.get_event.meta"), "get_event_meta");
});
