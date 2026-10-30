// Browser gate for the For each loop authoring flow. Mounts the REAL WorkflowFlowEditor /
// ExecutionLogPanel, bundled from source by ./run.sh, into real Chromium via
// harness-entry.tsx — no jsdom (it performs no layout, hit-testing or pointer drags).
// The fixture "F0" is written out literally here and, separately, in harness-entry.tsx.
//
// G1: a legacy definition (a For each wired straight to its follower) loads with that edge on the
//     Each item handle, the card shows Each item / Done, and the "converted" notice is visible.
// G2: both problems are flagged; each fix applies on its own; nothing is rewritten on load.
// G3: the picker of a loop-body field offers Loop > Current item / Index / the item's fields, and
//     never the For each's own output; upstream steps stay offered.
// G4: a real drag from outside onto a loop-body step is refused with a visible alert.
// G4b: a real drag from the For each's own Done handle onto its first body step is refused.
// G6: a problems feed present on the FIRST render is flagged (not wiped by the mount reseed).
// G5: the run log shows "6 items", preselects the failed iteration and switches iterations.
//
// Every assertion is a RELATION between live measurements or an independent literal.
const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const pw = require(process.env.PW_CORE_MOUNT || "/pw");
const ENGINE = process.env.ENGINE || "chromium";
const engine = pw[ENGINE];
if (!engine) throw new Error(`no such browser engine: ${ENGINE}`);
const DIR = process.env.BUNDLE_DIR || "/w";

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>foreach-loop</title>
<link rel="stylesheet" href="/ui.css">
</head><body style="margin:0"><div id="root"></div>
<script src="/bundle.js"></script></body></html>`;

// F0 (literal): the fixed definition, projected as {id, uses, with} / {from, to}.
const ITEMS = "{{ nodes.eventbrite_to_cohost_1.output.tickets }}";
const OLD_TICKET = "{{ nodes.for_each_1.output }}";
const F0_FIXED = {
  nodes: [
    { id: "create_event_1", uses: { app: "stub-events", action: "create-event" } },
    { id: "eventbrite_to_cohost_1", uses: { app: "stub-source", action: "list-tickets" } },
    {
      id: "for_each_1",
      uses: { app: "@w6w/control", action: "foreach" },
      with: { items: ITEMS, body: ["update_event_ticket_1"] },
    },
    {
      id: "update_event_ticket_1",
      uses: { app: "stub-cohost", action: "update-event-ticket" },
      with: { event: "{{ nodes.create_event_1.output.id }}", ticket: "{{ foreach.item }}" },
    },
  ],
  edges: [
    { from: "create_event_1", to: "eventbrite_to_cohost_1" },
    { from: "eventbrite_to_cohost_1", to: "for_each_1" },
  ],
};
const ITEM_FIELDS = ["name", "sourceId", "price", "quantity"];
// G5 (literals): ticket i's posted output.
const POSTED = [
  "posted-src_101-Early bird",
  "posted-src_102-General",
  "posted-src_103-VIP",
  "posted-src_104-Student",
  "posted-src_105-Group of 5",
  "posted-src_106-Backstage",
];

let browser;
before(async () => {
  browser = await engine.launch({ args: ["--no-sandbox"] });
});
after(async () => {
  if (browser) await browser.close();
});

async function open(fixture, query = "") {
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
  await page.goto(`http://foreach-loop.test/?fixture=${fixture}${query}`);
  await page.waitForFunction(() => window.__mounted === true, null, { timeout: 10000 });
  if (fixture === "log") await page.waitForSelector(".w6w-execution-log");
  else {
    await page.waitForSelector(".react-flow__node");
    await settle(page);
    // The host's problems feed lands a tick after mount (like the embed host's lazy import).
    await page.waitForTimeout(300);
  }
  if (errs.length) throw new Error(`pageerror mounting ${fixture}: ${errs.join("; ")}`);
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
const inside = (r, p, slack = 0) =>
  p.x >= r.x - slack &&
  p.x <= r.x + r.width + slack &&
  p.y >= r.y - slack &&
  p.y <= r.y + r.height + slack;

