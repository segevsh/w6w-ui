// Run: node --experimental-strip-types --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/resolve-params.state.test.ts
// `state`, `var` and `vars` are ONE tree in the ƒx preview (R2/R2'/R15).
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderResult, stateAliasSpellings } from "../components/expression-template.ts";
import { buildResolveScope, resolveParamValue } from "../resolve-params.ts";
import { resolveParamJson } from "../resolved-json.ts";

const one = (tpl: string, sv: Record<string, unknown>) => {
  const segs = resolveParamValue(tpl, buildResolveScope(sv, undefined));
  assert.equal(segs.length, 1, tpl);
  return segs[0];
};

test("A1 — all three spellings resolve a state.* sample, ref kept as written", () => {
  for (const root of ["state", "vars", "var"]) {
    assert.deepEqual(one(`{{ ${root}.order.id }}`, { "state.order.id": "o-1" }), {
      status: "resolved",
      ref: `${root}.order.id`,
      value: "o-1",
    });
  }
});

test("A1 — a var.* sample is read by {{ state.x }}", () => {
  assert.deepEqual(one("{{ state.order.id }}", { "var.order.id": "o-2" }), {
    status: "resolved",
    ref: "state.order.id",
    value: "o-2",
  });
});

test("A1 — nested walk into a state.* object value, all three spellings", () => {
  for (const root of ["state", "vars", "var"]) {
    const r = one(`{{ ${root}.order.id }}`, { "state.order": { id: "o-3" } });
    assert.deepEqual(r, { status: "resolved", ref: `${root}.order.id`, value: "o-3" });
  }
});

test("A1 — unknown state key is unresolved; { $ } form resolves like the template", () => {
  assert.deepEqual(one("{{ state.nope }}", { "state.order.id": "x" }), {
    status: "unresolved",
    ref: "state.nope",
  });
  const sv = { "state.order.id": "o-1" };
  assert.equal(resolveParamJson({ $: "state.order.id" }, buildResolveScope(sv, undefined)), "o-1");
  assert.equal(resolveParamJson("{{ state.order.id }}", buildResolveScope(sv, undefined)), "o-1");
});

test("A1 — scope.state is the identical object as scope.vars", () => {
  const scope = buildResolveScope({ "state.a": 1, "var.b": 2, "vars.c": 3 }, undefined);
  assert.ok(scope.state === scope.vars);
  assert.deepEqual(scope.vars, { a: 1, b: 2, c: 3 });
});

test("A2 — exact spelling first, then state > var > vars", () => {
  const sv = { "state.region": "S", "var.region": "V" };
  const v = (t: string) => (one(t, sv) as { value?: unknown }).value;
  assert.equal(v("{{ state.region }}"), "S");
  assert.equal(v("{{ var.region }}"), "V");
  assert.equal(v("{{ vars.region }}"), "S");
});

test("A2 — nested collision is decided by spelling rank, not entry order", () => {
  const a = { "var.cfg": { a: 1 }, "state.cfg": { a: 2 } };
  const b = { "state.cfg": { a: 2 }, "var.cfg": { a: 1 } };
  for (const sv of [a, b]) {
    assert.equal((one("{{ vars.cfg.a }}", sv) as { value?: unknown }).value, 2);
  }
  const c = { "vars.k": { a: 0 }, "var.k": { a: 1 } };
  const d = { "var.k": { a: 1 }, "vars.k": { a: 0 } };
  for (const sv of [c, d]) {
    assert.equal(buildResolveScope(sv, undefined).vars.k !== undefined, true);
    assert.deepEqual(buildResolveScope(sv, undefined).vars.k, { a: 1 });
  }
});

test("A3 — renderResult reads the other spellings; exact key wins; other roots unaliased", () => {
  const part = (ref: string) => [{ kind: "var" as const, ref }];
  assert.equal(renderResult(part("vars.order.id"), { "state.order.id": "o-1" }), "o-1");
  assert.equal(renderResult(part("var.order.id"), { "state.order.id": "o-1" }), "o-1");
  assert.equal(renderResult(part("state.order.id"), { "vars.order.id": "o-4" }), "o-4");
  assert.equal(renderResult(part("var.x"), { "var.x": "typed", "state.x": "seed" }), "typed");
  assert.equal(renderResult(part("nodes.a.output"), { "steps.a.output": "z" }), "");
});

test("alias rule: exact first, deduplicated; non-state roots get only themselves", () => {
  assert.deepEqual(stateAliasSpellings("vars.a.b"), ["vars.a.b", "state.a.b", "var.a.b"]);
  assert.deepEqual(stateAliasSpellings("state"), ["state", "var", "vars"]);
  assert.deepEqual(stateAliasSpellings("steps.a"), ["steps.a"]);
  assert.deepEqual(stateAliasSpellings("stateful.x"), ["stateful.x"]);
});
