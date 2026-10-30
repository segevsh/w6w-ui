// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.poll-minutes.test.ts  (Node 24)
//
// `clampMinutes` (the poll-interval clamp helper). The "Check every N minutes"
// form that used to exercise it was removed with the Triggers-tab rework
// (26-10-30-03 T2.1.1; poll-interval authoring is a FOLLOWUP).
import assert from "node:assert/strict";
import { test } from "node:test";

test("clampMinutes: blank / non-numeric / below-min yield min; else an integer", async () => {
  const { clampMinutes } = await import("../StepBuilderModal.tsx");
  assert.equal(clampMinutes("", 5), 5);
  assert.equal(clampMinutes("   ", 5), 5);
  assert.equal(clampMinutes("abc", 5), 5);
  assert.equal(clampMinutes("2", 5), 5);
  assert.equal(clampMinutes("12", 5), 12);
  assert.equal(clampMinutes("7.6", 5), 8, "fractions round to nearest");
  assert.equal(clampMinutes("5.2", 5), 5);
  assert.equal(clampMinutes("-3", 5), 5);
});
