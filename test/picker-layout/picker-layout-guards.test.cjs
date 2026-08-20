// Browser gate for the AppPicker / AddConnectionModal / StepBuilderModal
// layout invariants (I1-I9). Mounts the REAL components, bundled from source
// by ./run.sh, into real Chromium via harness-entry.tsx's plain
// `<W6WUIProvider api={...}>` stub — no jsdom (it performs no layout: every
// rect would read zero and this suite would pass on the broken tree), no
// `page.route` API interception (the stub is the API surface, per the
// project's pinned mechanics).
//
// Every assertion below is a RELATION between two live measurements, or an
// absolute FLOOR — never a literal lifted from a hand-transcribed rig. See the
// project's contract §Context for why: a dialog measured off transcribed DOM
// never carried the real `.w6w-modal-xl` max-width, so its absolute pixels are
// artifacts of that tree, not predictions about this one.
const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const pw = require(process.env.PW_CORE_MOUNT || "/pw");
const ENGINE = process.env.ENGINE || "chromium";
const engine = pw[ENGINE];
if (!engine) throw new Error(`no such browser engine: ${ENGINE}`);

const VP = {
  wide: { width: 1440, height: 900 },
  med: { width: 1280, height: 720 },
  short: { width: 1440, height: 620 },
};

const HTML = (v) => `<!doctype html><html><head><meta charset="utf-8">
<title>picker-layout</title>
<link rel="stylesheet" href="/ui.css">
<link rel="stylesheet" href="/studio.css">
</head><body><div id="root"></div>
<script>window.__V__=${JSON.stringify(v)};</script>
<script src="/bundle.js"></script></body></html>`;

// One surface (`add` | `step`) per page load — mounting both AppPicker-bearing
// modals at once would stack two <dialog>s in the top layer and the
// measurements below would stop meaning what they say.
async function open(browser, { v = "step", q = "", vp = VP.wide } = {}) {
  const page = await browser.newPage({ viewport: vp });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.route("**/*", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/") return route.fulfill({ contentType: "text/html", body: HTML(v) });
    if (p === "/bundle.js")
      return route.fulfill({ contentType: "text/javascript", path: "/w/bundle.js" });
    if (p === "/ui.css") return route.fulfill({ contentType: "text/css", path: "/w/ui.css" });
    if (p === "/studio.css")
      return route.fulfill({ contentType: "text/css", path: "/w/studio.css" });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(`http://picker-layout.test/${q ? `?${q}` : ""}`);
  await page.waitForFunction(() => window.__mounted === true, null, { timeout: 10000 });
  await page.waitForTimeout(150);
  if (errs.length) throw new Error(`pageerror mounting v=${v} q=${q}: ${errs.join("; ")}`);
  return page;
}

const clickTab = (page, label) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll(".w6w-stepbuilder-tab")].find(
      (x) => x.textContent.trim() === t,
    );
    if (!b) throw new Error(`no tab labelled "${t}"`);
    b.click();
  }, label);

const activeTab = (page) =>
  page.evaluate(
    () => document.querySelector(".w6w-stepbuilder-tab.active")?.textContent?.trim() ?? null,
  );

const itemNames = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".w6w-stepbuilder-item")].map(
      (b) => b.querySelector("strong")?.textContent ?? null,
    ),
  );

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

const overflow = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? el.scrollHeight - el.clientHeight : null;
  }, sel);

const searchCount = (page) =>
  page.evaluate(() => document.querySelectorAll(".w6w-stepbuilder-search").length);

const bodyText = (page) =>
  page.evaluate(() => document.body.textContent.replace(/\s+/g, " ").trim());

let browser;
before(async () => {
  browser = await engine.launch();
});
after(async () => {
  if (browser) await browser.close();
});

const lastAdd = (page) => page.evaluate(() => window.__lastAdd ?? null);

// ── C1-C4 — the picker's Functions/Workflows tabs (project contract D-12/
//    D-15): ONE step shape (`@w6w/call`) minted by both tabs, the tabs'
//    position in the sidebar, and their absence under `appsOnly` — the live
//    landmine `TargetSelector.tsx:128` would otherwise silently swallow. ────

