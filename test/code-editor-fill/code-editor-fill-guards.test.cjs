// Browser gate: every CodeMirror code view FILLS its bordered box. Mounts the
// REAL components, bundled from source by ./run.sh, into real Chromium via
// harness-entry.tsx — no jsdom (it resolves no heights at all, so every
// assertion here would pass on a broken tree).
//
// Per case the box is `.cm-editor` (it carries the border). Filling means:
//   - the scroller covers the box's whole inner area, so the horizontal
//     scrollbar sits at the box's bottom edge, not under the last line;
//   - the gutter column spans the scroller's visible height;
//   - line numbers stop at the last content line;
//   - content taller than the box scrolls inside the scroller.
// F1/F2 are the Data page Document modal (the reported bug: a min/max-height box
// with no definite height, whose scroller and gutter stopped at line 4). F3-F8
// are the other shapes the shared editors are mounted in, so none regresses.
//
// Every assertion is a RELATION between live measurements, never a pixel
// transcribed from a screenshot; the only literals are the heights the case
// itself configures.
const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const pw = require(process.env.PW_CORE_MOUNT || "/pw");
const ENGINE = process.env.ENGINE || "chromium";
const engine = pw[ENGINE];
if (!engine) throw new Error(`no such browser engine: ${ENGINE}`);
const DIR = process.env.BUNDLE_DIR || "/w";
const VIEWPORT = { width: 1280, height: 800 };

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>code-editor-fill</title>
<link rel="stylesheet" href="/ui.css">
</head><body style="margin:0"><div id="root"></div>
<script src="/bundle.js"></script></body></html>`;

let browser;
before(async () => {
  // Playwright launches headless Chromium with `--hide-scrollbars`; F1 measures
  // where the horizontal scrollbar sits, so it has to be drawn.
  browser = await engine.launch({ args: ["--no-sandbox"], ignoreDefaultArgs: ["--hide-scrollbars"] });
});
after(async () => {
  if (browser) await browser.close();
});

async function open(name) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.route("**/*", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/") return route.fulfill({ contentType: "text/html", body: HTML });
    if (p === "/bundle.js")
      return route.fulfill({ contentType: "text/javascript", path: `${DIR}/bundle.js` });
    if (p === "/ui.css") return route.fulfill({ contentType: "text/css", path: `${DIR}/ui.css` });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(`http://code-editor-fill.test/?case=${name}`);
  await page.waitForFunction(() => window.__mounted === true, null, { timeout: 10000 });
  await page.waitForSelector(".cm-editor .cm-gutters");
  // CodeMirror measures in a rAF after mount; let it settle before measuring.
  await page.waitForTimeout(200);
  if (errs.length) throw new Error(`pageerror mounting ${name}: ${errs.join("; ")}`);
  await page.screenshot({ path: `${DIR}/${name}.png` });
  return page;
}

function measure(page) {
  return page.evaluate(() => {
    const ed = document.querySelector(".cm-editor");
    const sc = ed.querySelector(".cm-scroller");
    const gu = ed.querySelector(".cm-gutters");
    const r = (el) => {
      const b = el.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, height: b.height };
    };
    const cs = getComputedStyle(ed);
    // Line numbers a reader can see: CodeMirror also renders a hidden sizer
    // element in the gutter, which must not count.
    const numbers = [...ed.querySelectorAll(".cm-lineNumbers .cm-gutterElement")]
      .filter((el) => getComputedStyle(el).visibility !== "hidden" && el.getBoundingClientRect().height > 0)
      .map((el) => el.textContent);
    return {
      editor: r(ed),
      innerTop: ed.getBoundingClientRect().top + parseFloat(cs.borderTopWidth),
      innerBottom: ed.getBoundingClientRect().bottom - parseFloat(cs.borderBottomWidth),
      scroller: {
        ...r(sc),
        clientHeight: sc.clientHeight,
        scrollHeight: sc.scrollHeight,
        clientWidth: sc.clientWidth,
        scrollWidth: sc.scrollWidth,
        // The horizontal scrollbar's thickness: the part of the scroller's box
        // its client area does not cover.
        hScrollbar: sc.offsetHeight - sc.clientHeight,
      },
      gutters: r(gu),
      numbers,
      lines: ed.querySelectorAll(".cm-line").length,
    };
  });
}

