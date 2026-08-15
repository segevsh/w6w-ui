// Browser gate for the `Copyable` / `CodeBlock copyable` invariants (C1-C7).
// Mounts the REAL components, bundled from source by ./run.sh, into real
// Chromium — no jsdom (it performs no layout, and implements no Clipboard API
// at all: this whole suite would either not run or pass on a broken tree).
//
// Every geometry assertion below is a RELATION between two live measurements
// (contained-in, same-half, within-tolerance-of), never a transcribed pixel —
// same discipline as test/picker-layout/picker-layout-guards.test.cjs.
const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const pw = require(process.env.PW_CORE_MOUNT || "/pw");
const ENGINE = process.env.ENGINE || "chromium";
const engine = pw[ENGINE];
if (!engine) throw new Error(`no such browser engine: ${ENGINE}`);

const ORIGIN = "http://localhost:8080";

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>copyable</title>
<link rel="stylesheet" href="/ui.css">
<link rel="stylesheet" href="/studio.css">
</head><body><div id="root"></div>
<script src="/bundle.js"></script></body></html>`;

// A plain `http://` origin (as picker-layout's fake `.test` TLD uses) has
// `navigator.clipboard` UNDEFINED in this image — isSecureContext is false.
// `localhost` is a secure context, and the permission grant below is what
// makes `navigator.clipboard.readText()` actually resolve rather than
// prompt/deny. Measured while drafting this project's contract; see run.sh.
async function open(browser) {
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.route("**/*", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/") return route.fulfill({ contentType: "text/html", body: HTML });
    if (p === "/bundle.js")
      return route.fulfill({ contentType: "text/javascript", path: "/w/bundle.js" });
    if (p === "/ui.css") return route.fulfill({ contentType: "text/css", path: "/w/ui.css" });
    if (p === "/studio.css")
      return route.fulfill({ contentType: "text/css", path: "/w/studio.css" });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.__mounted === true, null, { timeout: 10000 });
  await page.waitForTimeout(150);
  if (errs.length) throw new Error(`pageerror: ${errs.join("; ")}`);
  return { context, page };
}

const close = async ({ context }) => context.close();

const rect = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }, sel);

const computed = (page, sel, prop) =>
  page.evaluate(
    ([s, p]) => {
      const el = document.querySelector(s);
      return el ? getComputedStyle(el).getPropertyValue(p) : null;
    },
    [sel, prop],
  );

const readClipboard = (page) => page.evaluate(() => navigator.clipboard.readText());
const writeClipboard = (page, text) =>
  page.evaluate((t) => navigator.clipboard.writeText(t), text);

let browser;
before(async () => {
  browser = await engine.launch();
});
after(async () => {
  if (browser) await browser.close();
});

// ── C1 — read-only <input>: the button's border box is inside the wrapper's
//    border box, at its trailing edge; the wrapper (not the input) carries
//    the border. ──────────────────────────────────────────────────────────
test("C1 — read-only input: button contained in wrapper, at the trailing edge; wrapper (not input) has the border", async () => {
  const h = await open(browser);
  const wrap = await rect(h.page, ".c1");
  const btn = await rect(h.page, ".c1 button");
  const input = await rect(h.page, ".c1 input");
  assert.ok(wrap && btn && input, "wrapper/button/input must all render");

  assert.ok(btn.top >= wrap.top - 0.5, `button top ${btn.top} outside wrapper top ${wrap.top}`);
  assert.ok(btn.left >= wrap.left - 0.5, `button left ${btn.left} outside wrapper left ${wrap.left}`);
  assert.ok(
    btn.top + btn.height <= wrap.top + wrap.height + 0.5,
    `button bottom overflows wrapper (btn ${btn.top + btn.height} vs wrap ${wrap.top + wrap.height})`,
  );
  assert.ok(
    btn.left + btn.width <= wrap.left + wrap.width + 0.5,
    `button right overflows wrapper (btn ${btn.left + btn.width} vs wrap ${wrap.left + wrap.width})`,
  );
  assert.ok(
    btn.left + btn.width > input.left + input.width,
    `button (right ${btn.left + btn.width}) is not trailing the input (right ${input.left + input.width})`,
  );

  const wrapBorder = await computed(h.page, ".c1", "border-style");
  const inputBorder = await computed(h.page, ".c1 input", "border-style");
  assert.notEqual(wrapBorder, "none", `wrapper border-style must not be none, got "${wrapBorder}"`);
  assert.equal(inputBorder, "none", `input border-style must be none (flattened), got "${inputBorder}"`);

  await close(h);
});

