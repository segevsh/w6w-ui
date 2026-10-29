// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/components/__tests__/result-format.test.ts
//
// Every row of the format table (T0.1.1 / A4). Pure functions, no DOM: this
// tier pins the ANSWER of `detectResultFormat` — the one decision the whole
// `ResultViewer` is built on — so a body that sniffs differently from the
// documented table fails here rather than in a rendered pane.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RESULT_RENDER_MAX_CHARS,
  detectResultFormat,
  resultCopyText,
} from "../result-format.ts";

const formatOf = (value: unknown) => detectResultFormat(value).format;

test("values that are already parsed JSON are json", () => {
  for (const value of [{ a: 1 }, [1, 2], 42, null, true]) {
    assert.equal(formatOf(value), "json", `${JSON.stringify(value) ?? "undefined"} must be json`);
  }
});

test("undefined is empty text, not a json `null`", () => {
  const d = detectResultFormat(undefined);
  assert.equal(d.format, "text");
  assert.equal(d.format === "text" ? d.text : null, "");
});

test("a JSON document inside a string is parsed and shown as json", () => {
  const obj = detectResultFormat(' {"a":{"b":2}} ');
  assert.equal(obj.format, "json");
  assert.deepEqual(obj.format === "json" ? obj.data : null, { a: { b: 2 } });

  const arr = detectResultFormat("[1,2]");
  assert.equal(arr.format, "json");
  assert.deepEqual(arr.format === "json" ? arr.data : null, [1, 2]);
});

test("strings that only look structural stay text", () => {
  const rows = [
    "{not json",
    "123",
    '"quoted"',
    "plain sentence",
    "#hashtag",
    "- only one",
    "a < b > c",
  ];
  for (const row of rows) assert.equal(formatOf(row), "text", JSON.stringify(row));
});

test("doctype and <html> roots are html", () => {
  assert.equal(formatOf("<!DOCTYPE html><html><body>x</body></html>"), "html");
  assert.equal(formatOf("<html lang=en><body/></html>"), "html");
});

test("every other angle-bracketed document is xml", () => {
  const rows = ['<?xml version="1.0"?><a/>', "<a><b>1</b></a>", "<div>frag</div>"];
  for (const row of rows) assert.equal(formatOf(row), "xml", row);
});

test("headings, fences, two list items and links are markdown", () => {
  const rows = ["# Title\nbody", "```\ncode\n```", "- a\n- b", "1. a\n2. b", "see [docs](https://w6w.io)"];
  for (const row of rows) assert.equal(formatOf(row), "markdown", JSON.stringify(row));
});

test("resultCopyText pretty-prints json and passes every other format through", () => {
  assert.equal(resultCopyText(detectResultFormat({ a: 1 })), '{\n  "a": 1\n}');
  const md = "# Title\nbody";
  assert.equal(resultCopyText(detectResultFormat(md)), md);
});

test("RESULT_RENDER_MAX_CHARS is the documented 256 KiB", () => {
  assert.equal(RESULT_RENDER_MAX_CHARS, 262144);
});
