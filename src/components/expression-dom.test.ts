// Run: node --test src/components/expression-dom.test.ts  (Node 24, type-stripped)
//
// `readParts` reads only `childNodes`, `nodeType`, `tagName`, `getAttribute`
// and `textContent`, so plain-object node stubs are enough — `ui` carries no
// DOM test harness and this file deliberately adds no dependency. The one
// browser global it touches is `Node`, shimmed below.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readParts } from "./expression-dom.ts";

(globalThis as unknown as { Node: unknown }).Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };

interface StubNode {
  nodeType: number;
  textContent: string | null;
  childNodes: StubNode[];
  tagName?: string;
  getAttribute?(name: string): string | null;
}

const text = (value: string): StubNode => ({ nodeType: 3, textContent: value, childNodes: [] });

/** `tagName` is UPPERCASE, as a browser reports it for an HTML document. */
function el(tagName: string, attrs: Record<string, string>, children: StubNode[]): StubNode {
  return {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    childNodes: children,
    // Realistic: the concatenated descendant text, so a test can never pass
    // just because a flattening implementation read an empty string.
    get textContent() {
      return children.map((c) => c.textContent ?? "").join("");
    },
    getAttribute: (name: string) => attrs[name] ?? null,
  };
}

/** Mirrors `makeChip`: sigil + label + `×`, with the ref only in `data-ref`. */
const varChip = (ref: string) =>
  el("span", { "data-kind": "var", "data-ref": ref }, [
    text("◆"),
    text(ref.startsWith("vars.") ? ref.slice("vars.".length) : ref),
    text("×"),
  ]);

const secretChip = (ref: string) =>
  el("span", { "data-kind": "secret", "data-ref": ref }, [text("🔒"), text(ref), text("×")]);

const exprChip = (raw: string) =>
  el("span", { "data-kind": "expr", "data-expr": raw }, [text("ƒ"), text(raw), text("×")]);

const root = (children: StubNode[]) => children as unknown as HTMLElement["childNodes"];

const read = (children: StubNode[]) =>
  readParts({ childNodes: root(children) } as unknown as HTMLElement);

test("flat regression — text · chip · text stays three parts, in order", () => {
  const parts = read([text("a"), varChip("vars.x"), text("b")]);
  assert.equal(parts.length, 3);
  assert.deepEqual(parts[0], { kind: "text", value: "a" });
  assert.equal(parts[1].kind, "var");
  assert.equal(parts[1].ref, "vars.x");
  assert.deepEqual(parts[2], { kind: "text", value: "b" });
});

test("THE DISCRIMINATING CASE — a chip inside a line-break div survives", () => {
  // What a native Enter builds: the second line is wrapped in a <div>, and the
  // chip the author had already inserted now lives inside it.
  const parts = read([text("a"), el("div", {}, [varChip("vars.x"), text("b")])]);
  // Asserted FIRST and on the REF, because that is the data loss: a flattening
  // reader keeps the chip's label text and drops `data-ref` altogether.
  assert.deepEqual(
    parts.filter((p) => p.kind === "var").map((p) => p.ref),
    ["vars.x"],
  );
  assert.equal(parts.length, 3);
  assert.deepEqual(parts[0], { kind: "text", value: "a\n" });
  assert.equal(parts[1].kind, "var");
  assert.equal(parts[1].ref, "vars.x"); // the REF, not merely the count
  assert.deepEqual(parts[2], { kind: "text", value: "b" });
});

test("<br> becomes a newline and coalesces into one text part", () => {
  const parts = read([text("a"), el("br", {}, []), text("b")]);
  assert.deepEqual(parts, [{ kind: "text", value: "a\nb" }]);
});

test("a leading block does not produce a leading newline", () => {
  const parts = read([el("div", {}, [text("a")]), el("div", {}, [text("b")])]);
  assert.deepEqual(parts, [{ kind: "text", value: "a\nb" }]);
});

test("an unrecognised inline element recurses rather than flattens", () => {
  const parts = read([el("span", {}, [text("a")])]);
  assert.deepEqual(parts, [{ kind: "text", value: "a" }]);
});

test("chips keep their identity however deeply nested", () => {
  const parts = read([
    el("div", {}, [el("p", {}, [el("span", {}, [secretChip("API_KEY")])])]),
    exprChip('{"var":"vars.n"}'),
    exprChip("a + b"),
  ]);
  assert.deepEqual(parts, [
    { kind: "secret", ref: "API_KEY" },
    { kind: "expr", expr: { var: "vars.n" } },
    { kind: "expr", expr: "a + b" }, // raw fallback when the JSON does not parse
  ]);
});

test("<br> inside a nested block still breaks the line", () => {
  const parts = read([text("a"), el("div", {}, [text("b"), el("br", {}, []), text("c")])]);
  assert.deepEqual(parts, [{ kind: "text", value: "a\nb\nc" }]);
});

test("tag matching is case-insensitive in both directions", () => {
  // `el` reports UPPERCASE like an HTML document; XML/XHTML reports lowercase.
  const lower = (tagName: string, children: StubNode[]): StubNode => ({
    ...el(tagName, {}, children),
    tagName,
  });
  assert.deepEqual(read([text("a"), el("DIV", {}, [text("b")])]), [
    { kind: "text", value: "a\nb" },
  ]);
  assert.deepEqual(read([text("a"), lower("div", [text("b")])]), [{ kind: "text", value: "a\nb" }]);
  assert.deepEqual(read([text("a"), lower("br", []), text("b")]), [
    { kind: "text", value: "a\nb" },
  ]);
});