test("C1 — sidebar's first three tabs are Connected apps, Functions, Workflows, in order", async () => {
  const page = await open(browser, { v: "step", q: "n=0" });
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll(".w6w-stepbuilder-tab")]
      .slice(0, 3)
      .map((b) => b.textContent.trim()),
  );
  assert.deepEqual(
    labels,
    ["Connected apps", "Functions", "Workflows"],
    `first three sidebar tabs: ${JSON.stringify(labels)}`,
  );
  await page.close();
});

test("C2 — Functions tab: pick fn_1, fill one input, Add emits a @w6w/call step with the seam-pinned `with`", async () => {
  const page = await open(browser, { v: "step", q: "n=0" });
  await clickTab(page, "Functions");
  await page.waitForTimeout(150);

  const picked = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".w6w-stepbuilder-item")].find((x) =>
      x.textContent.includes("fn_1"),
    );
    if (!b) return false;
    b.click();
    return true;
  });
  assert.ok(picked, "no .w6w-stepbuilder-item for fn_1 in the Functions tab");
  await page.waitForTimeout(200);

  await page.fill('input[aria-label="Name"]', "Ada");
  await page.waitForTimeout(150);

  const nextClicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Next →");
    if (!b || b.disabled) return false;
    b.click();
    return true;
  });
  assert.ok(nextClicked, "Configure -> Test 'Next →' button not clickable after filling the one input");
  await page.waitForTimeout(150);

  const addClicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Add step");
    if (!b) return false;
    b.click();
    return true;
  });
  assert.ok(addClicked, `no "Add step" button found on the Test tab`);
  await page.waitForTimeout(150);

  const added = await lastAdd(page);
  assert.ok(added, "onAdd was never called — window.__lastAdd is still empty");
  assert.equal(added.uses?.app, "@w6w/call", `uses.app: ${JSON.stringify(added.uses)}`);
  assert.equal(added.uses?.action, "call", `uses.action: ${JSON.stringify(added.uses)}`);
  assert.equal(added.with?.targetKind, "function", `with.targetKind: ${JSON.stringify(added.with)}`);
  assert.equal(added.with?.targetId, "fn_1", `with.targetId: ${JSON.stringify(added.with)}`);
  assert.equal(added.with?.wait, true, `with.wait: ${JSON.stringify(added.with)}`);
  assert.equal(added.with?.inputs?.name, "Ada", `with.inputs: ${JSON.stringify(added.with?.inputs)}`);
  await page.close();
});

test("C3 — Workflows tab: pick wf_1, fill one input, Add emits the SAME @w6w/call shape with targetKind workflow", async () => {
  const page = await open(browser, { v: "step", q: "n=0" });
  await clickTab(page, "Workflows");
  await page.waitForTimeout(150);

  const picked = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".w6w-stepbuilder-item")].find((x) =>
      x.textContent.includes("wf_1"),
    );
    if (!b) return false;
    b.click();
    return true;
  });
  assert.ok(picked, "no .w6w-stepbuilder-item for wf_1 in the Workflows tab");
  await page.waitForTimeout(200);

  await page.fill('input[aria-label="name"]', "Ada");
  await page.waitForTimeout(150);

  const nextClicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Next →");
    if (!b || b.disabled) return false;
    b.click();
    return true;
  });
  assert.ok(nextClicked, "Configure -> Test 'Next →' button not clickable after filling the one input");
  await page.waitForTimeout(150);

  const addClicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Add step");
    if (!b) return false;
    b.click();
    return true;
  });
  assert.ok(addClicked, `no "Add step" button found on the Test tab`);
  await page.waitForTimeout(150);

  const added = await lastAdd(page);
  assert.ok(added, "onAdd was never called — window.__lastAdd is still empty");
  assert.equal(added.uses?.app, "@w6w/call", `uses.app: ${JSON.stringify(added.uses)}`);
  assert.equal(added.uses?.action, "call", `uses.action: ${JSON.stringify(added.uses)}`);
  assert.equal(added.with?.targetKind, "workflow", `with.targetKind: ${JSON.stringify(added.with)}`);
  assert.equal(added.with?.targetId, "wf_1", `with.targetId: ${JSON.stringify(added.with)}`);
  assert.equal(added.with?.wait, true, `with.wait: ${JSON.stringify(added.with)}`);
  await page.close();
});