// ── C2 — <textarea>: button rides at the top (upper half of the wrapper);
//    the single-line <input> case (c1) centres the button on the input. ───
test("C2 — textarea: button top in wrapper's upper half; single-line input: button/input centres agree within 1.5px", async () => {
  const h = await open(browser);
  const wrap = await rect(h.page, ".c2");
  const btn = await rect(h.page, ".c2 button");
  assert.ok(wrap && btn, "c2 wrapper/button must render");
  assert.ok(
    btn.top - wrap.top <= wrap.height / 2,
    `textarea button top (${btn.top - wrap.top} from wrapper top) not in upper half (half=${wrap.height / 2})`,
  );

  const btn1 = await rect(h.page, ".c1 button");
  const input1 = await rect(h.page, ".c1 input");
  const btnCy = btn1.top + btn1.height / 2;
  const inputCy = input1.top + input1.height / 2;
  assert.ok(
    Math.abs(btnCy - inputCy) <= 1.5,
    `single-line input: button centre ${btnCy} vs input centre ${inputCy}, delta ${Math.abs(btnCy - inputCy)} > 1.5px`,
  );

  await close(h);
});

// ── C3 — leak defence, studio.css layered after ui.css: a wrapped textarea's
//    computed min-height and margin read 0, DESPITE studio's own
//    `textarea { min-height: 80px }` / unscoped `margin-top` rule. ────────
test("C3 — wrapped textarea: computed min-height 0px and margin 0px, with studio.css layered", async () => {
  const h = await open(browser);
  const minHeight = await computed(h.page, ".c2 textarea", "min-height");
  assert.equal(minHeight, "0px", `wrapped textarea computed min-height was "${minHeight}", expected 0px`);
  for (const side of ["margin-top", "margin-right", "margin-bottom", "margin-left"]) {
    const v = await computed(h.page, ".c2 textarea", side);
    assert.equal(v, "0px", `wrapped textarea computed ${side} was "${v}", expected 0px`);
  }
  await close(h);
});

// ── C4 — read-only click ON THE INPUT copies `value`; the button reflects
//    the copied state. ─────────────────────────────────────────────────────
test("C4 — read-only: a click on the input copies value, and the button reports copied", async () => {
  const h = await open(browser);
  await h.page.click("#c1-input");
  await h.page.waitForTimeout(100);
  const copied = await readClipboard(h.page);
  assert.equal(copied, "the-input-value", `clipboard read "${copied}", expected "the-input-value"`);
  const isCopied = await h.page.evaluate(
    () => document.querySelector(".c1 button")?.classList.contains("is-copied") ?? false,
  );
  assert.ok(isCopied, "button must carry .is-copied after a successful box-click copy");
  await close(h);
});

// ── C5 — editable: a click on the input must NOT touch the clipboard; a
//    click on the icon must. ───────────────────────────────────────────────
test("C5 — editable: input click leaves clipboard untouched, icon click copies", async () => {
  const h = await open(browser);
  await writeClipboard(h.page, "sentinel-c5");
  await h.page.click("#c5-input");
  await h.page.waitForTimeout(100);
  const afterInputClick = await readClipboard(h.page);
  assert.equal(
    afterInputClick,
    "sentinel-c5",
    `editable input click must not touch the clipboard, got "${afterInputClick}"`,
  );

  await h.page.click(".c5 button");
  await h.page.waitForTimeout(100);
  const afterIconClick = await readClipboard(h.page);
  assert.equal(
    afterIconClick,
    "the-editable-value",
    `icon click must copy, got "${afterIconClick}"`,
  );
  await close(h);
});

