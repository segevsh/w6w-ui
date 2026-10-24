// Run: node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/note-markdown.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { editableToMarkdown, noteDisplayMarkdown, renderEditable } from "../note-markdown.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const doc = dom.window.document;
const box = () => doc.createElement("div");

const roundTrip = (md: string) => {
  const el = box();
  renderEditable(el, md);
  return editableToMarkdown(el);
};

test("round-trips headings, bold, blank lines and untouched markdown byte-for-byte", () => {
  for (const md of [
    "# Title\nbody with **bold** and [a link](https://x.io)",
    "## Heading\n\n- item one\n- item **two**\n\nend",
    "### Sub\n`code` and *italic*",
    "plain",
    "",
  ]) {
    assert.equal(roundTrip(md), md);
  }
});

test("renders headings as h1-h3 and bold as <strong>, through text nodes only", () => {
  const el = box();
  renderEditable(el, "# T\n<img src=x onerror=alert(1)> **b**");
  assert.equal(el.children[0].tagName, "H1");
  assert.equal(el.children[1].querySelector("img"), null, "markup stays text");
  assert.equal(el.children[1].querySelector("strong")?.textContent, "b");
});

test("serializes what the browser's own editing commands produce", () => {
  const el = box();
  // formatBlock → <h2>; bold → <b>; Enter → a new <div>; an empty line → <div><br></div>;
  // un-bolding inside a heading → a font-weight:normal span.
  const h2 = doc.createElement("h2");
  h2.append("Big ");
  const unbold = doc.createElement("span");
  unbold.style.fontWeight = "normal";
  unbold.append("plain");
  h2.append(unbold);
  const line = doc.createElement("div");
  line.append("make ");
  const b = doc.createElement("b");
  b.append("this ");
  line.append(b, "bold");
  const empty = doc.createElement("div");
  empty.append(doc.createElement("br"));
  const last = doc.createElement("div");
  last.append("end");
  el.append("first", h2, line, empty, last);
  assert.equal(editableToMarkdown(el), "first\n## Big plain\nmake **this** bold\n\nend");
});

test("splits on <br> and drops trailing blank lines", () => {
  const el = box();
  const d = doc.createElement("div");
  d.append("a", doc.createElement("br"), "b", doc.createElement("br"));
  const blank = doc.createElement("div");
  blank.append(doc.createElement("br"));
  el.append(d, blank);
  assert.equal(editableToMarkdown(el), "a\nb");
});

test("display content turns single newlines into hard breaks and leaves paragraphs alone", () => {
  assert.equal(noteDisplayMarkdown("a\nb\n\nc"), "a  \nb\n\nc");
});