test("C4 — appsOnly hides Functions/Workflows; Connected apps/Apps/AI still render", async () => {
  const page = await open(browser, { v: "step", q: "n=0&appsOnly=1" });
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll(".w6w-stepbuilder-tab")].map((b) => b.textContent.trim()),
  );
  assert.ok(!labels.includes("Functions"), `Functions tab must be absent under appsOnly: ${JSON.stringify(labels)}`);
  assert.ok(!labels.includes("Workflows"), `Workflows tab must be absent under appsOnly: ${JSON.stringify(labels)}`);
  assert.ok(labels.includes("Connected apps"), `Connected apps must still render: ${JSON.stringify(labels)}`);
  assert.ok(labels.includes("Apps"), `Apps must still render: ${JSON.stringify(labels)}`);
  assert.ok(labels.includes("AI"), `AI must still render: ${JSON.stringify(labels)}`);
  await page.close();
});

// ── I1 — the search bar never moves under a triple scroll (list -> host ->
//    dialog), in both surfaces, at 60 apps. Guards G-A1: the AppPicker layout
//    host that stops the panel resizing must also stop the search bar
//    drifting when the (correctly contained) list scrolls. ─────────────────
test("I1 — search input top is pinned through list/host/dialog scroll, both surfaces, 60 apps", async () => {
  for (const [v, q, tabAfter] of [
    ["add", "n=60", null],
    ["step", "n=60&conn=5", "Apps"],
  ]) {
    const page = await open(browser, { v, q });
    if (tabAfter) {
      await clickTab(page, tabAfter);
      await page.waitForTimeout(150);
    }
    assert.ok(await rect(page, ".w6w-stepbuilder-search"), `${v}: search input must exist at 60 apps`);
    // A "pinned across scroll" claim is vacuous unless the list actually has
    // something to scroll — without this, a host that stops clipping the list
    // (e.g. its whole rule dropped) reads delta 0 for the wrong reason:
    // nothing moved because nothing was scrollable, not because it was pinned.
    const scrollableBefore = await overflow(page, ".w6w-stepbuilder-scroll");
    assert.ok(
      scrollableBefore > 0,
      `${v}: .w6w-stepbuilder-scroll has nothing to scroll at 60 apps (overflow ${scrollableBefore}) — the pin check below would be vacuous`,
    );
    const r = await page.evaluate(() => {
      const top = (s) => Math.round(document.querySelector(s).getBoundingClientRect().top);
      const t0 = top(".w6w-stepbuilder-search");
      document.querySelector(".w6w-stepbuilder-scroll").scrollTop = 99999;
      const t1 = top(".w6w-stepbuilder-search");
      document.querySelector(".w6w-apppicker-host").scrollTop = 99999;
      document.querySelector("dialog").scrollTop = 99999;
      const t2 = top(".w6w-stepbuilder-search");
      return { t0, t1, t2 };
    });
    assert.equal(r.t1, r.t0, `${v}: search top moved after the list scrolled (delta ${r.t1 - r.t0})`);
    assert.equal(
      r.t2,
      r.t0,
      `${v}: search top moved after host/dialog scrolled (delta ${r.t2 - r.t0})`,
    );
    await page.close();
  }
});

// ── I2 — the list, not the host or the content pane, owns the scrollbar. ──
test("I2 — .w6w-stepbuilder-scroll owns the overflow; host and content read exactly 0, both surfaces, 60 apps", async () => {
  for (const [v, q, tabAfter] of [
    ["add", "n=60", null],
    ["step", "n=60&conn=5", "Apps"],
  ]) {
    const page = await open(browser, { v, q });
    if (tabAfter) {
      await clickTab(page, tabAfter);
      await page.waitForTimeout(150);
    }
    const listOv = await overflow(page, ".w6w-stepbuilder-scroll");
    const hostOv = await overflow(page, ".w6w-apppicker-host");
    const contentOv = await overflow(page, ".w6w-stepbuilder-content");
    assert.ok(listOv > 0, `${v}: .w6w-stepbuilder-scroll must actually overflow at 60 apps, got ${listOv}`);
    assert.equal(hostOv, 0, `${v}: .w6w-apppicker-host must not overflow, got ${hostOv}`);
    assert.equal(contentOv, 0, `${v}: .w6w-stepbuilder-content must not overflow, got ${contentOv}`);
    await page.close();
  }
});