// ── C6 — selection guard: a non-collapsed Range inside a read-only box
//    (the CodeBlock's <pre>) survives a click — the clipboard is untouched.
//    Uses `el.click()` in-page, not a real pointer click, so the browser's
//    own mousedown-driven selection-clearing never fires before our click
//    handler gets to read `window.getSelection()`. ─────────────────────────
test("C6 — selection guard: a non-collapsed selection inside a read-only box survives a click", async () => {
  const h = await open(browser);
  await writeClipboard(h.page, "sentinel-c6");
  const selected = await h.page.evaluate(() => {
    const code = document.querySelector("#c7 .w6w-code-block code");
    const textNode = code && [...code.querySelectorAll("*")].find((n) => n.textContent.length > 0);
    if (!textNode || !textNode.firstChild) return false;
    const range = document.createRange();
    range.selectNodeContents(textNode.firstChild);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    if (sel.isCollapsed) return false;
    document.querySelector("#c7 .w6w-copyable").click();
    return true;
  });
  assert.ok(selected, "could not establish a non-collapsed selection inside the code box");
  await h.page.waitForTimeout(100);
  const after = await readClipboard(h.page);
  assert.equal(after, "sentinel-c6", `a drag-selection must survive the click, got "${after}"`);
  await close(h);
});

// ── C7 — `<CodeBlock copyable>`: exactly one button inside the code box, and
//    the copied text equals the multi-line snippet byte for byte. ─────────
test("C7 — CodeBlock copyable: exactly one button, copied text matches the snippet byte for byte", async () => {
  const h = await open(browser);
  const buttonCount = await h.page.evaluate(
    () => document.querySelectorAll("#c7 button").length,
  );
  assert.equal(buttonCount, 1, `expected exactly one button inside the code box, got ${buttonCount}`);

  const snippet = await h.page.evaluate(() => window.__SNIPPET);
  await h.page.click("#c7 button");
  await h.page.waitForTimeout(100);
  const copied = await readClipboard(h.page);
  assert.equal(copied, snippet, `copied text != snippet\n---copied---\n${copied}\n---snippet---\n${snippet}`);
  assert.ok(copied.includes("\n"), "sanity: the snippet must actually be multi-line");
  await close(h);
});

// ── C8 — the copy button OVERLAYS the code box's top-right corner, inside its
//    border box, and costs the <pre> no width. ────────────────────────────
//
// Three relations, no transcribed pixels:
//   (a) CONTAINED — the button's border box sits inside the wrapper's, which
//       is the element drawing the border. "Inside the borders", literally.
//   (b) TOP-RIGHT — its centre is in the right half and the top third of that
//       box. Both halves matter: a button that merely sits inside would pass a
//       containment-only check while parked bottom-left.
//   (c) OVERLAID, not beside — the <pre> is as wide as the wrapper's content
//       box. This is the assertion that distinguishes the new layout from the
//       old flex-sibling one, where the button carved a permanent column out
//       of the full height of the block to seat one 28px control.
test("C8 — CodeBlock: copy button overlays the box's top-right corner and costs the <pre> no width", async () => {
  const h = await open(browser);
  const m = await h.page.evaluate(() => {
    const wrap = document.querySelector("#c8 .w6w-copyable");
    const btn = document.querySelector("#c8 .w6w-copyable-btn");
    const pre = document.querySelector("#c8 pre");
    if (!wrap || !btn || !pre) return null;
    const cs = getComputedStyle(wrap);
    const w = wrap.getBoundingClientRect();
    return {
      wrap: { l: w.left, r: w.right, t: w.top, b: w.bottom, w: w.width },
      btn: btn.getBoundingClientRect().toJSON(),
      pre: pre.getBoundingClientRect().toJSON(),
      padL: parseFloat(cs.paddingLeft),
      padR: parseFloat(cs.paddingRight),
      // getBoundingClientRect is the BORDER box, so the border has to come off
      // too or the expected content width is 2px wide and (c) fails by exactly
      // the border it forgot.
      bordL: parseFloat(cs.borderLeftWidth),
      bordR: parseFloat(cs.borderRightWidth),
      btnPos: getComputedStyle(btn).position,
    };
  });
  assert.ok(m, "expected #c8 to contain a .w6w-copyable wrapper, its button and a <pre>");

  // (a) contained in the bordered box
  assert.ok(
    m.btn.left >= m.wrap.l && m.btn.right <= m.wrap.r && m.btn.top >= m.wrap.t &&
      m.btn.bottom <= m.wrap.b,
    `button not inside the bordered box: btn=${JSON.stringify(m.btn)} wrap=${JSON.stringify(m.wrap)}`,
  );

  // (b) top-right, not merely inside
  const cx = m.btn.left + m.btn.width / 2;
  const cy = m.btn.top + m.btn.height / 2;
  assert.ok(
    cx > m.wrap.l + m.wrap.w / 2,
    `button centre ${cx} is not in the right half (box ${m.wrap.l}..${m.wrap.r})`,
  );
  assert.ok(
    cy < m.wrap.t + (m.wrap.b - m.wrap.t) / 3,
    `button centre ${cy} is not in the top third (box ${m.wrap.t}..${m.wrap.b})`,
  );

  // (c) overlaid, not a flex sibling stealing a column
  assert.equal(m.btnPos, "absolute", `button should be out of flow, position=${m.btnPos}`);
  const contentWidth = m.wrap.w - m.padL - m.padR - m.bordL - m.bordR;
  assert.ok(
    Math.abs(m.pre.width - contentWidth) <= 1.5,
    `<pre> width ${m.pre.width} should fill the wrapper's content box ${contentWidth} — ` +
      "a narrower <pre> means the button is still taking a flex column",
  );
  await close(h);
});

