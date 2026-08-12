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

// Programmatic-dispatch is deliberately avoided for the click below (unlike
// `clickTab` in test/picker-layout) — a REAL Playwright click routes through
// the actual event pipeline, and for the flip control that is what a real
// author does. `.evaluate` is still used to find the button by its exact
// (unique, plain) textContent, mirroring the existing `byText` idiom in
// `ExpressionEditorModal.template-mode.test.ts`.
const clickButtonByText = (page, text) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
    if (!b) throw new Error(`no button labelled "${t}"`);
    b.click();
  }, text);

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

// ── Round 2 — F-1: the chips pane must be fully inert in template mode. ────
// jsdom cannot see any of these (no `contentEditable` model, no real click
// dispatch through the actual DOM event pipeline), so all three are real
// Chromium only, per the contract's R1.

test("P4 — flipping a chip inside the chips pane is blocked in template mode; Save keeps the pre-edit value (no silent render-part loss)", async () => {
  const page = await open(browser, { v: "templateVar" });
  await clickButtonByText(page, "Template");
  await page.waitForTimeout(50);

  // The bypass the evaluator found: click the render-flip control that lives
  // INSIDE the (now frozen) chips pane, above the template textarea.
  const flip = page.locator(".w6w-exprmodal-chips [data-render-toggle]");
  await flip.click();
  await page.waitForTimeout(50);

  const kindAfter = await page.evaluate(
    () =>
      document.querySelector(".w6w-exprmodal-chips .w6w-expr-chip")?.getAttribute("data-kind") ??
      null,
  );
  assert.equal(
    kindAfter,
    "var",
    `the chip must NOT flip to render from inside a frozen chips pane, got data-kind=${kindAfter}`,
  );

  await clickButtonByText(page, "Save");
  await page.waitForTimeout(50);
  const saves = await page.evaluate(() => window.__saves);
  assert.equal(saves.length, 1, `Save must fire exactly once, got: ${JSON.stringify(saves)}`);
  assert.deepEqual(
    saves[0],
    { type: "expr", parts: [{ kind: "var", ref: "vars.a" }] },
    `Save must write back the untouched pre-edit value, got: ${JSON.stringify(saves[0])}`,
  );
  await page.close();
});

test("P5 — no dead end: the Chips button never disables while in template mode, and leaving template mode always succeeds", async () => {
  const page = await open(browser, { v: "templateVar" });
  await clickButtonByText(page, "Template");
  await page.waitForTimeout(50);

  // Attempt the same bypass as P4 — even if it somehow flipped a chip, the
  // Chips button must stay enabled: nothing inside the frozen pane can create
  // a render part while in template mode (P4 already pins that it doesn't).
  await page.locator(".w6w-exprmodal-chips [data-render-toggle]").click();
  await page.waitForTimeout(50);

  const chipsDisabled = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".w6w-view-toggle button")].find(
      (x) => x.textContent.trim() === "Chips",
    );
    return b ? b.disabled : "MISSING";
  });
  assert.equal(chipsDisabled, false, "the Chips button must stay enabled — no dead end");

  await clickButtonByText(page, "Chips");
  await page.waitForTimeout(50);
  const stillInTemplateMode = await page.evaluate(
    () => document.querySelector(".w6w-exprmodal-template-input") !== null,
  );
  assert.equal(
    stillInTemplateMode,
    false,
    "clicking Chips must actually leave template mode (the textarea is gone)",
  );
  const chipsEditable = await page.evaluate(() =>
    document.querySelector(".w6w-exprmodal-chips")?.getAttribute("contenteditable"),
  );
  assert.equal(chipsEditable, "true", "the chips pane must be editable again after returning");
  await page.close();
});

test("Q1 — typing into the chips pane while in template mode has no effect; Save never writes an empty string", async () => {
  const page = await open(browser, { v: "templateVar" });
  await clickButtonByText(page, "Template");
  await page.waitForTimeout(50);

  await page.click(".w6w-exprmodal-chips");
  await page.keyboard.type("TYPED-IN-CHIPS-PANE", { delay: 10 });
  await page.waitForTimeout(100);

  const chipsText = await page.evaluate(
    () => document.querySelector(".w6w-exprmodal-chips")?.textContent ?? null,
  );
  assert.ok(
    !chipsText || !chipsText.includes("TYPED-IN-CHIPS-PANE"),
    `typing must not land in the frozen chips pane, got: ${JSON.stringify(chipsText)}`,
  );
  const draftValue = await page.evaluate(
    () => document.querySelector(".w6w-exprmodal-template-input")?.value ?? null,
  );
  assert.equal(
    draftValue,
    "{{ vars.a }}",
    `the draft textarea must be untouched by chips-pane typing, got: ${JSON.stringify(draftValue)}`,
  );

  await clickButtonByText(page, "Save");
  await page.waitForTimeout(50);
  const saves = await page.evaluate(() => window.__saves);
  assert.equal(saves.length, 1, `Save must fire exactly once, got: ${JSON.stringify(saves)}`);
  assert.notEqual(saves[0], "", "Save must not write an empty string");
  assert.deepEqual(
    saves[0],
    { type: "expr", parts: [{ kind: "var", ref: "vars.a" }] },
    `Save must write the draft's real value, got: ${JSON.stringify(saves[0])}`,
  );
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