const near = (a, b, msg, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

/** The scroller covers the editor's whole inner box, and the gutter spans it. */
function assertFills(m, label) {
  near(m.scroller.top, m.innerTop, `${label}: scroller top meets the box's inner top`);
  near(m.scroller.bottom, m.innerBottom, `${label}: scroller bottom meets the box's inner bottom`);
  assert.ok(
    m.gutters.height >= m.scroller.clientHeight - 1,
    `${label}: gutter (${m.gutters.height}px) spans the scroller's visible height (${m.scroller.clientHeight}px)`,
  );
}

/** Content taller than the box scrolls inside the scroller. */
async function assertScrollsInside(page, m, label) {
  assert.ok(
    m.scroller.scrollHeight > m.scroller.clientHeight + 10,
    `${label}: content (${m.scroller.scrollHeight}px) overflows the scroller (${m.scroller.clientHeight}px)`,
  );
  const top = await page.evaluate(() => {
    const sc = document.querySelector(".cm-scroller");
    sc.scrollTop = 200;
    return sc.scrollTop;
  });
  assert.ok(top > 0, `${label}: the scroller itself scrolls (scrollTop=${top})`);
}

const range = (n) => Array.from({ length: n }, (_, i) => String(i + 1));

test("F1 — Document modal, short document: code area fills the box, gutter spans it, scrollbar at its bottom", async () => {
  const page = await open("doc-short");
  try {
    const m = await measure(page);
    // `minHeight="min(50vh, 400px)"` — the box is at least that tall.
    const minBox = Math.min(VIEWPORT.height / 2, 400);
    assert.ok(m.editor.height >= minBox - 1, `box is its min-height (${m.editor.height} >= ${minBox})`);
    assertFills(m, "doc-short");
    assert.deepEqual(m.numbers, range(m.lines), "line numbers stop at the last content line");
    assert.equal(m.lines, 4);
    assert.ok(m.scroller.scrollWidth > m.scroller.clientWidth, "the long line overflows horizontally");
    assert.ok(m.scroller.hScrollbar > 0, "a horizontal scrollbar is shown");
    // With the scroller bottom on the box's inner bottom (assertFills), the
    // scrollbar — the last `hScrollbar` px of the scroller — is the box's bottom
    // strip, far below the 4 content lines.
    const contentBottom = await page.evaluate(
      () => [...document.querySelectorAll(".cm-line")].at(-1).getBoundingClientRect().bottom,
    );
    assert.ok(
      m.innerBottom - m.scroller.hScrollbar - contentBottom > 100,
      `scrollbar sits at the box bottom, not under the content (${contentBottom} vs ${m.innerBottom})`,
    );
  } finally {
    await page.close();
  }
});

test("F2 — Document modal, tall document: capped at maxHeight and scrolls inside the editor", async () => {
  const page = await open("doc-tall");
  try {
    const m = await measure(page);
    assert.ok(m.editor.height <= VIEWPORT.height * 0.6 + 1, `box capped at 60vh (${m.editor.height})`);
    assertFills(m, "doc-tall");
    await assertScrollsInside(page, m, "doc-tall");
  } finally {
    await page.close();
  }
});

test("F3 — CodeEditor at its default min-height: one line, gutter spans the 160px box", async () => {
  const page = await open("code-min");
  try {
    const m = await measure(page);
    near(m.editor.height, 160, "box is CodeEditor's default 160px min-height");
    assertFills(m, "code-min");
    assert.deepEqual(m.numbers, ["1"], "one line number for one line");
  } finally {
    await page.close();
  }
});

test("F4 — YamlEditor at its default min-height: gutter spans the 240px box", async () => {
  const page = await open("yaml-min");
  try {
    const m = await measure(page);
    near(m.editor.height, 240, "box is YamlEditor's default 240px min-height");
    assertFills(m, "yaml-min");
    assert.deepEqual(m.numbers, ["1"]);
  } finally {
    await page.close();
  }
});

test("F5 — fixed-height inline editor keeps its height and scrolls inside", async () => {
  const page = await open("fixed");
  try {
    const m = await measure(page);
    near(m.editor.height, 120, "box keeps its explicit 120px height");
    assertFills(m, "fixed");
    await assertScrollsInside(page, m, "fixed");
  } finally {
    await page.close();
  }
});

test("F6 — content-sized editor grows to maxHeight, then scrolls inside", async () => {
  const page = await open("capped");
  try {
    const m = await measure(page);
    near(m.editor.height, 260, "box grows to its 260px maxHeight");
    assertFills(m, "capped");
    await assertScrollsInside(page, m, "capped");
  } finally {
    await page.close();
  }
});

test("F7 — height=100% in the full-view JSON body fills that body", async () => {
  const page = await open("fullview");
  try {
    const m = await measure(page);
    const body = await page.evaluate(() => document.querySelector(".w6w-json-fullview").getBoundingClientRect().height);
    near(m.editor.height, body, "box fills the full-view body");
    assertFills(m, "fullview");
    assert.deepEqual(m.numbers, ["1"]);
  } finally {
    await page.close();
  }
});

test("F8 — height=100% in the expression modal's JSON pane fills the pane", async () => {
  const page = await open("exprmodal");
  try {
    const m = await measure(page);
    const pane = await page.evaluate(() => document.querySelector(".w6w-exprmodal-json").getBoundingClientRect().height);
    near(m.editor.height, pane, "box fills the JSON pane");
    near(pane, 420, "the pane fills its 420px column");
    assertFills(m, "exprmodal");
  } finally {
    await page.close();
  }
});
