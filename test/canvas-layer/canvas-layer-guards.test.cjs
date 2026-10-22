// Browser gate for WorkflowFlowEditor's notes + sections layer. Mounts the REAL
// editor, bundled from source by ./run.sh, into real Chromium via
// harness-entry.tsx — no jsdom (it performs no layout and has no
// `document.elementsFromPoint`, so a layer-order test there would pass on a
// broken tree).
//
// B1: at a point where a note overlaps a node, an edge and a section,
//     `elementsFromPoint` lists node, edge, note, section, pane top -> bottom,
//     and a pane click through an EMPTY part of a section's interior deselects.
// B2: selecting and then dragging the note leaves that order intact.
//
// Every assertion is a RELATION between live measurements (indexes in the
// hit-test stack, rect containment), never a pixel literal.
const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const pw = require(process.env.PW_CORE_MOUNT || "/pw");
const ENGINE = process.env.ENGINE || "chromium";
const engine = pw[ENGINE];
if (!engine) throw new Error(`no such browser engine: ${ENGINE}`);
const DIR = process.env.BUNDLE_DIR || "/w";

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>canvas-layer</title>
<link rel="stylesheet" href="/ui.css">
</head><body style="margin:0"><div id="root"></div>
<script src="/bundle.js"></script></body></html>`;

let browser;
before(async () => {
  browser = await engine.launch({ args: ["--no-sandbox"] });
});
after(async () => {
  if (browser) await browser.close();
});

async function open({ q = "" } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
  await page.goto(`http://canvas-layer.test/${q ? `?${q}` : ""}`);
  await page.waitForFunction(() => window.__mounted === true, null, { timeout: 10000 });
  await page.waitForSelector(".react-flow__node");
  // fitView animates (300ms) on mount — wait until the node rects stop moving.
  await settle(page);
  if (errs.length) throw new Error(`pageerror mounting q=${q}: ${errs.join("; ")}`);
  return page;
}

async function settle(page) {
  let prev = "";
  for (let i = 0; i < 40; i++) {
    const cur = await page.evaluate(() =>
      [...document.querySelectorAll(".react-flow__node")]
        .map((n) => {
          const r = n.getBoundingClientRect();
          return `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.width.toFixed(1)}`;
        })
        .join("|"),
    );
    if (cur === prev && cur) return;
    prev = cur;
    await page.waitForTimeout(120);
  }
}

const rectOf = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, sel);

const centre = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const inside = (r, p) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

// The hit-test stack at (x, y), top -> bottom, reduced to the kinds under test.
// Each kind appears at its FIRST index; `all` keeps the raw classification so a
// failure message shows the whole stack.
async function stack(page, p) {
  return page.evaluate(({ x, y }) => {
    const kindOf = (el) => {
      if (el.closest(".react-flow__node")) return "node";
      if (el.closest(".react-flow__edge")) return "edge";
      if (el.closest('[data-testid="note"]')) return "note";
      if (el.closest('[data-testid="section"]')) return "section";
      if (el.classList.contains("react-flow__pane")) return "pane";
      return "other";
    };
    const all = document.elementsFromPoint(x, y).map(kindOf);
    const first = {};
    all.forEach((k, i) => {
      if (!(k in first)) first[k] = i;
    });
    return { all, first };
  }, p);
}

const ORDER = ["node", "edge", "note", "section", "pane"];
function assertOrder(s, where) {
  for (const k of ORDER) assert.ok(k in s.first, `${where}: no "${k}" in the stack ${s.all}`);
  for (let i = 1; i < ORDER.length; i++) {
    assert.ok(
      s.first[ORDER[i - 1]] < s.first[ORDER[i]],
      `${where}: expected ${ORDER[i - 1]} above ${ORDER[i]}, stack top->bottom: ${s.all.join(" > ")}`,
    );
  }
}

// The one overlap point of the "overlap" fixture: node c's centre. The a->b edge
// runs through it, note n1 covers it, and section s_over's title covers it.
async function overlapPoint(page) {
  const c = await rectOf(page, '.react-flow__node[data-id="c"]');
  const p = centre(c);
  const note = await rectOf(page, '[data-note-id="n1"] [data-testid="note-content"], [data-note-id="n1"] .w6w-canvas-note-body');
  const title = await rectOf(page, '[data-section-id="s_over"] [data-testid="section-drag"]');
  assert.ok(inside(note, p), `fixture: note body ${JSON.stringify(note)} must cover ${JSON.stringify(p)}`);
  assert.ok(inside(title, p), `fixture: section title ${JSON.stringify(title)} must cover ${JSON.stringify(p)}`);
  return p;
}

test("B1: note overlapping node, edge and section stacks node > edge > note > section > pane; pane click through a section interior deselects", async () => {
  const page = await open();
  try {
    const p = await overlapPoint(page);
    assertOrder(await stack(page, p), "B1 overlap");

    // Pane click through an EMPTY part of a section's interior: select a node
    // first, then click the middle of the member-less section s_empty.
    const a = await rectOf(page, '.react-flow__node[data-id="a"]');
    await page.mouse.click(centre(a).x, centre(a).y);
    await page.waitForSelector('.react-flow__node[data-id="a"].selected');
    const sec = await rectOf(page, '[data-section-id="s_empty"]');
    const inner = centre(sec);
    const top = await stack(page, inner);
    assert.equal(
      top.all[0],
      "pane",
      `section interior must hit the pane first, stack: ${top.all.join(" > ")}`,
    );
    await page.mouse.click(inner.x, inner.y);
    await page.waitForFunction(() => document.querySelectorAll(".react-flow__node.selected").length === 0);
  } finally {
    await page.close();
  }
});

test("B2: after selecting and dragging the note, the layer order still holds", async () => {
  const page = await open();
  try {
    const before = await page.evaluate(() => window.__changes.length);
    const noteBefore = await rectOf(page, '[data-note-id="n1"]');
    const grip = await rectOf(page, '[data-note-id="n1"] [data-testid="note-drag"]');
    // Press on the note's drag strip (selects/grabs it), move, release.
    const g = { x: grip.x + 8, y: grip.y + grip.height / 2 };
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x + 12, g.y + 6, { steps: 4 });
    await page.mouse.move(g.x + 24, g.y + 12, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction((n) => window.__changes.length > n, before);
    const noteAfter = await rectOf(page, '[data-note-id="n1"]');
    assert.ok(
      noteAfter.x > noteBefore.x + 10 && noteAfter.y > noteBefore.y + 4,
      `the note must actually have moved: ${JSON.stringify(noteBefore)} -> ${JSON.stringify(noteAfter)}`,
    );
    const last = await page.evaluate(() => window.__changes[window.__changes.length - 1]);
    const n1 = last.canvas.notes.find((n) => n.id === "n1");
    assert.ok(n1.position.x > 260 && n1.position.y > -40, `emitted position moved: ${JSON.stringify(n1.position)}`);
    await settle(page);
    const p = await overlapPoint(page);
    assertOrder(await stack(page, p), "B2 after note drag");
  } finally {
    await page.close();
  }
});