const card = (id) => `.react-flow__node[data-id="${id}"] [data-run-status]`;
const SRC_DONE = (id) => `.react-flow__node[data-id="${id}"] .source:not([data-handleid])`;
const SRC_EACH = (id) => `.react-flow__node[data-id="${id}"] [data-handleid="out-each"]`;
const TARGET = (id) => `.react-flow__node[data-id="${id}"] .target`;

// A node's bounding box also covers its meta line and its error handle, so a double-click on the
// CARD is what opens the step editor.
async function openEditor(page, id) {
  const r = await rectOf(page, card(id));
  assert.ok(r, `no card for ${id}`);
  const p = centre(r);
  await page.mouse.dblclick(p.x, p.y);
  await page.waitForSelector("dialog[open]");
  await page.waitForTimeout(300);
}
async function closeEditor(page) {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
}
const changes = (page) => page.evaluate(() => window.__changes);
const latest = async (page) => {
  const all = await changes(page);
  assert.ok(all.length > 0, "the editor emitted no change");
  return all.at(-1);
};
const nodeOf = (wf, id) => wf.nodes.find((n) => n.id === id);
const project = (wf) => ({
  nodes: wf.nodes.map(({ id, uses, with: w }) => JSON.parse(JSON.stringify({ id, uses, with: w }))),
  edges: wf.edges.map(({ from, to }) => ({ from, to })),
});

// The rendered start of an edge's path, in screen coordinates.
const edgeStart = (page, edgeId) =>
  page.evaluate((id) => {
    const p = document.querySelector(`.react-flow__edge[data-id="${id}"] .react-flow__edge-path`);
    if (!p) return null;
    const q = p.getPointAtLength(0);
    const s = new DOMPoint(q.x, q.y).matrixTransform(p.getScreenCTM());
    return { x: s.x, y: s.y };
  }, edgeId);

test("G1: a legacy For each loads with its follower on the Each item handle, Each item / Done labels and the converted notice", async () => {
  const page = await open("legacy");
  try {
    const start = await edgeStart(page, "for_each_1->update_event_ticket_1");
    assert.ok(start, "the for_each_1->update_event_ticket_1 edge is rendered");
    const each = await rectOf(page, SRC_EACH("for_each_1"));
    const done = await rectOf(page, SRC_DONE("for_each_1"));
    assert.ok(each && done, "both for_each_1 source handles exist");
    assert.ok(
      inside(each, start, 1),
      `the edge starts ${JSON.stringify(start)}, outside the Each item handle ${JSON.stringify(each)}`,
    );
    assert.ok(
      !inside(done, start, 1),
      `the edge starts ${JSON.stringify(start)} on the Done handle ${JSON.stringify(done)}`,
    );
    const cardText = await page.locator(card("for_each_1")).innerText();
    assert.ok(cardText.includes("Each item"), `card text: ${cardText}`);
    assert.ok(cardText.includes("Done"), `card text: ${cardText}`);
    const notice = page.getByText("converted from an older definition");
    assert.equal(await notice.count(), 1, "exactly one converted notice");
    assert.ok(await notice.isVisible(), "the converted notice is visible");
    assert.equal((await changes(page)).length, 0, "loading emitted a change (nothing rewrites on load)");
  } finally {
    await page.close();
  }
});

