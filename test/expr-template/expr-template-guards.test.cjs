// Browser gate for the chips/template toggle's two invariants no
// `node --test` can reach: real typed order (jsdom has no caret) and whether
// the render chip's sigil actually LAYS OUT distinct from a var chip's (a
// jsdom assertion on `textContent` can't tell "painted and visible" from
// "present in the DOM but never laid out"). Mounts the REAL
// `ExpressionEditorModal`, bundled from source by ./run.sh, into real
// Chromium via harness-entry.tsx — no jsdom, no `@w6w/ui` substitute.
const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const pw = require(process.env.PW_CORE_MOUNT || "/pw");
const ENGINE = process.env.ENGINE || "chromium";
const engine = pw[ENGINE];
if (!engine) throw new Error(`no such browser engine: ${ENGINE}`);

const HTML = (v) => `<!doctype html><html><head><meta charset="utf-8">
<title>expr-template</title>
<link rel="stylesheet" href="/ui.css">
</head><body><div id="root"></div>
<script>window.__V__=${JSON.stringify(v)};</script>
<script src="/bundle.js"></script></body></html>`;

async function open(browser, { v = "empty" } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.route("**/*", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/") return route.fulfill({ contentType: "text/html", body: HTML(v) });
    if (p === "/bundle.js")
      return route.fulfill({ contentType: "text/javascript", path: "/w/bundle.js" });
    if (p === "/ui.css") return route.fulfill({ contentType: "text/css", path: "/w/ui.css" });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(`http://expr-template.test/?v=${encodeURIComponent(v)}`);
  await page.waitForFunction(() => window.__mounted === true, null, { timeout: 10000 });
  await page.waitForTimeout(150);
  if (errs.length) throw new Error(`pageerror mounting v=${v}: ${errs.join("; ")}`);
  return page;
}

let browser;
before(async () => {
  browser = await engine.launch();
});
after(async () => {
  if (browser) await browser.close();
});

// ── G-typing — the highest-value real-browser guard: a `paintGen` bump from
//    `onInput` repaints the WHOLE contentEditable on every keystroke, which
//    resets the caret (jsdom has no caret model, so it cannot see this at
//    all). The observable symptom is REORDERED text, not merely wrong text —
//    each repaint puts the caret back at the start, so typing "abcdef" one
//    key at a time would land as "fedcba" (or some other reordering), never
//    simply "abcdef" with extra/missing characters. ─────────────────────────
test("G-typing — typed characters land in order in the real contentEditable (no caret clobber from an over-eager paintGen bump)", async () => {
  const page = await open(browser, { v: "empty" });
  await page.click(".w6w-exprmodal-chips");
  await page.keyboard.type("abcdef", { delay: 30 });
  await page.waitForTimeout(150);
  const text = await page.evaluate(
    () => document.querySelector(".w6w-exprmodal-chips")?.textContent ?? null,
  );
  assert.equal(text, "abcdef", `typed characters must land in order; got: ${JSON.stringify(text)}`);
  await page.close();
});

// ── G-sigil — the render chip must be visually distinguishable from a var
//    chip: a different, non-empty, ACTUALLY LAID OUT sigil. Guards against
//    a render part falling through to `makeChip`'s bare `else` (the `ƒ` expr
//    fallback), which would make it indistinguishable from an expr chip and
//    give the author no way to see what renders. ───────────────────────────
test("G-sigil — the render chip's sigil is visually distinct from a var chip's AND an expr chip's fallback, ref intact via data-ref, in real Chromium", async () => {
  const page = await open(browser, { v: "render" });
  const info = await page.evaluate(() => {
    const varEl = document.querySelector('.w6w-expr-chip[data-kind="var"]');
    const renderEl = document.querySelector('.w6w-expr-chip[data-kind="render"]');
    const sigilOf = (el) => el?.querySelector(".w6w-expr-chip-sigil")?.textContent ?? null;
    return {
      varSigil: sigilOf(varEl),
      renderSigil: sigilOf(renderEl),
      renderDataRef: renderEl ? renderEl.getAttribute("data-ref") : null,
      renderDataExpr: renderEl ? renderEl.getAttribute("data-expr") : null,
      varLaidOut: varEl ? varEl.getClientRects().length > 0 : false,
      renderLaidOut: renderEl ? renderEl.getClientRects().length > 0 : false,
    };
  });
  assert.ok(info.varSigil, `var chip sigil must be present, got: ${JSON.stringify(info)}`);
  assert.ok(info.renderSigil, `render chip sigil must be present, got: ${JSON.stringify(info)}`);
  assert.notEqual(
    info.varSigil,
    info.renderSigil,
    `the two chip sigils must differ, got: ${JSON.stringify(info)}`,
  );
  // The stronger, non-cosmetic pin: a render part that falls through to
  // `makeChip`'s bare `else` (the `ƒ` EXPR fallback) would ALSO differ from
  // the var chip's `◆` sigil — "differs from var" alone is not enough to
  // catch that mutant (`ƒ` != `◆` either way). What the fallback actually
  // corrupts is the ATTRIBUTE the ref lives in: the expr arm writes
  // `data-expr`, never `data-ref`, and its sigil is always the literal `ƒ` —
  // so pin against both directly.
  assert.notEqual(info.renderSigil, "ƒ", `render sigil must not be the expr-fallback glyph "ƒ"`);
  assert.equal(
    info.renderDataRef,
    "vars.b",
    `the render chip's ref must live in data-ref (the render/var construction path), got: ${JSON.stringify(info)}`,
  );
  assert.equal(
    info.renderDataExpr,
    null,
    `a render chip must never carry data-expr (that means it fell through to the expr fallback), got: ${JSON.stringify(info)}`,
  );
  assert.ok(info.varLaidOut, "var chip sigil must actually be laid out (visible)");
  assert.ok(info.renderLaidOut, "render chip sigil must actually be laid out (visible)");
  await page.close();
});

// ── Round 2 — F-2: the render-toggle control is opt-in, off by default. ────

test("R4 — [data-render-toggle] is present in the modal and ABSENT from the real inline ExpressionInput", async () => {
  const modalPage = await open(browser, { v: "render" });
  const modalCount = await modalPage.evaluate(
    () => document.querySelectorAll("[data-render-toggle]").length,
  );
  assert.ok(modalCount >= 1, `expected >=1 [data-render-toggle] nodes in the modal, got ${modalCount}`);
  await modalPage.close();

  const inlinePage = await open(browser, { v: "inline" });
  const inlineCount = await inlinePage.evaluate(
    () => document.querySelectorAll("[data-render-toggle]").length,
  );
  assert.equal(
    inlineCount,
    0,
    `expected 0 [data-render-toggle] nodes in the real inline ExpressionInput, got ${inlineCount}`,
  );
  await inlinePage.close();
});

// ── T1.2.3 — "+ Add" per rail section, the nested modal, and the stacked
//    pair. Every selector below picks a dialog by its `aria-label`, NEVER a
//    bare "dialog" — with two <dialog>s open, `document.querySelector
//    ("dialog")` silently returns the OUTER one and an assertion built on
//    that would pass while measuring nothing (no rig before this one has
//    ever had two dialogs open at once). ───────────────────────────────────

test("A4 — clicking + Add stacks a SECOND real <dialog> over the editor's own, distinguishable by aria-label", async () => {
  const page = await open(browser, { v: "addable" });
  await page.click('[data-testid="expr-add-var"]');
  await page.waitForSelector('dialog[aria-label="Add variable"][open]');
  const info = await page.evaluate(() => ({
    openCount: document.querySelectorAll("dialog[open]").length,
    editorOpen: !!document.querySelector('dialog[aria-label="Edit expression"][open]'),
    addOpen: !!document.querySelector('dialog[aria-label="Add variable"][open]'),
  }));
  assert.equal(info.openCount, 2, `expected exactly 2 open <dialog>s, got: ${JSON.stringify(info)}`);
  assert.ok(info.editorOpen, `the editor's own dialog must stay open, got: ${JSON.stringify(info)}`);
  assert.ok(info.addOpen, `the nested Add-variable dialog must be open, got: ${JSON.stringify(info)}`);
  await page.close();
});

test("A8 — Escape closes ONLY the nested dialog; the editor's own dialog stays open", async () => {
  const page = await open(browser, { v: "addable" });
  await page.click('[data-testid="expr-add-var"]');
  await page.waitForSelector('dialog[aria-label="Add variable"][open]');
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  const info = await page.evaluate(() => ({
    addOpen: !!document.querySelector('dialog[aria-label="Add variable"][open]'),
    editorOpen: !!document.querySelector('dialog[aria-label="Edit expression"][open]'),
  }));
  assert.equal(info.addOpen, false, `Escape must close the nested dialog, got: ${JSON.stringify(info)}`);
  assert.equal(
    info.editorOpen,
    true,
    `Escape on the nested dialog must NOT close the editor's own dialog, got: ${JSON.stringify(info)}`,
  );
  await page.close();
});

test("A8 — a click on the nested dialog's own backdrop closes ONLY the nested dialog", async () => {
  const page = await open(browser, { v: "addable" });
  await page.click('[data-testid="expr-add-secret"]');
  await page.waitForSelector('dialog[aria-label="Add secret"][open]');
  // The nested dialog is centered and well short of the viewport corner at
  // 1440x900 — a click there lands on the TOPMOST (nested) dialog's own
  // ::backdrop, never inside its box.
  await page.mouse.click(4, 4);
  await page.waitForTimeout(100);
  const info = await page.evaluate(() => ({
    addOpen: !!document.querySelector('dialog[aria-label="Add secret"][open]'),
    editorOpen: !!document.querySelector('dialog[aria-label="Edit expression"][open]'),
  }));
  assert.equal(
    info.addOpen,
    false,
    `a backdrop click must close the nested dialog, got: ${JSON.stringify(info)}`,
  );
  assert.equal(
    info.editorOpen,
    true,
    `a click on the NESTED backdrop must not bubble into closing the editor's own dialog, got: ${JSON.stringify(info)}`,
  );
  await page.close();
});

test("A7 + A9 — the caret returns to the chips editor after a successful create (next keystroke appends, no click needed), and no browser dialog was ever invoked", async () => {
  const page = await open(browser, { v: "addable" });
  await page.click(".w6w-exprmodal-chips");
  await page.keyboard.type("abc", { delay: 30 });
  await page.click('[data-testid="expr-add-var"]');
  await page.waitForSelector('dialog[aria-label="Add variable"][open]');
  await page.fill('[data-testid="expr-add-value-name"]', "brand_new_var");
  await page.fill('[data-testid="expr-add-value-value"]', "hello");
  await page.click('[data-testid="expr-add-value-save"]');
  await page.waitForSelector('dialog[aria-label="Add variable"]', { state: "detached" });
  await page.waitForTimeout(100);
  // No click — a bare `el.focus()` with no `placeCaretAtEnd` would land the
  // caret at the START and this would read "Xabc" instead.
  await page.keyboard.type("X", { delay: 30 });
  await page.waitForTimeout(100);
  const text = await page.evaluate(
    () => document.querySelector(".w6w-exprmodal-chips")?.textContent ?? null,
  );
  assert.equal(text, "abcX", `caret must be at the END after the round trip; got: ${JSON.stringify(text)}`);
  const dialogCalls = await page.evaluate(() => window.__dialogCalls ?? -1);
  assert.equal(dialogCalls, 0, "window.prompt/confirm/alert must never be reached by the + Add flow");
  await page.close();
});

test("A2 + A7 — the editor stays MOUNTED across the create flow: chips text byte-identical, rail gains the new name, + Add still rendered", async () => {
  const page = await open(browser, { v: "addable" });
  await page.click(".w6w-exprmodal-chips");
  await page.keyboard.type("abc", { delay: 30 });
  await page.waitForTimeout(100);
  const before = await page.evaluate(
    () => document.querySelector(".w6w-exprmodal-chips")?.textContent ?? null,
  );
  assert.equal(before, "abc");

  await page.click('[data-testid="expr-add-var"]');
  await page.waitForSelector('dialog[aria-label="Add variable"][open]');
  await page.fill('[data-testid="expr-add-value-name"]', "brand_new_var");
  await page.fill('[data-testid="expr-add-value-value"]', "hello");
  await page.click('[data-testid="expr-add-value-save"]');
  await page.waitForSelector('dialog[aria-label="Add variable"]', { state: "detached" });
  await page.waitForTimeout(100);

  const info = await page.evaluate(() => ({
    text: document.querySelector(".w6w-exprmodal-chips")?.textContent ?? null,
    railHasNew: Array.from(document.querySelectorAll(".w6w-exprmodal-source-label")).some(
      (el) => el.textContent === "brand_new_var",
    ),
    addBtnStillThere: !!document.querySelector('[data-testid="expr-add-var"]'),
  }));
  assert.equal(
    info.text,
    before,
    `the in-progress expression must survive the create flow unchanged, got: ${JSON.stringify(info)}`,
  );
  assert.ok(info.railHasNew, `the rail must gain a source for the newly created var, got: ${JSON.stringify(info)}`);
  assert.ok(
    info.addBtnStillThere,
    `+ Add must still be rendered after the flow, got: ${JSON.stringify(info)}`,
  );
  await page.close();
});
