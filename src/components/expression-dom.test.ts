// Run: node --test src/components/expression-dom.test.ts  (Node 24, type-stripped)
//
// `readParts` reads only `childNodes`, `nodeType`, `tagName`, `getAttribute`
// and `textContent`, so plain-object node stubs are enough — `ui` carries no
// DOM test harness and this file deliberately adds no dependency. The one
// browser global it touches is `Node`, shimmed below.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureFillerBreak, insertNodeAtCaret, paintParts, readParts } from "./expression-dom.ts";

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
 * `paintParts`, `insertNodeAtCaret`), which need more than the read-only stubs
 * above: `lastChild`, `appendChild`, `insertBefore`, `focus`, a settable
 * `textContent`, and `ownerDocument.{createElement,createTextNode,getSelection}`.
 *
 * No caret is installed, so `getSelection()` returns null and the caret's block
 * resolves to the host itself — which is exactly the shape the paint path, a
 * top-level Enter, and `insertNodeAtCaret`'s NO-CARET fallback have (the
 * left-pane click that inserts a chip into an editor never focused). Targeting
 * an INNER block needs a real Selection, so that half is covered in the browser
 * instead (`T3.1.2-browser-check.sh` §J).
 *
 * `attrs` is what the host ADVERTISES about itself — `aria-multiline` in
 * particular, which is how a single-line editing host tells the paint path it
 * has no second line to render into.
 */
function host(children: StubNode[] = [], attrs: Record<string, string> = {}) {
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
    getAttribute: (name: string) => attrs[name] ?? null,
    contains: () => false,
    focus() {},
    appendChild(n: StubNode) {
      children.push(n);
      return n;
    },
    insertBefore(n: StubNode, ref: StubNode | null) {
      const i = ref ? children.indexOf(ref) : -1;
      if (i < 0) children.push(n);
      else children.splice(i, 0, n);
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

// --- T3.1.3: three gaps the T3.1.2 evaluation proved the suite above cannot
// see. Each case below is written against the mutant that escaped it, and each
// mutant was watched going red on this file before the case was kept.

test("paintParts adds NO filler for an INTERIOR newline — the test ENDS, not CONTAINS", () => {
  // R2-3. The case above uses "ab", which contains no newline at all, so it
  // cannot tell `endsWith("\n")` from `includes("\n")` — the evaluator ran that
  // mutant green through 20 unit cases and 44 browser assertions. What escapes
  // is a phantom blank line at the END of every reopened multi-line value: the
  // filler is still the block's last child, so the VALUE stays right and only
  // the rendering grows. This fixture is the discriminating one: a newline that
  // is present but not last.
  const h = host();
  paintParts(h, [{ kind: "text", value: "a\nb" }]);
  assert.equal(h.childNodes.length, 1);
  assert.equal(tagOf(h.childNodes[0]), null);
  assert.deepEqual(readParts(h), [{ kind: "text", value: "a\nb" }]);
});

test("paintParts adds NO filler in a SINGLE-LINE host, however the value ends", () => {
  // R2-2, the live defect. A `string` param's field advertises
  // `aria-multiline="false"` and swallows Enter — but a PASTE can still leave
  // its value ending in "\n", and the filler then gives that unreachable break
  // a second line box: the field renders at two lines' height (52px vs 28px,
  // measured in Chromium — `T3.1.3-browser-check.sh` §R).
  const h = host([], { "aria-multiline": "false" });
  paintParts(h, [{ kind: "text", value: "x\n" }]);
  assert.equal(h.childNodes.length, 1);
  assert.equal(tagOf(h.childNodes[0]), null);
  // …and the value is untouched either way — this is a PAINT decision only.
  assert.deepEqual(readParts(h), [{ kind: "text", value: "x\n" }]);
});

test("paintParts still fills an explicitly MULTILINE host", () => {
  // The other side of the same predicate: `aria-multiline="true"` must keep the
  // filler. Without this, "never fill" passes the case above.
  const h = host([], { "aria-multiline": "true" });
  paintParts(h, [{ kind: "text", value: "x\n" }]);
  assert.equal(h.childNodes.length, 2);
  assert.equal(tagOf(h.childNodes[1]), "BR");
  assert.deepEqual(readParts(h), [{ kind: "text", value: "x\n" }]);
});

test("insertNodeAtCaret with NO caret appends AFTER the existing content", () => {
  // R2-4, the highest-value gap: the no-caret fallback's guard is
  // `isFillerBreak(lastChild)` — a <br>, specifically. Relaxed to "is any
  // element" (`nodeType === 1`) it survived 20 unit cases and 44 browser
  // assertions, and it escapes into VALUE CORRUPTION: a chip-terminated value
  // takes the next chip in FRONT of the one already there. So the assertion is
  // on ORDER, not on the count — two chips are present under the mutant too.
  const h = host([varChip("vars.b")]);
  insertNodeAtCaret(h, varChip("vars.a") as unknown as Node);
  assert.deepEqual(readParts(h), [
    { kind: "var", ref: "vars.b" },
    { kind: "var", ref: "vars.a" }, // the one just inserted is LAST
  ]);
});

test("insertNodeAtCaret with NO caret inserts BEFORE a trailing filler <br>", () => {
  // The direction T3.1.2 did pin, in the browser only (§K1/K2). Appending past
  // the filler stops it being the block's last child, so `readParts` reads it as
  // a real newline: "a\n" + a chip would save "a\n\n{{ vars.a }}".
  const h = host([text("a\n"), el("br", {}, [])]);
  insertNodeAtCaret(h, varChip("vars.a") as unknown as Node);
  assert.deepEqual(readParts(h), [
    { kind: "text", value: "a\n" },
    { kind: "var", ref: "vars.a" },
  ]);
});