test("G2: both problems are flagged; the Items fix and the refs fix apply independently and fully", async () => {
  const page = await open("legacy");
  try {
    for (const [id, code] of [
      ["for_each_1", "foreach_wrapped_items"],
      ["update_event_ticket_1", "foreach_body_refs_output"],
    ]) {
      const n = `.react-flow__node[data-id="${id}"]`;
      assert.equal(await page.locator(`${n} [data-step-problem~="${code}"]`).count(), 1, `${id}: ${code}`);
      assert.ok(await page.locator(`${n} [data-step-problem-badge]`).isVisible(), `${id}: badge`);
    }
    assert.equal((await changes(page)).length, 0, "problems shown, nothing rewritten yet");

    await openEditor(page, "for_each_1");
    await page.locator('button[data-fix-code="foreach_wrapped_items"]').click();
    await page.waitForTimeout(300);
    const afterItems = await latest(page);
    assert.equal(nodeOf(afterItems, "for_each_1").with.items, ITEMS, "Items unwrapped");
    assert.equal(
      nodeOf(afterItems, "update_event_ticket_1").with.ticket,
      OLD_TICKET,
      "the Items fix alone must leave the ticket reference untouched",
    );
    await closeEditor(page);

    await openEditor(page, "update_event_ticket_1");
    await page.locator('button[data-fix-code="foreach_body_refs_output"]').click();
    await page.waitForTimeout(300);
    const done = await latest(page);
    assert.deepStrictEqual(project(done), F0_FIXED);
    assert.ok(!JSON.stringify(done).includes("nodes.for_each_1.output"), "a stale loop ref remains");
  } finally {
    await page.close();
  }
});

test("G3: the picker of a loop-body field offers Loop > Current item / Index / the item's fields, not the For each's output", async () => {
  const page = await open("fixed");
  try {
    await openEditor(page, "update_event_ticket_1");
    await page.locator('button[aria-label="Edit expression for Ticket"]').click();
    const group = '[data-testid="expr-loop-group"]';
    await page.waitForSelector(group);
    const rail = page.locator("aside.w6w-exprmodal-sources");
    const railText = await rail.innerText();
    assert.ok(/\bLoop\b/i.test(railText), `a "Loop" group heading: ${railText}`);
    const labels = (await page.locator(`${group} .w6w-exprmodal-source-label`).allInnerTexts()).map(
      (t) => t.trim(),
    );
    assert.ok(labels.includes("Current item"), `labels: ${labels}`);
    assert.ok(labels.includes("Index"), `labels: ${labels}`);
    const fields = labels.filter((l) => l !== "Current item" && l !== "Index");
    for (const f of ITEM_FIELDS) assert.ok(fields.includes(f), `item field ${f} missing from ${fields}`);
    assert.deepStrictEqual([...fields].sort(), [...ITEM_FIELDS].sort());
    assert.ok(railText.includes("create_event_1"), "create_event_1 is offered (positive pairing)");

    // Clicking a rail entry saves its reference into the field at once (the picker closes), so
    // the "draft" is the field's saved value on the latest emitted definition.
    const ticket = async () => nodeOf(await latest(page), "update_event_ticket_1").with.ticket;
    const entries = "aside.w6w-exprmodal-sources .w6w-exprmodal-source";
    const total = await page.locator(entries).count();
    assert.ok(total >= 8, `expected the loop rows plus upstream entries, got ${total}`);
    const inserted = [];
    for (let i = 0; i < total; i++) {
      if (i > 0) {
        await page.locator('button[aria-label="Edit expression for Ticket"]').click();
        await page.waitForSelector(group);
      }
      await page.locator(entries).nth(i).click();
      await page.waitForFunction(() => !document.querySelector("aside.w6w-exprmodal-sources"));
      inserted.push(await ticket());
    }
    // Every rail entry, clicked in turn: none puts the For each's own output into the field.
    for (const d of inserted) {
      assert.ok(!/(nodes|steps)\.for_each_1\.output/.test(d), `a rail entry inserted: ${d}`);
    }
    // Inserting `name` puts exactly its item-field reference in the draft.
    const nameIdx = labels.indexOf("name");
    assert.equal(inserted[nameIdx], "{{ foreach.item.name }}", `inserted refs: ${inserted}`);
    assert.ok(
      inserted.some((d) => d.includes("create_event_1")),
      `no entry inserted a create_event_1 ref: ${inserted}`,
    );
  } finally {
    await page.close();
  }
});