// ── I3 — the add-connection dialog and the step-builder dialog report the
//    SAME height at the same viewport and app count, at all three viewports.
//    (Base: 810 vs 620 at 1440x900 — the regression this whole gate exists to
//    catch.) ──────────────────────────────────────────────────────────────
test("I3 — add-connection and step-builder dialogs match height at 3 viewports, 60 apps", async () => {
  for (const [name, vp] of Object.entries(VP)) {
    const addPage = await open(browser, { v: "add", q: "n=60", vp });
    const addH = (await rect(addPage, "dialog")).height;
    await addPage.close();

    const stepPage = await open(browser, { v: "step", q: "n=60&conn=5", vp });
    await clickTab(stepPage, "Apps");
    await stepPage.waitForTimeout(150);
    const stepH = (await rect(stepPage, "dialog")).height;
    await stepPage.close();

    assert.equal(
      addH,
      stepH,
      `vp=${name}: add-connection dialog (${addH}) != step-builder dialog (${stepH})`,
    );
  }
});

// ── I4 — the four AppPicker render paths (error, loading, empty, loaded) all
//    report the SAME host height, at one fixed viewport. Only reachable by
//    mounting the real component: nothing about this is visible in a diff. ─
test("I4 — host height is identical across all four AppPicker render paths", async () => {
  const cases = [
    ["error", "mode=error&n=60"],
    ["loading", "mode=loading&n=60"],
    ["empty", "mode=empty&n=60"],
    ["loaded", "mode=ok&n=60"],
  ];
  const heights = {};
  for (const [label, q] of cases) {
    const page = await open(browser, { v: "add", q });
    const hostRect = await rect(page, ".w6w-apppicker-host");
    assert.ok(hostRect, `render path "${label}" must still render inside .w6w-apppicker-host`);
    heights[label] = hostRect.height;
    await page.close();
  }
  const [first, ...rest] = Object.entries(heights);
  for (const [label, h] of rest) {
    assert.equal(h, first[1], `render path "${label}" host height (${h}) != "${first[0]}" (${first[1]}) — ${JSON.stringify(heights)}`);
  }
});

// ── I5 — the step builder's Apps-tab panel is wide, not the 152/148 the
//    rejected "replace" form collapses to; and (folded in from TA1's eval)
//    the SAME panel width holds on the Triggers tab — the structural property
//    that the host stays nested inside .w6w-stepbuilder-content rather than
//    becoming it. ─────────────────────────────────────────────────────────
test("I5 — step-builder Apps-tab panel/item width floors, and Apps == Triggers panel width", async () => {
  const page = await open(browser, { v: "step", q: "n=60&conn=5", vp: VP.wide });
  await clickTab(page, "Apps");
  await page.waitForTimeout(150);
  const contentApps = await rect(page, ".w6w-stepbuilder-content");
  const item = await rect(page, ".w6w-stepbuilder-item");
  assert.ok(contentApps, "Apps-tab .w6w-stepbuilder-content must exist");
  assert.ok(item, "Apps-tab app-row button (.w6w-stepbuilder-item) must exist");
  assert.ok(
    contentApps.width >= 500,
    `Apps-tab .w6w-stepbuilder-content width ${contentApps.width} < 500 floor`,
  );
  assert.ok(item.width >= 480, `app-row button width ${item.width} < 480 floor`);
  // The floors above are absolute numbers, so a host forced to some fixed
  // width that still clears them (e.g. 550px, or 900px — wider than its own
  // container) survives undetected. Float the panel against its OWN
  // container instead: the host must fill exactly what the content pane
  // gives it, not some number picked independently of that container.
  const hostApps = await rect(page, ".w6w-apppicker-host");
  assert.ok(hostApps, "Apps-tab .w6w-apppicker-host must exist");
  assert.equal(
    hostApps.width,
    contentApps.width,
    `Apps-tab .w6w-apppicker-host width (${hostApps.width}) != its own .w6w-stepbuilder-content width (${contentApps.width})`,
  );

  await clickTab(page, "Triggers");
  await page.waitForTimeout(150);
  const contentTriggers = await rect(page, ".w6w-stepbuilder-content");
  assert.equal(
    contentTriggers.width,
    contentApps.width,
    `Triggers-tab panel width (${contentTriggers.width}) != Apps-tab panel width (${contentApps.width})`,
  );
  await page.close();
});

