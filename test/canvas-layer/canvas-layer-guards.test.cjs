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

// Select a and b with ctrl+click, press "Group into section"; returns the emitted def.
async function groupAB(page) {
  const a = centre(await rectOf(page, '.react-flow__node[data-id="a"]'));
  const b = centre(await rectOf(page, '.react-flow__node[data-id="b"]'));
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down("Control");
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up("Control");
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node.selected").length === 2);
  const n = await changeCount(page);
  const group = page.locator('[data-testid="group-section"]');
  assert.equal(await group.isEnabled(), true, "Group into section must be enabled with 2 nodes selected");
  await group.click();
  await waitForChange(page, n);
  const def = await lastChange(page);
  assert.equal(def.canvas.sections.length, 1, "one section emitted");
  assert.deepEqual([...def.canvas.sections[0].nodes].sort(), ["a", "b"], "section members are the selected nodes");
  await clickEmptyPane(page);
  await quiesce(page);
  return await lastChange(page);
}

test("B3 note: add -> edit content -> recolor -> resize -> delete via the Modal", async () => {
  const page = await open({ q: "fixture=flows" });
  try {
    // Group into section is disabled with nothing selected.
    assert.equal(await page.locator('[data-testid="group-section"]').isEnabled(), false);

    // add
    let n = await changeCount(page);
    await page.locator('[data-testid="add-note"]').click();
    await waitForChange(page, n);
    let def = await lastChange(page);
    assert.equal(def.canvas.notes.length, 1, "Add note emits one note");
    const id = def.canvas.notes[0].id;
    const sel = `[data-note-id="${id}"]`;
    await page.waitForSelector(sel);

    // edit content (Markdown): open the editor, type, blur commits
    n = await changeCount(page);
    await page.locator(`${sel} [data-testid="note-edit"]`).click();
    const ta = page.locator(`${sel} [data-testid="note-content"]`);
    await ta.fill("**bold** text");
    await ta.evaluate((el) => el.blur());
    await waitForChange(page, n, "the edited-content emission");
    def = await lastChange(page);
    assert.equal(def.canvas.notes[0].content, "**bold** text", "edited content emitted");
    await page.waitForSelector(`${sel} strong`);

    // recolor
    n = await changeCount(page);
    await page.locator(`${sel} [data-testid="note-color"]`).fill("#ff0000");
    await waitForChange(page, n, "the recolor emission");
    def = await lastChange(page);
    assert.equal(def.canvas.notes[0].color, "#ff0000", "recolor emitted");
    assert.equal(def.canvas.notes[0].content, "**bold** text", "recolor keeps the content");

    const z = await zoomOf(page);
    const pos0 = def.canvas.notes[0].position;
    // move: drag the note's strip so its resize handle lands in the empty band below every
    // node and between the two columns (clear of nodes, edges, the minimap and the controls)
    const gripAt = await uncoveredPoint(page, `${sel} [data-testid="note-drag"]`);
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
    assert.equal(def.canvas.notes[0].content, "**bold** text", "move keeps the content");
    assert.equal(def.canvas.notes[0].color, "#ff0000", "move keeps the colour");

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
    await page.locator(`${sel} [data-testid="note-delete"]`).click();
    const confirm = await confirmDialog(page);
    assert.equal(await changeCount(page), n, "no emission before the Modal is confirmed");
    // Cancel keeps the note...
    await page.locator("dialog[open] .w6w-modal-actions .w6w-btn-ghost").click();
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    assert.equal(await changeCount(page), n, "cancel emits nothing");
    assert.ok(await page.$(sel), "cancel keeps the note");
    // ...Confirm deletes it.
    await page.locator(`${sel} [data-testid="note-delete"]`).click();
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

test("B3 section: select 2 nodes -> Group into section -> drag the section; both members move by the delta, one emission", async () => {
  const page = await open({ q: "fixture=flows" });
  try {
    const grouped = await groupAB(page);
    const sec0 = grouped.canvas.sections[0];
    const aBefore = nodeById(grouped, "a").position;
    const bBefore = nodeById(grouped, "b").position;
    const cBefore = nodeById(grouped, "c").position;
    const z = await zoomOf(page);

    const bar = await rectOf(page, `[data-section-id="${sec0.id}"] [data-testid="section-drag"]`);
    const from = { x: bar.x + bar.width - 6, y: bar.y + bar.height / 2 };
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

test("B3 membership: dragging a member node out of its section removes it from the section's nodes[]", async () => {
  const page = await open({ q: "fixture=flows" });
  try {
    await groupAB(page);
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
    await groupAB(page);
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
    await groupAB(page);
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
    const grip = await rectOf(page, '[data-note-id="n1"] [data-testid="note-drag"]');
    const n = await changeCount(page);
    await dragBy(page, { x: grip.x + 8, y: grip.y + grip.height / 2 }, 60, 30);
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
      const g2 = await rectOf(page2, '[data-note-id="n1"] [data-testid="note-drag"]');
      const n2 = await changeCount(page2);
      await dragBy(page2, { x: g2.x + 8, y: g2.y + g2.height / 2 }, 60, 30);
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
