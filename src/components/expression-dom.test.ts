// Run: node --test src/components/expression-dom.test.ts  (Node 24, type-stripped)
//
// `readParts` reads only `childNodes`, `nodeType`, `tagName`, `getAttribute`
// and `textContent`, so plain-object node stubs are enough — `ui` carries no
// DOM test harness and this file deliberately adds no dependency. The one
// browser global it touches is `Node`, shimmed below.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureFillerBreak, paintParts, readParts } from "./expression-dom.ts";

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

/**
 * A minimal editing HOST for the DOM-*writing* helpers (`ensureFillerBreak`,
 * `paintParts`), which need more than the read-only stubs above: `lastChild`,
 * `appendChild`, a settable `textContent`, and
 * `ownerDocument.{createElement,createTextNode,getSelection}`.
 *
 * No caret is installed, so `getSelection()` returns null and the caret's block
 * resolves to the host itself — which is exactly the shape the paint path and a
 * top-level Enter have. Targeting an INNER block needs a real Selection, so that
 * half is covered in the browser instead (`T3.1.2-browser-check.sh` §J).
 */
function host(children: StubNode[] = []) {
  const doc = {
    createElement: (tagName: string) => el(tagName, {}, []),
    createTextNode: (value: string) => text(value),
    getSelection: () => null,
  };
  const h = {
    nodeType: 1,
    tagName: "DIV",
    childNodes: children,
    ownerDocument: doc,
    getAttribute: () => null,
    contains: () => false,
    appendChild(n: StubNode) {
      children.push(n);
      return n;
    },
    get lastChild() {
      return children[children.length - 1] ?? null;
    },
    get textContent() {
      return children.map((c) => c.textContent ?? "").join("");
    },
    set textContent(v: string) {
      children.length = 0;
      if (v) children.push(text(v));
    },
  };
  return h as unknown as HTMLElement & { childNodes: StubNode[] };
}

const tagOf = (n: StubNode | null) => (n as StubNode | null)?.tagName ?? null;

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

// --- Chromium's FILLER <br> (found in the T3.1.1 browser check, fixed in T3.1.2
// once Enter became reachable). When a line ENDS with a contentEditable="false"
// chip, Chromium appends a <br> as the block's last child so the caret has
// somewhere to land. It is not a break the author made, and reading it as one
// grows the value by a blank line on every read → repaint cycle.

test("a filler <br> closing the ROOT after a chip is not a newline", () => {
  const parts = read([text("a"), varChip("vars.x"), el("br", {}, [])]);
  assert.deepEqual(parts, [
    { kind: "text", value: "a" },
    { kind: "var", ref: "vars.x" },
  ]);
});

test("a filler <br> closing a line <div> after a chip is not a newline", () => {
  // Exactly the markup browser-check D observed: `…<div><span chip/><br></div>`.
  const parts = read([
    text("a"),
    el("div", {}, [text("mid"), el("br", {}, [])]),
    el("div", {}, [secretChip("API_KEY"), el("br", {}, [])]),
  ]);
  assert.deepEqual(parts, [
    { kind: "text", value: "a\nmid\n" },
    { kind: "secret", ref: "API_KEY" },
  ]);
});

test("only the LAST <br> of a block is dropped — the ones before it still break", () => {
  // shift+Enter at the end of a line: Chromium writes `a<br><br>`, where only
  // the second is the filler. The line the author made must survive.
  const parts = read([text("a"), el("br", {}, []), el("br", {}, [])]);
  assert.deepEqual(parts, [{ kind: "text", value: "a\n" }]);
});

test("a <br> ending an INLINE element still breaks the line", () => {
  // The skip is scoped to BLOCK parents (root/div/p) — a trailing <br> inside a
  // <span> is not a caret filler, so T3.1.1's "a <br> contributes \n" holds.
  const parts = read([text("a"), el("span", {}, [el("br", {}, [])]), text("b")]);
  assert.deepEqual(parts, [{ kind: "text", value: "a\nb" }]);
});