// ── I6 — .w6w-stepbuilder-search count per tab: Connected-apps opts out
//    (search={false}), Apps and AI both carry exactly one. ─────────────────
test("I6 — search input count: Connected-apps 0, Apps 1, AI 1", async () => {
  const page = await open(browser, { v: "step", q: "n=60&conn=5", vp: VP.wide });
  assert.equal(await activeTab(page), "Connected apps", "default landing tab must be Connected apps");
  assert.equal(await searchCount(page), 0, "Connected-apps tab must carry no search input");

  await clickTab(page, "Apps");
  await page.waitForTimeout(150);
  assert.equal(await searchCount(page), 1, "Apps tab must carry exactly one search input");

  await clickTab(page, "AI");
  await page.waitForTimeout(150);
  assert.equal(await searchCount(page), 1, "AI tab must carry exactly one search input");
  await page.close();
});

// ── I7 — the AI tab is a strictly smaller subset of the Apps tab (seeded:
//    every 3rd of 60 vendor apps carries categories:["ai"] => 20 of 60), and
//    it carries its own placeholder. ────────────────────────────────────────
test("I7 — AI tab renders strictly fewer items than Apps tab, and carries the AI placeholder", async () => {
  const page = await open(browser, { v: "step", q: "n=60&conn=5", vp: VP.wide });
  await clickTab(page, "Apps");
  await page.waitForTimeout(150);
  const appsCount = (await itemNames(page)).length;

  await clickTab(page, "AI");
  await page.waitForTimeout(150);
  const aiCount = (await itemNames(page)).length;
  const ph = await page.evaluate(
    () => document.querySelector(".w6w-stepbuilder-search")?.getAttribute("placeholder") ?? null,
  );
  assert.ok(aiCount < appsCount, `AI tab item count ${aiCount} not < Apps tab item count ${appsCount}`);
  assert.equal(ph, "Search AI apps…", `AI tab search placeholder was "${ph}"`);
  await page.close();
});

