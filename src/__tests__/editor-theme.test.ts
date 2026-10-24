// Run (from packages/ui): node --experimental-strip-types --import ./src/test-jsx-loader.mjs --test src/__tests__/editor-theme.test.ts
//
// The three CodeMirror editors share ONE theme spec (`src/editor-theme.ts`).
// These assertions pin the presentational contract so a future edit cannot
// silently restore the 2px focus ring, un-round the gutter/active-line corners,
// or clobber the `padding-right` `_fx.scss` owns on `.cm-content`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { EDITOR_THEME_SPEC } from "../editor-theme.ts";

const focused = EDITOR_THEME_SPEC["&.cm-focused"];
const scroller = EDITOR_THEME_SPEC[".cm-scroller"];
const content = EDITOR_THEME_SPEC[".cm-content"];
const line = EDITOR_THEME_SPEC[".cm-line"];
const root = EDITOR_THEME_SPEC["&"];

test("focus uses an accent border, not an outline ring", () => {
  assert.equal(focused.outline, "none");
  assert.equal(focused.borderColor, "var(--w6w-accent)");
});

test("scroller keeps auto overflow and clips to the rounded border", () => {
  assert.equal(scroller.overflow, "auto");
  assert.equal(scroller.borderRadius, "7px");
});

test("content gets vertical padding only (horizontal belongs to _fx.scss)", () => {
  assert.equal(content.paddingTop, "var(--w6w-sp-2)");
  assert.equal(content.paddingBottom, "var(--w6w-sp-2)");
  assert.equal("padding" in content, false);
  assert.equal("paddingRight" in content, false);
});

test("lines are inset by one spacing step", () => {
  assert.equal(line.paddingLeft, "var(--w6w-sp-2)");
});

test("the 8px root radius survives", () => {
  assert.equal(root.borderRadius, "8px");
});

test("no spec value re-introduces the 2px solid ring", () => {
  for (const [selector, rules] of Object.entries(EDITOR_THEME_SPEC)) {
    for (const [property, value] of Object.entries(rules)) {
      assert.equal(
        value.includes("2px solid"),
        false,
        `${selector} { ${property}: ${value} } still paints a 2px solid ring`,
      );
      assert.notEqual(value, "", `${selector} { ${property} } is empty`);
    }
  }
});