test("a PASTED blank line is one break, not two", () => {
  // `<div><br></div>` is how every editor writes an empty line: the <br> is the
  // filler that gives the empty block a line box, and the block already carries
  // the break. Counting both inflates the value by a blank line per paste.
  const parts = read([
    text("one"),
    el("div", {}, [el("br", {}, [])]),
    el("div", {}, [text("three")]),
  ]);
  assert.deepEqual(parts, [{ kind: "text", value: "one\n\nthree" }]);
});

// --- Three cases that pin acceptance criteria the T3.1.1 suite stated but did
// not discriminate (mutants `divonly`, `guardlast`, `nonelem` survived it).

test("a <p> block breaks the line too, not just <div>", () => {
  // The only earlier <p> case nested it where `parts.length === 0`, so dropping
  // "p" from BLOCK_TAGS changed nothing observable.
  assert.deepEqual(read([text("a"), el("p", {}, [text("b")])]), [{ kind: "text", value: "a\nb" }]);
});

test("a block that follows a CHIP still contributes its newline", () => {
  // `parts.length > 0` must mean "anything at all was emitted" — narrowing it to
  // "a text part was emitted" would silently eat the break after a chip.
  assert.deepEqual(read([varChip("vars.x"), el("div", {}, [text("b")])]), [
    { kind: "var", ref: "vars.x" },
    { kind: "text", value: "\nb" },
  ]);
});

test("a comment node is skipped, not read and not thrown on", () => {
  // A real comment node has no `getAttribute`, so dropping the ELEMENT_NODE
  // guard throws on it rather than merely mis-reading it.
  const comment: StubNode = { nodeType: 8, textContent: "note", childNodes: [] };
  assert.deepEqual(read([text("a"), comment, text("b")]), [{ kind: "text", value: "ab" }]);
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

// --- `ensureFillerBreak` / the paint path (ROUND 2). `ensureFillerBreak` had
// ZERO coverage after round 1: two mutants of it survived all 16 cases above
// AND all 34 browser assertions, and both escape into a user-visible defect.

test("ensureFillerBreak is IDEMPOTENT — a second call adds nothing", () => {
  // Drop the guard and every fill appends another <br>. Only the last one is
  // skipped by `readParts`, so each extra becomes a REAL newline: double-Enter
  // saves "a\n\nb\n". The guard is correctness, not tidiness.
  const h = host([text("a\n")]);
  ensureFillerBreak(h);
  ensureFillerBreak(h);
  assert.equal(h.childNodes.length, 2);
  assert.equal(tagOf(h.childNodes[1]), "BR");
  assert.deepEqual(readParts(h), [{ kind: "text", value: "a\n" }]);
});

test("ensureFillerBreak still fills a block ending in a CHIP", () => {
  // The guard must test for a <br> specifically, NOT for "is an element". A
  // chip is an element too, and being `contentEditable="false"` it gives the
  // caret nowhere to land — so it needs the filler just as much as text does.
  const h = host([varChip("vars.x")]);
  ensureFillerBreak(h);
  assert.equal(h.childNodes.length, 2);
  assert.equal(tagOf(h.childNodes[1]), "BR");
});

test("paintParts fills a repainted value that ENDS in a newline", () => {
  // THE F1 REGRESSION. The filler used to be emitted on the keydown path only,
  // so a value repainted after save→reopen had none: the caret parked before
  // the trailing "\n" and the next keystroke landed on the previous line —
  // "a\n" + typing "b" saved "ab\n".
  const h = host();
  paintParts(h, [{ kind: "text", value: "a\n" }]);
  assert.equal(h.childNodes.length, 2);
  assert.equal(tagOf(h.childNodes[1]), "BR");
  // …and the filler must not leak back into the value on the next read.
  assert.deepEqual(readParts(h), [{ kind: "text", value: "a\n" }]);
});

test("paintParts adds NO filler when the value does not end in a newline", () => {
  const h = host();
  paintParts(h, [{ kind: "text", value: "ab" }]);
  assert.equal(h.childNodes.length, 1);
  assert.equal(tagOf(h.childNodes[0]), null); // a text node, not a <br>
  assert.deepEqual(readParts(h), [{ kind: "text", value: "ab" }]);
});