// ── I8 — behavioural coverage for the three mutants TA2's rig discriminated
//    but I1-I7's geometry cannot see (emptyAction dropped, filter reordered,
//    the connected-intersection filter dropped). ───────────────────────────
test("I8 — empty-state escape hatch, AI-tab filter ordering, connected-tab intersection", async () => {
  // (a) emptyAction (M3): zero connections over a NON-empty catalog must
  // render "No connected apps yet" (not the search-branch "No apps match"),
  // the escape-hatch button, and clicking it must actually switch tabs and
  // list the catalog — an orphaned click handler would render identically.
  {
    const page = await open(browser, { v: "step", q: "n=60&conn=0", vp: VP.wide });
    const text = await bodyText(page);
    assert.ok(text.includes("No connected apps yet"), `empty-state copy missing: "${text.slice(0, 120)}"`);
    assert.ok(!text.includes("No apps match"), "the search-branch empty copy must not appear with search off");
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => x.textContent.trim() === "Browse all apps",
      );
      if (!b) return false;
      b.click();
      return true;
    });
    assert.ok(clicked, `"Browse all apps" button not found`);
    await page.waitForTimeout(150);
    assert.equal(await activeTab(page), "Apps", "clicking the escape hatch must switch to the Apps tab");
    assert.equal((await itemNames(page)).length, 60, "the Apps tab must list the full catalog after the click");
    await page.close();
  }

  // (b) filter ordering (M4): `filter` must run BEFORE sort/search, so a
  // reordered filter is invisible without a query but visible with one — the
  // AI tab intersected with "App 1" is the natural vehicle (base:
  // ["App 12","App 15","App 18"], vs the Apps tab's 11 unfiltered rows).
  {
    const page = await open(browser, { v: "step", q: "n=60&conn=5", vp: VP.wide });
    await clickTab(page, "AI");
    await page.waitForTimeout(150);
    await page.fill(".w6w-stepbuilder-search", "App 1");
    await page.waitForTimeout(150);
    const aiFiltered = await itemNames(page);
    assert.deepEqual(
      aiFiltered,
      ["App 12", "App 15", "App 18"],
      `AI tab query "App 1" -> ${JSON.stringify(aiFiltered)}, expected ["App 12","App 15","App 18"]`,
    );

    // The triple above happens to land in the same order whether or not the
    // sort ran, so a dropped `localeCompare` survives it. Query "9" against
    // the same AI subset instead: it matches "App 9" and "App 39", whose
    // insertion order (9 before 39) DIFFERS from their alphabetical order
    // ("App 39" sorts before "App 9" — '3' < '9' as characters) — so only a
    // real sort produces this exact sequence.
    await page.fill(".w6w-stepbuilder-search", "9");
    await page.waitForTimeout(150);
    const aiOrderSensitive = await itemNames(page);
    assert.deepEqual(
      aiOrderSensitive,
      ["App 39", "App 9"],
      `AI tab query "9" -> ${JSON.stringify(aiOrderSensitive)}, expected ["App 39","App 9"] (order, not just membership — catches a dropped sort)`,
    );

    await clickTab(page, "Apps");
    await page.waitForTimeout(150);
    await page.fill(".w6w-stepbuilder-search", "App 1");
    await page.waitForTimeout(150);
    const appsFiltered = await itemNames(page);
    assert.equal(
      appsFiltered.length,
      11,
      `Apps tab query "App 1" -> ${JSON.stringify(appsFiltered)}, expected 11 rows`,
    );
    await page.close();
  }

  // (c) connected intersection (M9): 5 connected vendor apps + the always-
  // "connected" reserved @w6w/http must yield 5 rows, not 6 — the reserved id
  // stays excluded even when it has a connection.
  {
    const page = await open(browser, { v: "step", q: "n=60&conn=5", vp: VP.wide });
    assert.equal(await activeTab(page), "Connected apps");
    const n = (await itemNames(page)).length;
    assert.equal(n, 5, `connected tab rendered ${n} rows, expected 5 (not 6 — @w6w/http must stay excluded)`);
    await page.close();
  }

  // (d) row click (E8r): no test anywhere else clicks an app row. Selecting
  // the first Apps-tab row must actually fire `onSelectApp` and collapse the
  // step builder into that app's own detail view — a no-op `onClick` renders
  // identically right up until the click.
  {
    const page = await open(browser, { v: "step", q: "n=60&conn=5", vp: VP.wide });
    await clickTab(page, "Apps");
    await page.waitForTimeout(150);
    const names = await itemNames(page);
    assert.ok(names.length > 0, "Apps tab must render at least one row to click");
    await page.evaluate(() => {
      const btn = document.querySelector(".w6w-stepbuilder-item");
      if (!btn) throw new Error("no .w6w-stepbuilder-item to click");
      btn.click();
    });
    await page.waitForTimeout(150);
    const titleText = await page.evaluate(
      () => document.querySelector(".w6w-modal-title")?.textContent ?? null,
    );
    assert.ok(
      titleText && titleText.includes(names[0]),
      `clicking the first app row (${names[0]}) must select it — modal title reads "${titleText}"`,
    );
    const tabsLeft = await page.evaluate(
      () => document.querySelectorAll(".w6w-stepbuilder-tab").length,
    );
    assert.equal(
      tabsLeft,
      0,
      "selecting an app must collapse the step builder — the tab sidebar must be gone",
    );
    await page.close();
  }
});

