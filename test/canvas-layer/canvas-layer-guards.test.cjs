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
// B3: notes and sections — every control lives on a toolbar ABOVE the box, never inside it.
// B5: a connection dragged out of any port and dropped on empty canvas (or a click
//     on the port) opens the node builder, and the step added is wired to that port.
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
      if (el.closest('[data-testid="section"], [data-section-label]')) return "section";
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
// runs through it, note n1 covers it, and section s_over's label (above its frame) covers it.
async function overlapPoint(page) {
  const c = await rectOf(page, '.react-flow__node[data-id="c"]');
  const p = centre(c);
  const note = await rectOf(page, '[data-note-id="n1"] [data-testid="note-content"], [data-note-id="n1"] .w6w-canvas-note-body');
  const title = await rectOf(page, '[data-section-label="s_over"]');
  assert.ok(inside(note, p), `fixture: note body ${JSON.stringify(note)} must cover ${JSON.stringify(p)}`);
  assert.ok(inside(title, p), `fixture: section label ${JSON.stringify(title)} must cover ${JSON.stringify(p)}`);
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
    // Press on the note's body (selects/grabs it), move, release.
    const g = await uncoveredPoint(page, '[data-note-id="n1"] [data-testid="note-view"]');
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

// ───────────────────────── B3: flows, checked against the emitted definition ─────────────────────────
//
// Every flow drives the real UI (toolbar buttons, pointer drags, the Modal) and then
// asserts on the LAST `onChange` definition the editor emitted (`window.__changes`) —
// the contract the host persists — plus, where it matters, the live render.

const lastChange = (page) => page.evaluate(() => window.__changes[window.__changes.length - 1]);
const changeCount = (page) => page.evaluate(() => window.__changes.length);
const waitForChange = (page, n, what = "an onChange emission") =>
  page
    .waitForFunction((k) => window.__changes.length > k, n, { timeout: 5000 })
    .catch(() => {
      throw new Error(`timed out waiting for ${what}`);
    });
// The editor can emit a trailing, content-identical definition after a selection change;
// take the emission baseline only once the count has stopped moving.
async function quiesce(page) {
  let prev = -1;
  for (let i = 0; i < 20; i++) {
    const cur = await changeCount(page);
    if (cur === prev) return cur;
    prev = cur;
    await page.waitForTimeout(250);
  }
  throw new Error("emissions never settled");
}
const zoomOf = (page) =>
  page.evaluate(
    () =>
      new DOMMatrix(getComputedStyle(document.querySelector(".react-flow__viewport")).transform).a,
  );
const nodeById = (def, id) => def.nodes.find((n) => n.id === id);

// Press at (x, y), drag by (dx, dy) in screen px, release. Moves in steps so the
// drag threshold of both d3-drag (nodes) and the layer's pointermove listener fire.
async function dragBy(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 6 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
  await page.mouse.up();
}

// A point on `sel` whose top hit is `sel` itself (edges draw above notes, so part of a
// strip can be covered by one) — scanned along the middle of the element.
async function uncoveredPoint(page, sel) {
  const p = await page.evaluate((q) => {
    const el = document.querySelector(q);
    const r = el.getBoundingClientRect();
    const y = r.y + r.height / 2;
    const seen = [];
    for (let x = r.x + 4; x < r.x + r.width - 4; x += 4) {
      const top = document.elementsFromPoint(x, y)[0];
      if (top && el.contains(top) && !top.closest("button,input")) return { x, y };
      seen.push(top?.getAttribute("class"));
    }
    return { x: NaN, y, seen: seen.slice(0, 6) };
  }, sel);
  assert.ok(Number.isFinite(p.x), `no uncovered point on ${sel}: ${JSON.stringify(p)}`);
  return p;
}

// Click the empty top-right of the pane (nothing sits there in the "flows" fixture).
const clickEmptyPane = async (page) => {
  await page.mouse.click(1150, 60);
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node.selected").length === 0);
};

async function confirmDialog(page) {
  const btn = page.locator("dialog[open] .w6w-modal-actions .w6w-btn-danger");
  await btn.waitFor({ state: "visible", timeout: 5000 });
  return btn;
}

// Arm "Draw section" and drag a frame around nodes a and b; returns the emitted def.
async function drawAB(page) {
  const a = await rectOf(page, '.react-flow__node[data-id="a"]');
  const b = await rectOf(page, '.react-flow__node[data-id="b"]');
  const pad = 24;
  const from = { x: Math.min(a.x, b.x) - pad, y: Math.min(a.y, b.y) - pad };
  const to = {
    x: Math.max(a.x + a.width, b.x + b.width) + pad,
    y: Math.max(a.y + a.height, b.y + b.height) + pad,
  };
  const n = await changeCount(page);
  await page.locator('[data-testid="draw-section"]').click();
  await page.waitForSelector('[data-testid="section-draw-surface"]');
  await dragBy(page, from, to.x - from.x, to.y - from.y);
  await waitForChange(page, n, "the drawn-section emission");
  assert.equal(await page.$('[data-testid="section-draw-surface"]'), null, "the tool disarms after one frame");
  const def = await lastChange(page);
  assert.equal(def.canvas.sections.length, 1, "one section emitted");
  assert.deepEqual([...def.canvas.sections[0].nodes].sort(), ["a", "b"], "members are the enclosed nodes");
  await clickEmptyPane(page);
  await quiesce(page);
  return await lastChange(page);
}

test("B3 note: add -> edit in place -> toolbar bold/title/colour -> move -> resize -> delete via the Modal", async () => {
  const page = await open({ q: "fixture=flows" });
  try {
    // add
    let n = await changeCount(page);
    await page.locator('[data-testid="add-note"]').click();
    await waitForChange(page, n);
    let def = await lastChange(page);
    assert.equal(def.canvas.notes.length, 1, "Add note emits one note");
    const id = def.canvas.notes[0].id;
    const sel = `[data-note-id="${id}"]`;
    const bar = `[data-note-toolbar="${id}"]`;
    await page.waitForSelector(sel);

    // edit in place: double-click the note, type, click away commits the Markdown
    const body = await uncoveredPoint(page, `${sel} [data-testid="note-view"]`);
    await page.mouse.dblclick(body.x, body.y);
    await page.waitForSelector(`${sel} [data-testid="note-content"][contenteditable]`);
    assert.equal(await page.$(`${sel} textarea`), null, "no textarea editor");
    n = await changeCount(page);
    await page.keyboard.type("Hello world");
    await clickEmptyPane(page);
    await waitForChange(page, n, "the edited-content emission");
    def = await lastChange(page);
    assert.equal(def.canvas.notes[0].content, "Hello world", "typed content emitted");

    // the toolbar floats ABOVE the note (not inside it) once the note is selected
    assert.equal(await page.$(bar), null, "no toolbar while unselected");
    await page.mouse.click(body.x, body.y);
    await page.waitForSelector(bar);
    const tb = await rectOf(page, bar);
    const box = await rectOf(page, sel);
    assert.ok(tb.y + tb.height <= box.y, `toolbar ${JSON.stringify(tb)} sits above the note ${JSON.stringify(box)}`);
    assert.equal(await page.$(`${sel} [data-testid="note-delete"]`), null, "no controls inside the note");

    // bold, then a title size: each writes Markdown
    n = await changeCount(page);
    await page.locator(`${bar} [data-testid="note-bold"]`).click();
    await waitForChange(page, n, "the bold emission");
    def = await lastChange(page);
    assert.equal(def.canvas.notes[0].content, "**Hello world**", "bold writes **…**");
    n = await changeCount(page);
    await page.locator(`${bar} [data-testid="note-size"]`).click();
    await page.locator(`${bar} [data-testid="note-size-1"]`).click();
    await waitForChange(page, n, "the title emission");
    def = await lastChange(page);
    assert.equal(def.canvas.notes[0].content, "# **Hello world**", "Title writes a level-1 heading");
    await clickEmptyPane(page);
    await page.waitForSelector(`${sel} h1 strong`);

    // recolor from the palette
    await page.mouse.click(body.x, body.y);
    await page.waitForSelector(bar);
    n = await changeCount(page);
    await page.locator(`${bar} [data-testid="note-color"]`).click();
    await page.locator(`${bar} [data-testid="note-color-option"][data-color="#f87171"]`).click();
    await waitForChange(page, n, "the recolor emission");
    def = await lastChange(page);
    assert.equal(def.canvas.notes[0].color, "#f87171", "recolor emitted");
    assert.equal(def.canvas.notes[0].content, "# **Hello world**", "recolor keeps the content");

    const z = await zoomOf(page);
    const pos0 = def.canvas.notes[0].position;
    // move: drag the note's strip so its resize handle lands in the empty band below every
    // node and between the two columns (clear of nodes, edges, the minimap and the controls)
    const gripAt = centre(await rectOf(page, `${bar} [data-testid="note-drag"]`));
    const h0 = centre(await rectOf(page, `${sel} [data-testid="note-resize"]`));
    const nodeRects = await page.evaluate(() =>
      [...document.querySelectorAll(".react-flow__node")].map((e) => {
        const r = e.getBoundingClientRect();
        return { id: e.getAttribute("data-id"), x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
    const colA = nodeRects.find((r) => r.id === "a");
    const colC = nodeRects.find((r) => r.id === "c");
    const target = {
      x: (colA.x + colA.width + colC.x) / 2,
      y: Math.max(...nodeRects.map((r) => r.y + r.height)) + 50,
    };
    const mdx = target.x - h0.x;
    const mdy = target.y - h0.y;
    n = await changeCount(page);
    await dragBy(page, gripAt, mdx, mdy);
    await waitForChange(page, n, "the note-move emission");
    def = await lastChange(page);
    const pos1 = def.canvas.notes[0].position;
    assert.ok(
      Math.abs(pos1.x - (pos0.x + mdx / z)) < 2 && Math.abs(pos1.y - (pos0.y + mdy / z)) < 2,
      `note moved by the drag delta: ${JSON.stringify(pos0)} -> ${JSON.stringify(pos1)} (zoom ${z})`,
    );
    assert.equal(def.canvas.notes[0].content, "# **Hello world**", "move keeps the content");
    assert.equal(def.canvas.notes[0].color, "#f87171", "move keeps the colour");

    // resize: drag the bottom-right handle; the size grows by the drag delta / zoom
    const before = def.canvas.notes[0].size;
    const handle = centre(await rectOf(page, `${sel} [data-testid="note-resize"]`));
    const top = await page.evaluate(
      (p) => {
        const el = document.elementsFromPoint(p.x, p.y)[0];
        const chain = [];
        for (let e = el; e && chain.length < 5; e = e.parentElement) chain.push(`${e.tagName}.${e.getAttribute("class")}`);
        return `${chain.join(" < ")} in-resize=${!!el?.closest('[data-testid="note-resize"]')} at ${p.x},${p.y}`;
      },
      handle,
    );
    assert.ok(top.includes("in-resize=true"), `the resize handle must be the top hit (not covered by a node): ${top}`);
    n = await changeCount(page);
    await dragBy(page, handle, 60, 40);
    await waitForChange(page, n, "the resize emission");
    def = await lastChange(page);
    const size = def.canvas.notes[0].size;
    assert.ok(
      Math.abs(size.width - (before.width + 60 / z)) < 2 && Math.abs(size.height - (before.height + 40 / z)) < 2,
      `size ${JSON.stringify(before)} -> ${JSON.stringify(size)} should grow by (60,40)/${z}`,
    );

    // delete: asks through the Modal first — nothing is emitted until Confirm
    n = await changeCount(page);
    await page.waitForSelector(bar);
    await page.locator(`${bar} [data-testid="note-delete"]`).click();
    const confirm = await confirmDialog(page);
    assert.equal(await changeCount(page), n, "no emission before the Modal is confirmed");
    // Cancel keeps the note...
    await page.locator("dialog[open] .w6w-modal-actions .w6w-btn-ghost").click();
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    assert.equal(await changeCount(page), n, "cancel emits nothing");
    assert.ok(await page.$(sel), "cancel keeps the note");
    // ...Confirm deletes it.
    const again = await uncoveredPoint(page, `${sel} [data-testid="note-view"]`);
    await page.mouse.click(again.x, again.y);
    await page.locator(`${bar} [data-testid="note-delete"]`).click();
    await (await confirmDialog(page)).click();
    await waitForChange(page, n, "the note-delete emission");
    def = await lastChange(page);
    assert.ok(!(def.canvas?.notes ?? []).some((x) => x.id === id), "note gone from the emitted canvas");
    assert.equal(def.nodes.length, 4, "deleting a note never touches nodes");
    void confirm;
  } finally {
    await page.close();
  }
});

test("B3 section: draw a frame around 2 nodes -> drag the section; both members move by the delta, one emission", async () => {
  const page = await open({ q: "fixture=flows" });
  try {
    const grouped = await drawAB(page);
    const sec0 = grouped.canvas.sections[0];
    const aBefore = nodeById(grouped, "a").position;
    const bBefore = nodeById(grouped, "b").position;
    const cBefore = nodeById(grouped, "c").position;
    const z = await zoomOf(page);

    const from = await uncoveredPoint(page, `[data-section-label="${sec0.id}"]`);
    const n = await changeCount(page);
    await dragBy(page, from, 90, 60);
    await waitForChange(page, n);
    await page.waitForTimeout(200);
    const emitted = (await page.evaluate((k) => window.__changes.slice(k), n)).map(
      (d) => `a=${JSON.stringify(nodeById(d, "a").position)} sec=${JSON.stringify(d.canvas.sections[0].position)}`,
    );
    assert.equal(emitted.length, 1, `exactly ONE emission per section drop, got: ${emitted.join(" ;; ")}`);
    const def = await lastChange(page);
    const dx = 90 / z;
    const dy = 60 / z;
    for (const [id, p0] of [["a", aBefore], ["b", bBefore]]) {
      const p = nodeById(def, id).position;
      assert.ok(
        Math.abs(p.x - (p0.x + dx)) < 2 && Math.abs(p.y - (p0.y + dy)) < 2,
        `member ${id} moved by the drag delta: ${JSON.stringify(p0)} -> ${JSON.stringify(p)} (want +${dx.toFixed(1)},+${dy.toFixed(1)})`,
      );
    }
    assert.deepEqual(nodeById(def, "c").position, cBefore, "a non-member does not move");
    const sec = def.canvas.sections[0];
    assert.ok(
      Math.abs(sec.position.x - (sec0.position.x + dx)) < 2 && Math.abs(sec.position.y - (sec0.position.y + dy)) < 2,
      `section frame moved by the same delta: ${JSON.stringify(sec0.position)} -> ${JSON.stringify(sec.position)}`,
    );
    assert.deepEqual([...sec.nodes].sort(), ["a", "b"], "membership unchanged by a section drag");
  } finally {
    await page.close();
  }
});

test("B3 section toolbar: label above the frame -> select -> toolbar above it (anchor, label, colour, delete) -> rename, recolor, move", async () => {
  const page = await open({ q: "fixture=flows" });
  try {
    const grouped = await drawAB(page);
    const id = grouped.canvas.sections[0].id;
    const sel = `[data-section-id="${id}"]`;
    const label = `[data-section-label="${id}"]`;
    const bar = `[data-section-toolbar="${id}"]`;

    // nothing inside the frame but the resize corner; the label sits above it
    assert.equal(await page.$(`${sel} input, ${sel} button`), null, "no controls inside the frame");
    assert.equal(await page.$(bar), null, "no toolbar while unselected");
    let box = await rectOf(page, sel);
    const lr = await rectOf(page, label);
    assert.ok(lr.y + lr.height <= box.y + 1, `label ${JSON.stringify(lr)} sits above the frame ${JSON.stringify(box)}`);
    assert.equal(await page.locator(label).textContent(), "Section");

    // a click on the label selects: the toolbar takes the label's place, above the frame
    const at = await uncoveredPoint(page, label);
    await page.mouse.click(at.x, at.y);
    await page.waitForSelector(bar);
    assert.equal(await page.$(label), null, "the toolbar replaces the label");
    const tb = await rectOf(page, bar);
    assert.ok(tb.y + tb.height <= box.y, `toolbar ${JSON.stringify(tb)} sits above the frame ${JSON.stringify(box)}`);
    for (const t of ["section-drag", "section-title", "section-color", "section-delete"]) {
      assert.ok(await page.$(`${bar} [data-testid="${t}"]`), `${t} is on the toolbar`);
    }
    assert.equal(await page.locator(`${bar} [data-testid="section-title"]`).inputValue(), "Section");
    // a host's global `input[type="text"] { width: 100% }` (Studio has one) must not collapse
    // the label field inside the toolbar's flex row
    await page.addStyleTag({ content: 'input[type="text"] { width: 100%; margin-top: 4px; }' });
    const field = await page.locator(`${bar} [data-testid="section-title"]`).evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      text: el.scrollWidth,
    }));
    assert.ok(field.width >= 60 && field.width + 1 >= field.text, `label field is readable: ${JSON.stringify(field)}`);

    // rename: one emission, on Enter
    let n = await changeCount(page);
    await page.locator(`${bar} [data-testid="section-title"]`).fill("Intake");
    assert.equal(await changeCount(page), n, "typing does not emit");
    await page.keyboard.press("Enter");
    await waitForChange(page, n, "the rename emission");
    let def = await lastChange(page);
    assert.equal(def.canvas.sections[0].title, "Intake");

    // recolor from the palette
    n = await changeCount(page);
    await page.locator(`${bar} [data-testid="section-color"]`).click();
    await page.locator(`${bar} [data-testid="section-color-option"][data-color="#60a5fa"]`).click();
    await waitForChange(page, n, "the recolor emission");
    def = await lastChange(page);
    assert.equal(def.canvas.sections[0].color, "#60a5fa");

    // the anchor moves the section and its members
    const z = await zoomOf(page);
    const a0 = nodeById(def, "a").position;
    const s0 = def.canvas.sections[0].position;
    const grip = centre(await rectOf(page, `${bar} [data-testid="section-drag"]`));
    n = await changeCount(page);
    await dragBy(page, grip, 80, 50);
    await waitForChange(page, n, "the anchor-move emission");
    def = await lastChange(page);
    const s1 = def.canvas.sections[0].position;
    const a1 = nodeById(def, "a").position;
    assert.ok(Math.abs(s1.x - (s0.x + 80 / z)) < 2 && Math.abs(s1.y - (s0.y + 50 / z)) < 2, `frame moved ${JSON.stringify(s0)} -> ${JSON.stringify(s1)}`);
    assert.ok(Math.abs(a1.x - (a0.x + 80 / z)) < 2 && Math.abs(a1.y - (a0.y + 50 / z)) < 2, `member moved ${JSON.stringify(a0)} -> ${JSON.stringify(a1)}`);
    box = await rectOf(page, sel);
    const tb2 = await rectOf(page, bar);
    assert.ok(tb2.y + tb2.height <= box.y && Math.abs(tb2.x - box.x) < 2, "the toolbar follows the frame");

    // a press outside deselects; the label returns with the new title
    await clickEmptyPane(page);
    await page.waitForSelector(label);
    assert.equal(await page.$(bar), null);
    assert.equal(await page.locator(label).textContent(), "Intake");

    // delete via the toolbar, confirmed through the Modal
    const at2 = await uncoveredPoint(page, label);
    await page.mouse.click(at2.x, at2.y);
    n = await changeCount(page);
    await page.locator(`${bar} [data-testid="section-delete"]`).click();
    await (await confirmDialog(page)).click();
    await waitForChange(page, n, "the section-delete emission");
    def = await lastChange(page);
    assert.equal((def.canvas?.sections ?? []).length, 0, "section gone");
    assert.equal(def.nodes.length, 4, "deleting a section never touches nodes");
  } finally {
    await page.close();
  }
});

test("B3 membership: dragging a member node out of its section removes it from the section's nodes[]", async () => {
  const page = await open({ q: "fixture=flows" });
  try {
    await drawAB(page);
    const a = centre(await rectOf(page, '.react-flow__node[data-id="a"]'));
    const n = await changeCount(page);
    await dragBy(page, a, 330, -70);
    await waitForChange(page, n);
    const def = await lastChange(page);
    assert.deepEqual(def.canvas.sections[0].nodes, ["b"], "a left the section; b stays");
    assert.ok(nodeById(def, "a"), "dragging out never deletes the node");
  } finally {
    await page.close();
  }
});

test("B3 prune: deleting a member node removes it from the section (the frame and the other member stay)", async () => {
  const page = await open({ q: "fixture=flows" });
  try {
    await drawAB(page);
    const b = centre(await rectOf(page, '.react-flow__node[data-id="b"]'));
    await page.mouse.click(b.x, b.y);
    await page.waitForSelector('.react-flow__node[data-id="b"].selected');
    const n = await changeCount(page);
    await page.locator('button[aria-label="Delete node"]').click();
    await (await confirmDialog(page)).click();
    await waitForChange(page, n);
    const def = await lastChange(page);
    assert.ok(!nodeById(def, "b"), "b deleted");
    assert.equal(def.canvas.sections.length, 1, "the section frame survives");
    assert.deepEqual(def.canvas.sections[0].nodes, ["a"], "b pruned from the section");
  } finally {
    await page.close();
  }
});

test("B3 rename: renaming a member node remaps it inside the section", async () => {
  const page = await open({ q: "fixture=flows" });
  try {
    await drawAB(page);
    const b = centre(await rectOf(page, '.react-flow__node[data-id="b"]'));
    await page.mouse.dblclick(b.x, b.y);
    await page.locator('button[aria-label="Rename node"]').click();
    const n = await changeCount(page);
    const input = page.locator(".w6w-step-rename input");
    await input.fill("b_renamed");
    await input.press("Enter");
    await waitForChange(page, n);
    const def = await lastChange(page);
    assert.ok(nodeById(def, "b_renamed") && !nodeById(def, "b"), "node renamed");
    assert.deepEqual([...def.canvas.sections[0].nodes].sort(), ["a", "b_renamed"], "section member remapped");
    assert.ok(
      def.edges.every((e) => e.from !== "b" && e.to !== "b"),
      "edges re-pointed too",
    );
  } finally {
    await page.close();
  }
});

test("B3 savePosition:false: a moved note renders live but its stored position is unchanged in the emitted definition", async () => {
  const page = await open({ q: "save=0" });
  try {
    const noteBefore = await rectOf(page, '[data-note-id="n1"]');
    const grip = await uncoveredPoint(page, '[data-note-id="n1"] [data-testid="note-view"]');
    const n = await changeCount(page);
    await dragBy(page, grip, 60, 30);
    await page.waitForTimeout(300);
    const noteAfter = await rectOf(page, '[data-note-id="n1"]');
    assert.ok(
      noteAfter.x > noteBefore.x + 20 && noteAfter.y > noteBefore.y + 10,
      `the note renders at its live position: ${JSON.stringify(noteBefore)} -> ${JSON.stringify(noteAfter)}`,
    );
    // Whether or not an emission happened, every emitted definition keeps the stored geometry.
    const all = await page.evaluate((k) => window.__changes.slice(k), n);
    for (const d of all) {
      const n1 = d.canvas.notes.find((x) => x.id === "n1");
      assert.deepEqual(n1.position, { x: 260, y: -40 }, "stored note position unchanged");
      assert.deepEqual(n1.size, { width: 320, height: 160 }, "stored note size unchanged");
    }
    // Control: the same drag with savePosition on DOES persist (so the check above can fail).
    const page2 = await open();
    try {
      const g2 = await uncoveredPoint(page2, '[data-note-id="n1"] [data-testid="note-view"]');
      const n2 = await changeCount(page2);
      await dragBy(page2, g2, 60, 30);
      await waitForChange(page2, n2);
      const d2 = await lastChange(page2);
      assert.ok(d2.canvas.notes.find((x) => x.id === "n1").position.x > 260, "control: position persists when savePosition is on");
    } finally {
      await page2.close();
    }
  } finally {
    await page.close();
  }
});

test("B4 settles: a host that feeds onChange back into value stops committing once idle (no render loop)", async () => {
  const page = await open({ q: "fixture=flows" });
  try {
    // An idle editor must go quiet. A render loop (e.g. a selection handler that sets a fresh
    // array each call, which React Flow re-invokes after every render) keeps committing forever —
    // a plain page merely burns CPU, but Storybook's act()-wrapped renderer freezes on it.
    const quiet = async (label) => {
      const a = await page.evaluate(() => window.__commits);
      await page.waitForTimeout(800);
      const b = await page.evaluate(() => window.__commits);
      assert.ok(a > 0, `${label}: the commit counter is live (control), got ${a}`);
      assert.ok(b - a <= 2, `${label}: ${b - a} commits in 800ms of idle — the editor is re-rendering in a loop`);
    };
    await quiet("after mount");
    // The same through the selection path: click a node, then idle again.
    const node = await rectOf(page, '.react-flow__node[data-id="a"]');
    await page.mouse.click(node.x + node.width / 2, node.y + node.height / 2);
    await page.waitForTimeout(300);
    await quiet("after selecting a node");
  } finally {
    await page.close();
  }
});

// B5: every port adds a step. The "app" fixture is one lone registry-app step `p` —
// the state a freshly added catalog action is in.
const pickerOpen = (page) =>
  page.evaluate(() => [...document.querySelectorAll("h1,h2,h3")].some((h) => h.textContent === "Add a node"));
const portOf = async (page, side) =>
  centre(await rectOf(page, `.react-flow__node[data-id="p"] .react-flow__handle-${side}`));

// Drag out of p's `side` port and let go on empty canvas, `dx`/`dy` away.
async function dragOut(page, side, dx, dy) {
  const from = await portOf(page, side);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 3, from.y + dy / 3, { steps: 6 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
  await page.mouse.up();
}

async function addMerge(page, gesture) {
  const before = await page.evaluate(() => window.__changes.length);
  await gesture();
  assert.ok(await pickerOpen(page), "the gesture opens the step picker");
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.getByRole("button", { name: /Merge/ }).click();
  await page.waitForFunction((n) => window.__changes.length > n, before);
  const wf = await page.evaluate(() => window.__changes[window.__changes.length - 1]);
  // The new step opens on its config modal; close it to get back to the canvas.
  await page.waitForSelector('dialog[aria-label="Merge"]');
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog[open]", { state: "detached" });
  return wf;
}

test("B5 ports: dragging any port to empty canvas (or clicking it) adds a step wired to that port", async () => {
  const page = await open({ q: "fixture=app" });
  const ids = new Set(["p"]);
  const fresh = (wf) => {
    const n = wf.nodes.find((x) => !ids.has(x.id));
    assert.ok(n, `a step was added: ${JSON.stringify(wf.nodes)}`);
    ids.add(n.id);
    return n;
  };

  // Exit → the next step, wired p -> new on the success lane, at the drop point.
  let wf = await addMerge(page, () => dragOut(page, "right", 240, 40));
  let added = fresh(wf);
  assert.deepEqual(
    wf.edges.map((e) => [e.from, e.to, e.when ?? "success"]),
    [["p", added.id, "success"]],
  );
  assert.ok(added.position.x > wf.nodes.find((n) => n.id === "p").position.x, "dropped right of p");
  await page.waitForSelector(`.react-flow__edge[data-id="p->${added.id}"]`);

  // Entry → a step before p.
  wf = await addMerge(page, () => dragOut(page, "left", -260, 120));
  added = fresh(wf);
  assert.ok(wf.edges.some((e) => e.from === added.id && e.to === "p"), JSON.stringify(wf.edges));
  await page.waitForSelector(`.react-flow__edge[data-id="${added.id}->p"]`);

  // Error exit → a step on p's error lane.
  wf = await addMerge(page, () => dragOut(page, "bottom", 60, 260));
  added = fresh(wf);
  assert.ok(
    wf.edges.some((e) => e.from === "p" && e.to === added.id && e.when === "error"),
    JSON.stringify(wf.edges),
  );

  // A plain click on a port (no drag) opens the picker too — never the library's
  // silent click-to-connect mode.
  const right = await portOf(page, "right");
  await page.mouse.click(right.x, right.y);
  assert.ok(await pickerOpen(page), "a click on the exit port opens the picker");
  await page.keyboard.press("Escape");
});

test("B6 trigger shape: a trigger's card is a half-pill (round entry edge); a sibling control card is not", async () => {
  const page = await open({ q: "fixture=trigger" });
  const card = (id) =>
    page.evaluate((nid) => {
      const el = document.querySelector(`.react-flow__node[data-id="${nid}"] [data-run-status]`);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        kind: el.getAttribute("data-node-kind"),
        tl: parseFloat(cs.borderTopLeftRadius),
        bl: parseFloat(cs.borderBottomLeftRadius),
        tr: parseFloat(cs.borderTopRightRadius),
        br: parseFloat(cs.borderBottomRightRadius),
        padL: parseFloat(cs.paddingLeft),
        h: r.height,
      };
    }, id);
  const t = await card("t");
  const h = await card("h");
  assert.ok(t && h, "both cards render");
  assert.equal(t.kind, "trigger");
  assert.equal(h.kind, null, "a non-trigger control card carries no data-node-kind");
  // Half-pill: the entry (left) corners are at least half the card height — fully round —
  // and the exit (right) corners are the plain card's own corners.
  assert.ok(t.tl >= t.h / 2 && t.bl >= t.h / 2, `trigger left radius ${t.tl}/${t.bl} vs height ${t.h}`);
  assert.equal(t.tr, h.tr, "trigger's right corners match a plain card's");
  assert.equal(t.br, h.br);
  assert.ok(h.tl < h.h / 2, `plain card stays a rounded rect: ${h.tl} vs height ${h.h}`);
  assert.equal(h.tl, h.tr, "plain card's corners are uniform");
  assert.ok(t.padL > h.padL, `trigger's left inset ${t.padL} clears the curve (plain ${h.padL})`);
});