test("G4: dragging a connection from outside the loop onto a body step is refused with a visible alert", async () => {
  const page = await open("fixed");
  try {
    assert.equal(await page.locator('[role="alert"]:visible').count(), 0, "no alert before the drag");
    const from = centre(await rectOf(page, SRC_DONE("create_event_1")));
    const to = centre(await rectOf(page, TARGET("update_event_ticket_1")));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2 - 20, { steps: 8 });
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const alert = page.locator('[role="alert"]:visible');
    assert.ok((await alert.count()) >= 1, "a visible role=alert refusal");
    assert.ok((await alert.first().innerText()).trim().length > 0, "the refusal carries a reason");
    for (const wf of await changes(page)) {
      assert.ok(
        !wf.edges.some((e) => e.from === "create_event_1" && e.to === "update_event_ticket_1"),
        "the refused edge was written",
      );
      assert.ok(
        nodeOf(wf, "for_each_1").with.body.includes("update_event_ticket_1"),
        "the body step was evicted from the loop",
      );
    }
  } finally {
    await page.close();
  }
});

test("G4b: dragging from the For each's own Done handle onto its body step is refused with the outside_inbound reason", async () => {
  const page = await open("fixed");
  try {
    assert.equal(await page.locator('[role="alert"]:visible').count(), 0, "no alert before the drag");
    const from = centre(await rectOf(page, SRC_DONE("for_each_1")));
    const to = centre(await rectOf(page, TARGET("update_event_ticket_1")));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2 - 20, { steps: 8 });
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const alert = page.locator('[role="alert"]:visible');
    assert.ok((await alert.count()) >= 1, "a visible role=alert refusal");
    // Independent literal: the reason message src/flow-loop.ts ships for outside_inbound.
    const REASON =
      "This step is inside a loop, so nothing outside it can connect into it. Connect from the loop's Each item side instead.";
    assert.ok((await alert.first().innerText()).includes(REASON), await alert.first().innerText());
    assert.equal(await page.locator("dialog[open]").count(), 0, "the step builder opened");
    for (const wf of await changes(page)) {
      assert.ok(
        !wf.edges.some((e) => e.from === "for_each_1" && e.to === "update_event_ticket_1"),
        "the refused Done edge was written",
      );
    }
  } finally {
    await page.close();
  }
});

test("G6: a problems feed supplied on the first render is flagged on the expected nodes", async () => {
  const page = await open("legacy", "&problems=mount");
  try {
    for (const [id, code] of [
      ["for_each_1", "foreach_wrapped_items"],
      ["update_event_ticket_1", "foreach_body_refs_output"],
    ]) {
      const n = `.react-flow__node[data-id="${id}"]`;
      assert.equal(await page.locator(`${n} [data-step-problem~="${code}"]`).count(), 1, `${id}: ${code}`);
      assert.ok(await page.locator(`${n} [data-step-problem-badge]`).isVisible(), `${id}: badge`);
    }
  } finally {
    await page.close();
  }
});

test("G5: the run log summarises 6 items, preselects the failed iteration and switches iterations", async () => {
  const page = await open("log");
  try {
    const row = page.locator("li.w6w-execution-log-row").first();
    assert.ok((await row.innerText()).includes("6 items"), `row text: ${await row.innerText()}`);
    const select = page.locator('select[data-testid="execution-log-iteration-select"]');
    assert.equal(await select.count(), 1);
    assert.equal(await select.inputValue(), "2", "the failed iteration (index 2) is preselected");
    const sub = page.locator("li.w6w-execution-log-subrow");
    await sub.locator("summary").click();
    await page.waitForTimeout(200);
    const at2 = await sub.innerText();
    assert.ok(at2.includes(POSTED[2]), `iteration 2 output missing: ${at2}`);

    await select.selectOption("4");
    await page.waitForTimeout(200);
    await sub.locator("summary").click();
    await page.waitForTimeout(200);
    const at4 = await sub.innerText();
    assert.ok(at4.includes(POSTED[4]), `iteration 4 output missing: ${at4}`);
    assert.ok(!at4.includes(POSTED[2]), `iteration 2 output still shown: ${at4}`);
  } finally {
    await page.close();
  }
});