// ── I9 — the Connected-apps tab's own error/loading returns (a StepBuilder-
//    local branch, separate from AppPicker's own error/loading in I4) must
//    stay wrapped by .w6w-apppicker-host, nested inside .w6w-stepbuilder-content
//    like every other tab body — never rendered loose. TA2's binding proof:
//    this path shipped alongside AppPicker's identical wrapping (I4) but
//    nothing exercised it. ────────────────────────────────────────────────
test("I9 — Connected-apps tab error/loading paths stay hosted and nested", async () => {
  for (const [label, q] of [
    ["error", "n=60&conn=5&cmode=error"],
    ["loading", "n=60&conn=5&cmode=loading"],
  ]) {
    const page = await open(browser, { v: "step", q });
    assert.equal(
      await activeTab(page),
      "Connected apps",
      `${label}: default landing tab must be Connected apps`,
    );
    const hostRect = await rect(page, ".w6w-apppicker-host");
    assert.ok(
      hostRect,
      `Connected-apps tab "${label}" path must render inside .w6w-apppicker-host`,
    );
    const nested = await page.evaluate(() => {
      const host = document.querySelector(".w6w-apppicker-host");
      const content = document.querySelector(".w6w-stepbuilder-content");
      return !!(host && content && content !== host && content.contains(host));
    });
    assert.ok(
      nested,
      `Connected-apps tab "${label}" path: .w6w-apppicker-host must be nested inside .w6w-stepbuilder-content, not replace or escape it`,
    );
    await page.close();
  }
});

// ── M-xl — the -xl size modifier actually applies. `dialog.w6w-modal`
//    (0,1,1) previously out-specified `.w6w-modal-xl` (0,1,0), so the
//    authored `max-width: 1040px` never won against the base rule's 800px —
//    a fix that reaches only `.w6w-modal-full` must leave this red. Both
//    real `-xl` dialogs (AddConnectionModal, StepBuilderModal) are checked at
//    VP.wide. ──────────────────────────────────────────────────────────────
test("M-xl — the -xl size modifier actually applies, both real -xl dialogs", async () => {
  const addPage = await open(browser, { v: "add", vp: VP.wide });
  const addWidth = (await rect(addPage, "dialog")).width;
  await addPage.close();
  assert.ok(addWidth >= 1000, `AddConnectionModal dialog width ${addWidth} < 1000 floor`);

  const stepPage = await open(browser, { v: "step", vp: VP.wide });
  const stepWidth = (await rect(stepPage, "dialog")).width;
  await stepPage.close();
  assert.ok(stepWidth >= 1000, `StepBuilderModal dialog width ${stepWidth} < 1000 floor`);
});

