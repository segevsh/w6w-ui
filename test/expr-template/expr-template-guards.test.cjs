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

// T1.2.2 §M3 — three viewports, copied from picker-layout-guards.test.cjs's
// `wide`/`med` plus a `tall` entry: the mutation class is "the Result pane's
// height is not proportional to the modal", and two viewports can't kill a
// fixed `height: 300px` (35% at wide, 43% at med, but 26.7% at tall).
const VP = {
  wide: { width: 1440, height: 900 },
  med: { width: 1280, height: 720 },
  tall: { width: 1440, height: 1200 },
};

async function open(browser, { v = "empty", vp = VP.wide } = {}) {
  const page = await browser.newPage({ viewport: vp });
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

// Lifted from picker-layout-guards.test.cjs's `rect()`, with `left` added
// (needed by a caret/order assertion elsewhere in this project's stream).
// `document.querySelector(sel)` is why every caller below selects
// `dialog.w6w-modal` / `.w6w-exprmodal-result` / `.w6w-exprmodal-editor`
// explicitly, never a bare tag — a second `<dialog>` open elsewhere would
// otherwise be measured silently.
const rect = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  }, sel);

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

// ── M-full — the -full size modifier actually applies. `dialog.w6w-modal`
//    (0,1,1) previously out-specified `.w6w-modal-full` (0,1,0), so the
//    modal's authored `max-width: min(1200px, 96vw)` / `width: 96vw` /
//    `max-height: 92vh` / `overflow: hidden` never won against the base
//    rule's 800px/auto. The real ExpressionEditorModal renders `size="full"`
//    (ExpressionEditorModal.tsx:195), so this mounts it exactly as-is and
//    measures the live dialog, not a transcribed rect. ─────────────────────
test("M-full — the -full size modifier actually applies", async () => {
  const page = await open(browser, { v: "empty" });
  const info = await page.evaluate(() => {
    const el = document.querySelector("dialog");
    const r = el.getBoundingClientRect();
    return {
      width: r.width,
      overflow: getComputedStyle(el).overflow,
      scrollOverflow: el.scrollHeight - el.clientHeight,
      docScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  assert.ok(info.width >= 1150, `-full dialog width ${info.width} < 1150 floor`);
  assert.equal(info.overflow, "hidden", `-full dialog computed overflow was "${info.overflow}", expected "hidden"`);
  assert.equal(
    info.scrollOverflow,
    0,
    `-full dialog has clipped content: scrollHeight - clientHeight = ${info.scrollOverflow}`,
  );
  assert.ok(
    info.docScrollWidth <= info.viewportWidth,
    `-full dialog causes horizontal page scroll: documentElement.scrollWidth ${info.docScrollWidth} > viewport width ${info.viewportWidth}`,
  );
  await page.close();
});

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

// ── T1.2.2 — chip-ify hand-typed/pasted/re-opened `{{ … }}`, and the Result
//    pane's height as a ratio (CONDUCTOR AMENDMENT 2026-08-14, root-anchored
//    parsing: `{{ vars.a }}` chips, a vendor placeholder like `{{name}}`
//    never does). ──────────────────────────────────────────────────────────

test("T-typed — a hand-typed {{ vars.a }} becomes a chip AT THE KEYSTROKE THAT CLOSES IT, before any blur (D-3: promotion supersedes the old on-blur commit)", async () => {
  const page = await open(browser, { v: "empty" });
  await page.click(".w6w-exprmodal-chips");
  // Type everything up to but NOT including the closing "}}" first, and pin
  // the same character-order idiom G-typing uses — an over-eager `paintGen`
  // bump anywhere on this path would show up here as REORDERED text, not
  // merely wrong text.
  await page.keyboard.type("{{ vars.a }", { delay: 30 });
  await page.waitForTimeout(100);
  const preClose = await page.evaluate(
    () => document.querySelector(".w6w-exprmodal-chips")?.textContent ?? null,
  );
  assert.equal(
    preClose,
    "{{ vars.a }",
    `typed characters must land in order before the marker closes; got: ${JSON.stringify(preClose)}`,
  );
  // The keystroke that closes the marker — no blur anywhere in this test.
  await page.keyboard.type("}", { delay: 30 });
  await page.waitForTimeout(150);
  const info = await page.evaluate(() => ({
    chip: !!document.querySelector('.w6w-expr-chip[data-ref="vars.a"]'),
    stillFocused: document.activeElement === document.querySelector(".w6w-exprmodal-chips"),
  }));
  assert.ok(info.chip, `a typed {{ vars.a }} must become a chip at the closing keystroke; got: ${JSON.stringify(info)}`);
  assert.ok(info.stillFocused, "the editor must still be focused — no blur occurred");
  await page.close();
});

test("T-paste — pasting {{ vars.a }} mid-string produces a chip and preserves the surrounding text order and the caret", async () => {
  const page = await open(browser, { v: "empty" });
  await page.click(".w6w-exprmodal-chips");
  await page.keyboard.type("HEADTAIL", { delay: 10 });
  // Place the caret between "HEAD" and "TAIL" — 4 chars from the end.
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft");
  await page.evaluate(() => {
    const el = document.querySelector(".w6w-exprmodal-chips");
    el.focus();
    const dt = new DataTransfer();
    dt.setData("text/plain", "{{ vars.a }}");
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
  });
  await page.waitForTimeout(150);
  const order = await page.evaluate(() => {
    const el = document.querySelector(".w6w-exprmodal-chips");
    return Array.from(el.childNodes).map((n) => {
      if (n.nodeType === Node.TEXT_NODE) return { type: "text", value: n.textContent };
      const ref = n.getAttribute?.("data-ref");
      if (ref) return { type: "chip", ref };
      return { type: "other", tag: n.tagName };
    });
  });
  assert.deepEqual(
    order,
    [
      { type: "text", value: "HEAD" },
      { type: "chip", ref: "vars.a" },
      { type: "text", value: "TAIL" },
    ],
    `pasted chip must land BETWEEN "HEAD" and "TAIL", in order; got: ${JSON.stringify(order)}`,
  );
  await page.close();
});

test("T-inline (acceptance 4, the durable-location proof) — the real inline ExpressionInput, mounted on the plain string \"{{ vars.a }}\" with NO typing and NO blur, renders a chip", async () => {
  const page = await open(browser, { v: "inlineTyped" });
  const chip = await page.evaluate(
    () => !!document.querySelector('.w6w-expr-chip[data-ref="vars.a"]'),
  );
  assert.ok(
    chip,
    "ExpressionInput mounted on the plain string {{ vars.a }} must chip through valueToParts at mount",
  );
  await page.close();
});

// ── D-3 (TA3) — live promotion in the INLINE field (the more severe half:
//    before this fix `ExpressionInput`'s `onLeave` early-returned unless
//    `masked`, so a plain inline field had NO promotion path at all — the bug
//    in the human's screenshot), and double-click back to text in both
//    surfaces. ─────────────────────────────────────────────────────────────

test("T-typed-inline — the real inline ExpressionInput chip-ifies a hand-typed {{ vars.a }} AT THE KEYSTROKE THAT CLOSES IT, before any blur", async () => {
  const page = await open(browser, { v: "inlineEmpty" });
  await page.click(".w6w-expr-editor");
  await page.keyboard.type("{{ vars.a }", { delay: 30 });
  await page.waitForTimeout(100);
  const preClose = await page.evaluate(
    () => document.querySelector(".w6w-expr-editor")?.textContent ?? null,
  );
  assert.equal(
    preClose,
    "{{ vars.a }",
    `typed characters must land in order before the marker closes; got: ${JSON.stringify(preClose)}`,
  );
  await page.keyboard.type("}", { delay: 30 });
  await page.waitForTimeout(150);
  const info = await page.evaluate(() => ({
    chip: !!document.querySelector('.w6w-expr-editor .w6w-expr-chip[data-ref="vars.a"]'),
    stillFocused: document.activeElement === document.querySelector(".w6w-expr-editor"),
  }));
  assert.ok(
    info.chip,
    `a typed {{ vars.a }} in the inline field must become a chip at the closing keystroke; got: ${JSON.stringify(info)}`,
  );
  assert.ok(info.stillFocused, "the inline editor must still be focused — no blur occurred");
  await page.close();
});

test("T-typed-second — a SECOND marker promotes in the same still-mounted field: two chips plus the literal text between them, in order", async () => {
  const page = await open(browser, { v: "inlineEmpty" });
  await page.click(".w6w-expr-editor");
  await page.keyboard.type("{{ vars.a }}", { delay: 30 });
  await page.waitForTimeout(150);
  // The field stays MOUNTED — no reload, no remount — and already holds a
  // chip when the second marker is typed. A promotion that only works on a
  // freshly-mounted, single-marker field cannot reach this.
  await page.keyboard.type(" and {{ vars.b }}", { delay: 30 });
  await page.waitForTimeout(150);
  const order = await page.evaluate(() => {
    const el = document.querySelector(".w6w-expr-editor");
    const raw = Array.from(el.childNodes).map((n) => {
      if (n.nodeType === Node.TEXT_NODE) return { type: "text", value: n.textContent };
      const ref = n.getAttribute?.("data-ref");
      if (ref) return { type: "chip", ref };
      return { type: "other", tag: n.tagName };
    });
    // Coalesce adjacent text and drop empty text nodes — mirrors readParts's
    // own `pushText`, so a harmless empty-text-node artifact of the Range
    // surgery on either side of the inserted chip (a legitimate DOM detail,
    // not a value the field actually holds) doesn't fail an ORDER assertion.
    const out = [];
    for (const item of raw) {
      if (item.type === "text") {
        if (!item.value) continue;
        const last = out[out.length - 1];
        if (last?.type === "text") {
          last.value += item.value;
          continue;
        }
      }
      out.push(item);
    }
    return out;
  });
  assert.deepEqual(
    order,
    [
      { type: "chip", ref: "vars.a" },
      { type: "text", value: " and " },
      { type: "chip", ref: "vars.b" },
    ],
    `both chips and the literal text between them must survive, in order; got: ${JSON.stringify(order)}`,
  );
  await page.close();
});

// ── TA2 (D-2) — a hand-typed `||`/`??` chain is a first-class chain
//    everywhere it is inspected: it chips as ONE `expr` part (not a bogus
//    `var` whose ref is garbage — see the contract's measured base-tree
//    bug), and the chip's label renders from its OPERANDS rather than
//    truncated raw JSON. The intake screenshot's scenario, end to end. ────

test('T-chain-inline — a hand-typed {{ inputs.from || "+1234567" }} chip-ifies as ONE chain chip whose data-expr and label reflect the operands', async () => {
  const page = await open(browser, { v: "inlineEmpty" });
  await page.click(".w6w-expr-editor");
  await page.keyboard.type('{{ inputs.from || "+1234567" }}', { delay: 30 });
  await page.waitForTimeout(150);
  const info = await page.evaluate(() => {
    const el = document.querySelector(".w6w-expr-editor");
    const chips = el.querySelectorAll(".w6w-expr-chip");
    const chip = chips[0];
    return {
      chipCount: chips.length,
      dataExpr: chip?.getAttribute("data-expr") ?? null,
      label: chip?.querySelector(".w6w-expr-chip-label")?.textContent ?? null,
    };
  });
  assert.equal(
    info.chipCount,
    1,
    `a hand-typed chain must chip as exactly ONE chip, not zero and not split; got: ${JSON.stringify(info)}`,
  );
  assert.deepEqual(
    JSON.parse(info.dataExpr ?? "null"),
    { or: [{ var: "inputs.from" }, "+1234567"] },
    `data-expr must hold the chain's own JSONLogic (the stored value, unaffected by the label change); got: ${JSON.stringify(info)}`,
  );
  assert.equal(
    info.label,
    'inputs.from || "+1234567"',
    `the chip label must render from its operands, not a truncated ƒ + raw-JSON sigil; got: ${JSON.stringify(info)}`,
  );
  await page.close();
});

test("T-dbl-modal — double-clicking a chip converts it to its exact {{ vars.a }} text in place (surrounding text order intact); double-clicking its × removes it and creates no text node", async () => {
  // Arm 1: double-click the chip's BODY.
  {
    const page = await open(browser, { v: "dblChip" });
    const box = await page.evaluate(() => {
      const el = document.querySelector(".w6w-exprmodal-chips .w6w-expr-chip-label");
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.dblclick(box.x, box.y);
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => {
      const el = document.querySelector(".w6w-exprmodal-chips");
      return {
        chipCount: el.querySelectorAll(".w6w-expr-chip").length,
        order: Array.from(el.childNodes).map((n) =>
          n.nodeType === Node.TEXT_NODE ? n.textContent : `[${n.tagName}]`,
        ),
      };
    });
    assert.equal(info.chipCount, 0, `the chip must be gone; got: ${JSON.stringify(info)}`);
    assert.deepEqual(
      info.order,
      ["HEAD ", "{{ vars.a }}", " TAIL"],
      `double-click must replace the chip with its exact text, surrounding text order intact; got: ${JSON.stringify(info)}`,
    );
    await page.close();
  }
  // Arm 2: double-click lands on the chip's × — the chip is REMOVED, and no
  // {{ }} text node appears for it (a chip merely deleted must not be
  // mistaken for one that was converted).
  {
    const page = await open(browser, { v: "dblChip" });
    const box = await page.evaluate(() => {
      const el = document.querySelector(".w6w-exprmodal-chips [data-x]");
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.dblclick(box.x, box.y);
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => {
      const el = document.querySelector(".w6w-exprmodal-chips");
      return { chipCount: el.querySelectorAll(".w6w-expr-chip").length, text: el.textContent };
    });
    assert.equal(info.chipCount, 0, `the chip must be removed by the ×; got: ${JSON.stringify(info)}`);
    assert.equal(
      info.text,
      "HEAD  TAIL",
      `removing via × must leave no {{ }} text for the chip; got: ${JSON.stringify(info)}`,
    );
    await page.close();
  }
});

test("T-dbl-inline — the real inline ExpressionInput: double-clicking a chip converts it to its exact {{ vars.a }} text in place; double-clicking its × removes it and creates no text node", async () => {
  // Arm 1: double-click the chip's BODY.
  {
    const page = await open(browser, { v: "dblChipInline" });
    const box = await page.evaluate(() => {
      const el = document.querySelector(".w6w-expr-editor .w6w-expr-chip-label");
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.dblclick(box.x, box.y);
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => {
      const el = document.querySelector(".w6w-expr-editor");
      return {
        chipCount: el.querySelectorAll(".w6w-expr-chip").length,
        order: Array.from(el.childNodes).map((n) =>
          n.nodeType === Node.TEXT_NODE ? n.textContent : `[${n.tagName}]`,
        ),
      };
    });
    assert.equal(info.chipCount, 0, `the chip must be gone; got: ${JSON.stringify(info)}`);
    assert.deepEqual(
      info.order,
      ["HEAD ", "{{ vars.a }}", " TAIL"],
      `double-click must replace the chip with its exact text, surrounding text order intact; got: ${JSON.stringify(info)}`,
    );
    await page.close();
  }
  // Arm 2: double-click lands on the chip's ×.
  {
    const page = await open(browser, { v: "dblChipInline" });
    const box = await page.evaluate(() => {
      const el = document.querySelector(".w6w-expr-editor [data-x]");
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.dblclick(box.x, box.y);
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => {
      const el = document.querySelector(".w6w-expr-editor");
      return { chipCount: el.querySelectorAll(".w6w-expr-chip").length, text: el.textContent };
    });
    assert.equal(info.chipCount, 0, `the chip must be removed by the ×; got: ${JSON.stringify(info)}`);
    assert.equal(
      info.text,
      "HEAD  TAIL",
      `removing via × must leave no {{ }} text for the chip; got: ${JSON.stringify(info)}`,
    );
    await page.close();
  }
});

test("T-height — the Result pane is 30-50% of the modal height (a RATIO, never a pixel) at three viewports, with the chips editor not starved", async () => {
  for (const [name, vp] of Object.entries(VP)) {
    const page = await open(browser, { v: "empty", vp });
    const d = await rect(page, "dialog.w6w-modal");
    const r = await rect(page, ".w6w-exprmodal-result");
    const e = await rect(page, ".w6w-exprmodal-editor");
    assert.ok(
      d && r && e,
      `[${name}] dialog/.w6w-exprmodal-result/.w6w-exprmodal-editor must all be measurable`,
    );
    const resultRatio = r.height / d.height;
    const editorRatio = e.height / d.height;
    console.log(
      `  [T-height ${name} ${vp.width}x${vp.height}] dialog=${d.height}px result=${r.height}px ` +
        `(${(resultRatio * 100).toFixed(1)}%) editor=${e.height}px (${(editorRatio * 100).toFixed(1)}%)`,
    );
    assert.ok(
      resultRatio >= 0.3 && resultRatio <= 0.5,
      `[${name} ${vp.width}x${vp.height}] result pane ${(resultRatio * 100).toFixed(1)}% of modal ` +
        `(dialog=${d.height}px, result=${r.height}px)`,
    );
    assert.ok(
      editorRatio >= 0.25,
      `[${name} ${vp.width}x${vp.height}] chips editor ${(editorRatio * 100).toFixed(1)}% of modal, ` +
        `must not be starved (dialog=${d.height}px, editor=${e.height}px)`,
    );
    await page.close();
  }
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
