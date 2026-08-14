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