// ── C9 — the line-number gutter is not part of a mouse selection. ─────────
//
// Selects the whole numbered block with a real Range (what a drag produces)
// and asserts the resulting text is the source, with no gutter digits. The
// assertion is deliberately made against a 10-line block: `1`..`9` are
// substrings of the code itself, so a naive "no digits" check would be
// vacuous — the discriminator is that the SELECTED text equals the source
// exactly, and separately that the gutter's own computed `user-select` is
// `none`, which is the mechanism doing the work.
test("C9 — line numbers stay out of a drag selection (and out of the copied text)", async () => {
  const h = await open(browser);
  const r = await h.page.evaluate(() => {
    const pre = document.querySelector("#c9 pre");
    const gutter = document.querySelector("#c9 .w6w-code-line-no");
    if (!pre || !gutter) return null;
    const range = document.createRange();
    range.selectNodeContents(pre);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return {
      selected: sel.toString(),
      gutterCount: document.querySelectorAll("#c9 .w6w-code-line-no").length,
      gutterUserSelect: getComputedStyle(gutter).userSelect ||
        getComputedStyle(gutter).webkitUserSelect,
      gutterHidden: gutter.getAttribute("aria-hidden"),
    };
  });
  assert.ok(r, "expected #c9 to contain a <pre> with a line-number gutter");

  // The gutter must actually be present, or this test proves nothing.
  assert.equal(r.gutterCount, 10, `expected 10 gutter cells, got ${r.gutterCount}`);
  assert.equal(r.gutterUserSelect, "none", "the gutter must be user-select: none");
  assert.equal(r.gutterHidden, "true", "the gutter must be aria-hidden");

  const source = await h.page.evaluate(() => window.__NUMBERED);
  const normalise = (s) => s.replace(/\r/g, "").replace(/[ \t]+$/gm, "").trim();
  assert.equal(
    normalise(r.selected),
    normalise(source),
    `selected text != source — the gutter leaked into the selection\n` +
      `---selected---\n${r.selected}\n---source---\n${source}`,
  );

  // And the button's copy path agrees, independently of selection.
  await h.page.click("#c9 button");
  await h.page.waitForTimeout(100);
  const copied = await readClipboard(h.page);
  assert.equal(copied, source, "copied text must be the source, gutter excluded");
  await close(h);
});
