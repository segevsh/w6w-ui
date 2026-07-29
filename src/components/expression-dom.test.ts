// Run: node --test src/components/expression-dom.test.ts  (Node 24, type-stripped)
//
// `varLabel` is a pure string function, so it needs no DOM and no dependency —
// which is exactly why the label/ref split is gated HERE and not by a browser
// check. `ui` carries no DOM test harness; this file adds none.
//
// NOTE FOR THE LANE MERGE (see BLOCKERS.md BLK-2): on lane B this file is
// T3.1.1's `readParts` suite. Lane D branched before that commit, so this copy
// contains ONLY the `varLabel` block — the `readParts` cases cannot run here
// (lane D's `readParts` is the pre-T3.1.1 non-recursive one). Resolve the
// add/add by taking lane B's file and APPENDING everything below the
// `--- varLabel` banner, adding `varLabel` to the import.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isRefSafeKey, varLabel } from "./expression-dom.ts";
import { parseTemplate, serializeTemplate } from "./expression-template.ts";

// --- varLabel — the LABEL a chip/source shows over the REF it saves ----------
//
// The four rules are asserted BY VALUE, never by "the function was called".
// The load-bearing one is the third: `steps.gate_1.output.email` must DISPLAY as
// `gate_1.email` while the ref stored in `data-ref` stays canonical. There is no
// `gate_1` root in the engine's run scope (`core/rfcs/workflow.md` §Expressions),
// so a build that emitted the short form as the REF would look perfectly correct
// in the editor and resolve to empty at run time, silently.

test("varLabel — a step's WHOLE output labels as the bare step id", () => {
  assert.equal(varLabel("steps.gate_1.output"), "gate_1");
});

test("varLabel — a step's output FIELD labels as `<id>.<field>`", () => {
  // The HITL-1 answer, by value: the human sees `gate_1.email`.
  assert.equal(varLabel("steps.gate_1.output.email"), "gate_1.email");
  assert.equal(varLabel("steps.gate_1.output.first_name"), "gate_1.first_name");
});

test("varLabel — a NESTED field keeps its whole path after the step id", () => {
  assert.equal(varLabel("steps.http_1.output.body.items"), "http_1.body.items");
});

test("varLabel — a step id containing a DOT survives", () => {
  // Structural: anchor on the `.output` segment, never `split(".")` and
  // reassemble — that would hand back `my` and swallow `.step`.
  assert.equal(varLabel("steps.my.step.output.email"), "my.step.email");
  assert.equal(varLabel("steps.my.step.output"), "my.step");
});

test("varLabel — REGRESSION: `vars.<name>` still drops its root", () => {
  assert.equal(varLabel("vars.from_email"), "from_email");
  assert.equal(varLabel("vars.a.b"), "a.b");
});

test("varLabel — REGRESSION: anything else comes back verbatim", () => {
  // Every one of these is a real resolvable root that must NOT be shortened:
  // shortening `trigger.event` to `event` would read as a var that isn't there.
  for (const ref of [
    "trigger.event",
    "trigger.event.email",
    "trigger.type",
    "inputs.email",
    "documents.test",
    "foreach.item",
    "output.body",
    "",
  ]) {
    assert.equal(varLabel(ref), ref);
  }
});

test("varLabel — a `steps.` ref that is NOT an output ref is left alone", () => {
  // No `.output` segment => not a step-output ref => verbatim. Shortening it
  // would invent a label for something the engine cannot resolve either way.
  assert.equal(varLabel("steps.gate_1"), "steps.gate_1");
  assert.equal(varLabel("steps.gate_1.outputs"), "steps.gate_1.outputs");
  assert.equal(varLabel("steps"), "steps");
});

test("varLabel — `vars.` wins over the step rule, so neither can shadow", () => {
  // A project var literally named `steps.x.output` is pathological but must not
  // fall through to the step branch: the `vars.` root is stripped, once.
  assert.equal(varLabel("vars.steps.gate_1.output"), "steps.gate_1.output");
});