// ── F1 — the test-required note never moves the footer buttons. The axis is
//    note-present vs note-absent, NOT before-vs-after a failed test run:
//    `testPassed` starts false and `testRequired` defaults true
//    (StepBuilderModal.tsx:1065-1066, :723-726), so the note is already on
//    screen the moment the Test tab is reached — a before/after-failure delta
//    is zero and would pass on the broken tree. Height is also the wrong
//    measurement: on the base tree the note moves Cancel's LEFT by ~422px
//    while the primary button and the footer's height both move 0px, so only
//    per-button left+top (not height) discriminates. ───────────────────────
test("F1 — the test-required note never moves the footer buttons", async () => {
  const NARROW = { width: 820, height: 900 };

  // Drives AppStepConfig's Test tab from the real component — no fifth rig,
  // no transcribed footer markup: Apps tab -> first app row -> the Setup
  // tab's action <select> -> the "Test" subtab. `treq=0` (see harness-entry)
  // makes the harness stamp `testRequired: false` on every seeded app — the
  // note-absent state; omitting it is the note-present (default-required)
  // state.
  async function openTestTab(q, vp) {
    const page = await open(browser, { v: "step", q, vp });
    await clickTab(page, "Apps");
    await page.waitForTimeout(150);
    const rowClicked = await page.evaluate(() => {
      const btn = document.querySelector(".w6w-stepbuilder-item");
      if (!btn) return false;
      btn.click();
      return true;
    });
    assert.ok(rowClicked, "no .w6w-stepbuilder-item to click");
    await page.waitForTimeout(150);
    const actionPicked = await page.evaluate(() => {
      const sel = document.querySelector("select");
      if (!sel) return false;
      const opt = [...sel.options].find((o) => o.value !== "");
      if (!opt) return false;
      sel.value = opt.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    });
    assert.ok(actionPicked, "no selectable action option in the Setup tab's <select>");
    await page.waitForTimeout(150);
    const testClicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll(".w6w-subtab")].find(
        (x) => x.textContent.trim() === "Test",
      );
      if (!b) return false;
      b.click();
      return true;
    });
    assert.ok(testClicked, 'no .w6w-subtab labelled "Test"');
    await page.waitForTimeout(150);
    return page;
  }

  for (const vp of [VP.wide, NARROW]) {
    const label = `vp=${vp.width}x${vp.height}`;

    const presentPage = await openTestTab("n=60", vp);
    const cPresent = await rect(presentPage, ".w6w-stepconfig-footer .w6w-btn-ghost");
    const pPresent = await rect(
      presentPage,
      ".w6w-stepconfig-footer .w6w-btn:not(.w6w-btn-ghost)",
    );
    const fPresent = await rect(presentPage, ".w6w-stepconfig-footer");
    const nPresent = await rect(presentPage, ".w6w-stepconfig-testnote");
    const noteText = await presentPage.evaluate(
      () => document.querySelector(".w6w-stepconfig-testnote")?.textContent ?? "",
    );
    await presentPage.close();

    assert.ok(cPresent, `${label} note-present: Cancel button not found`);
    assert.ok(pPresent, `${label} note-present: primary button not found`);
    assert.ok(fPresent, `${label} note-present: .w6w-stepconfig-footer not found`);
    assert.ok(nPresent, `${label} note-present: .w6w-stepconfig-testnote not found`);
    // Anti-deletion: the note must still be rendered and visible (deleting it
    // also stops the buttons moving — this is the check that forbids that).
    assert.ok(
      nPresent.width > 0 && nPresent.height > 0,
      `${label} note-present: .w6w-stepconfig-testnote must have a non-zero rect, got ${JSON.stringify(nPresent)}`,
    );
    assert.ok(
      noteText.includes("a passing test is required before this step can be published"),
      `${label} note-present: note text missing the expected copy, got "${noteText}"`,
    );

    const absentPage = await openTestTab("n=60&treq=0", vp);
    const cAbsent = await rect(absentPage, ".w6w-stepconfig-footer .w6w-btn-ghost");
    const pAbsent = await rect(absentPage, ".w6w-stepconfig-footer .w6w-btn:not(.w6w-btn-ghost)");
    const fAbsent = await rect(absentPage, ".w6w-stepconfig-footer");
    await absentPage.close();

    assert.ok(cAbsent, `${label} note-absent: Cancel button not found`);
    assert.ok(pAbsent, `${label} note-absent: primary button not found`);
    assert.ok(fAbsent, `${label} note-absent: .w6w-stepconfig-footer not found`);

    assert.equal(
      cPresent.left,
      cAbsent.left,
      `${label}: Cancel left moved (present ${cPresent.left} vs absent ${cAbsent.left})`,
    );
    assert.equal(
      cPresent.top,
      cAbsent.top,
      `${label}: Cancel top moved (present ${cPresent.top} vs absent ${cAbsent.top})`,
    );
    assert.equal(
      pPresent.left,
      pAbsent.left,
      `${label}: primary button left moved (present ${pPresent.left} vs absent ${pAbsent.left})`,
    );
    assert.equal(
      pPresent.top,
      pAbsent.top,
      `${label}: primary button top moved (present ${pPresent.top} vs absent ${pAbsent.top})`,
    );
    assert.equal(
      fPresent.height,
      fAbsent.height,
      `${label}: footer height moved (present ${fPresent.height} vs absent ${fAbsent.height})`,
    );
    assert.equal(
      fPresent.top,
      fAbsent.top,
      `${label}: footer top moved (present ${fPresent.top} vs absent ${fAbsent.top})`,
    );
  }
});