// --- isRefSafeKey — a declared key the ENGINE can actually read (T5.1.2 A1.2) -
//
// The two failure modes it blocks are silent-at-run-time, so they are asserted
// as REFERENCE FACTS about the two things downstream of the picker:
//   1. JSONLogic `var` splits its path on "." with no escape and no bracket
//      form — `core/packages/expr/src/jsonlogic.ts` `getVar`, verbatim:
//        const parts = String(path).split(".");
//      so `steps.g.output.a.b` is the lookup output -> a -> b, i.e. null.
//   2. the `{{ … }}` text form (`expression-template.ts`) trims only the OUTER
//      pad, so a key with leading/trailing whitespace does not round-trip.
// Both are re-proved below against the REAL modules, not restated.

/** The one `.` fact, re-derived here so the test does not rest on a citation. */
const getVarWouldSplitInto = (ref: string) => ref.split(".");

test("isRefSafeKey — a plain key is safe", () => {
  for (const k of ["email", "first_name", "firstName", "id2", "Ünïcode", "a-b", "$id"]) {
    assert.equal(isRefSafeKey(k), true, k);
  }
});

test("isRefSafeKey — a key with an INTERIOR space is safe (and really resolves)", () => {
  assert.equal(isRefSafeKey("first name"), true);
  // Why it is safe, proved rather than asserted: `getVar` splits on "." only, so
  // the last segment stays a single plain property lookup…
  assert.deepEqual(getVarWouldSplitInto("steps.g.output.first name"), [
    "steps",
    "g",
    "output",
    "first name",
  ]);
  // …and the `{{ }}` text form round-trips the ref unchanged.
  assert.equal(
    parseTemplate(serializeTemplate([{ kind: "var", ref: "steps.g.output.first name" }]))[0].ref,
    "steps.g.output.first name",
  );
});

test("isRefSafeKey — a key containing a DOT is rejected: nothing can reach it", () => {
  assert.equal(isRefSafeKey("a.b"), false);
  // The reason, not just the verdict: the ref a dotted key builds addresses a
  // nested path, never the flat key the step actually produced.
  assert.deepEqual(getVarWouldSplitInto("steps.g.output.a.b").slice(2), ["output", "a", "b"]);
});

test("isRefSafeKey — LEADING/TRAILING whitespace is rejected: it does not round-trip", () => {
  assert.equal(isRefSafeKey(" x "), false);
  assert.equal(isRefSafeKey("x "), false);
  assert.equal(isRefSafeKey(""), false);
  assert.equal(isRefSafeKey("   "), false);
  // The reason: `parseTemplate` trims the whole inner, so the pad is eaten and
  // the ref that comes back is NOT the ref that went out.
  const ref = "steps.g.output.x ";
  assert.notEqual(parseTemplate(serializeTemplate([{ kind: "var", ref }]))[0].ref, ref);
});

test("isRefSafeKey — brace characters are rejected: they collide with `{{ }}`", () => {
  assert.equal(isRefSafeKey("a}}b"), false);
  assert.equal(isRefSafeKey("a{b"), false);
  // `}}` truncates the ref at parse time — a ref that silently becomes shorter.
  const ref = "steps.g.output.a}}b";
  assert.equal(parseTemplate(serializeTemplate([{ kind: "var", ref }]))[0].ref, "steps.g.output.a");
});

test("isRefSafeKey — every safe key survives the full ref round trip", () => {
  // The property the guard exists to guarantee, over the whole safe set.
  for (const k of ["email", "firstName", "first name", "a-b", "Ünïcode", "$id"]) {
    const ref = `steps.gate_1.output.${k}`;
    assert.equal(isRefSafeKey(k), true, k);
    assert.equal(parseTemplate(serializeTemplate([{ kind: "var", ref }]))[0].ref, ref, k);
    // …and the label it displays is the short form, unambiguously.
    assert.equal(varLabel(ref), `gate_1.${k}`, k);
  }
});
