// Browser gate for AppPicker's bounded paged mode (T2.1.1 A2/C2), against a
// synthetic 2,000-app catalog. Mounts the REAL StepBuilderModal, bundled from
// source by ./run.sh, into real Chromium via harness-entry.tsx's plain
// `<W6WUIProvider api={...}>` stub whose `listAppsPage`/`listAppsByIds`
// implement real pagination/search/category math over an in-memory catalog —
// no jsdom (it performs no debounced-timer-driven DOM update reliably enough
// to trust for this), no `page.route` API interception (the stub IS the API
// surface, mirroring `test/picker-layout`'s own pinned mechanic).
//
//   PG1  opening the Apps tab issues exactly ONE bounded request (limit<=60,
//        compact) — the whole 2,000-app catalog is never drained
//   PG2  a debounced search (real typing, real keystrokes) reaches a fixture
//        app placed far beyond the first page (index 1337) via the server's
//        own `q`, not a client-side scan of an already-fetched page
//   PG3  the AI tab sends `category=ai` — a REAL smaller, distinct app set
//        renders than the Apps tab's (server-side, not client re-filtering)
//   PG4  "Load more" appends the next bounded page and stops once the server
//        reports no further cursor (terminal)
//   PG5  a client-side filter (`appsFilter`) that rejects every app on a
//        bounded page does NOT auto-drain the next page — "Load more" stays
//        reachable
//   PG6  a server that echoes the same cursor back forever does not loop —
//        "Load more" disappears after the repeated response
//   PG7  a malformed page shows a visible error with a Retry control, and
//        clicking it re-issues the request
//   PG8  switching Apps→AI on the SAME mounted component cancels the
//        obsolete Apps request and starts a fresh, category-scoped one
//   PG9  closing the tab (unmounting the picker) while a request is pending
//        never crashes and never renders a late result
//   PG10 typing into the search box twice in quick succession issues only
//        ONE request (the debounce), not one per keystroke
//   PG11 the `appsOnly` StepBuilderModal renders Apps/AI but not
//        Functions/Workflows — the picker under test is the real, whole
//        modal, not a bare AppPicker in isolation
//
// Run: bash run.sh (see that file's header for prerequisites).
const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const pw = require(process.env.PW_CORE_MOUNT || "/pw");
const ENGINE = process.env.ENGINE || "chromium";
const engine = pw[ENGINE];
if (!engine) throw new Error(`no such browser engine: ${ENGINE}`);

const HTML = () => `<!doctype html><html><head><meta charset="utf-8">
<title>picker-paging</title>
<link rel="stylesheet" href="/ui.css">
<link rel="stylesheet" href="/studio.css">
</head><body><div id="root"></div>
<script src="/bundle.js"></script></body></html>`;

async function open(browser, { q = "" } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.route("**/*", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/") return route.fulfill({ contentType: "text/html", body: HTML() });
    if (p === "/bundle.js")
      return route.fulfill({ contentType: "text/javascript", path: "/w/bundle.js" });
    if (p === "/ui.css") return route.fulfill({ contentType: "text/css", path: "/w/ui.css" });
    if (p === "/studio.css")
      return route.fulfill({ contentType: "text/css", path: "/w/studio.css" });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(`http://picker-paging.test/${q ? `?${q}` : ""}`);
  await page.waitForFunction(() => window.__mounted === true, null, { timeout: 10000 });
  if (errs.length) throw new Error(`pageerror mounting q=${q}: ${errs.join("; ")}`);
  return { page, errs };
}

const calls = (page) => page.evaluate(() => window.__calls || []);
const clickTab = (page, label) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll(".w6w-stepbuilder-tab")].find(
      (x) => x.textContent.trim() === t,
    );
    if (!b) throw new Error(`no tab labelled "${t}"`);
    b.click();
  }, label);

const cardIds = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".w6w-apppicker-card-id")].map((el) => el.textContent.trim()),
  );

const findButton = (page, label) =>
  page.evaluate(
    (l) =>
      Boolean(
        [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === l),
      ),
    label,
  );

const clickButton = (page, label) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === l);
    if (!b) throw new Error(`no button labelled "${l}"`);
    b.click();
  }, label);

let browser;
before(async () => {
  browser = await engine.launch();
});
after(async () => {
  await browser?.close();
});

test("PG1: opening Apps issues exactly ONE bounded request — the 2,000-app catalog is never drained", async () => {
  const { page } = await open(browser);
  await page.waitForSelector(".w6w-apppicker-card-id", { timeout: 15000 });
  const c = await calls(page);
  assert.equal(c.length, 1, "exactly one request for the initial page");
  assert.ok((c[0].limit ?? 0) > 0 && c[0].limit <= 60, `limit must be bounded, got ${c[0].limit}`);
  const ids = await cardIds(page);
  assert.equal(ids.length <= c[0].limit, true, "the rendered grid must never exceed one bounded page");
  await page.close();
});

test("PG2: a debounced search reaches a fixture app far beyond the first page, via the server's own q", async () => {
  const { page } = await open(browser);
  await page.waitForSelector(".w6w-apppicker-card-id", { timeout: 15000 });
  await page.getByPlaceholder("Search apps…").fill("findme");
  await page.waitForSelector('.w6w-apppicker-card-id:has-text("findme-1337")', { timeout: 15000 });
  const ids = await cardIds(page);
  assert.deepEqual(ids, ["findme-1337"]);
  const c = await calls(page);
  assert.equal(c[c.length - 1].q, "findme");
  await page.close();
});

test("PG3: the AI tab sends category=ai — a real, distinct, smaller app set than Apps", async () => {
  const { page } = await open(browser);
  await page.waitForSelector(".w6w-apppicker-card-id", { timeout: 15000 });
  const appsIds = await cardIds(page);

  await clickTab(page, "AI");
  await page.waitForSelector(".w6w-apppicker-card-id", { timeout: 15000 });
  const aiIds = await cardIds(page);

  const c = await calls(page);
  assert.equal(c[c.length - 1].category, "ai");
  assert.notDeepEqual(aiIds, appsIds, "the AI tab must show a different set than the Apps tab");
  await page.close();
});

test("PG4: Load more appends the next bounded page and terminates on the server's own signal", async () => {
  const { page } = await open(browser, { q: "n=130" }); // small catalog: two bounded pages at limit 60(ish)+
  await page.waitForSelector(".w6w-apppicker-card-id", { timeout: 15000 });
  const first = await cardIds(page);
  assert.ok(first.length > 0 && first.length < 130, "the first page must be bounded, not the whole 130");

  assert.ok(await findButton(page, "Load more"), "Load more must be present while more pages remain");
  await clickButton(page, "Load more");
  await page.waitForFunction(
    (prevLen) => document.querySelectorAll(".w6w-apppicker-card-id").length > prevLen,
    first.length,
    { timeout: 15000 },
  );
  const second = await cardIds(page);
  assert.ok(second.length > first.length, "load more must append, not replace");
  assert.equal(new Set(second).size, second.length, "no duplicate ids after append");

  // Keep loading until the catalog (130 apps + no @w6w internal apps in this
  // fixture) is exhausted, then Load more must disappear.
  for (let i = 0; i < 5 && (await findButton(page, "Load more")); i++) {
    const before = (await cardIds(page)).length;
    await clickButton(page, "Load more");
    await page.waitForFunction(
      (prevLen) => document.querySelectorAll(".w6w-apppicker-card-id").length > prevLen,
      before,
      { timeout: 15000 },
    );
  }
  assert.equal(await findButton(page, "Load more"), false, "Load more must disappear once terminal");
  const all = await cardIds(page);
  assert.equal(all.length, 130);
  await page.close();
});

test("PG5: a client-side filter rejecting every app on a page does NOT auto-drain the next page", async () => {
  const { page } = await open(browser, { q: "rejectAll=1" });
  await page.waitForSelector(".w6w-stepbuilder-apps", { timeout: 15000 });
  // Every app is filtered out, but more pages remain server-side — the
  // component must not keep fetching on its own; "Load more" stays present.
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Load more"),
    null,
    { timeout: 15000 },
  );
  const c1 = await calls(page);
  assert.equal(c1.length, 1, "no automatic second request just because the visible list is empty");
  const ids = await cardIds(page);
  assert.equal(ids.length, 0);
  await page.close();
});

test("PG6: a server that echoes the same cursor back forever does not loop", async () => {
  const { page } = await open(browser, { q: "n=130&repeatCursor=1" });
  await page.waitForSelector(".w6w-apppicker-card-id", { timeout: 15000 });
  assert.ok(await findButton(page, "Load more"));
  await clickButton(page, "Load more");
  await page.waitForTimeout(400);
  const c = await calls(page);
  assert.equal(c.length, 2, "exactly one load-more request, never a retry loop");
  assert.equal(
    await findButton(page, "Load more"),
    false,
    "a repeated/non-advancing cursor must be treated as terminal",
  );
  await page.close();
});

test("PG7: a malformed LOAD-MORE page shows a visible error with Retry, and Retry re-issues the request", async () => {
  // n=130 so a first (successful) page and a second (malformed) page both
  // exist; the FIRST page is never malformed (see harness-entry.tsx) so the
  // component's own "optional method not implemented" fallback never fires
  // — this exercises the genuine mid-session-malformed error path instead.
  const { page } = await open(browser, { q: "n=130&malformed=1" });
  await page.waitForSelector(".w6w-apppicker-card-id", { timeout: 15000 });
  const before = (await cardIds(page)).length;
  await clickButton(page, "Load more");
  await page.waitForSelector(".w6w-error", { timeout: 15000 });
  assert.ok(await findButton(page, "Retry"));
  assert.equal((await cardIds(page)).length, before, "the already-loaded first page must survive the failed load-more");
  const callsBefore = (await calls(page)).length;
  await clickButton(page, "Retry");
  await page.waitForTimeout(300);
  const callsAfter = await calls(page);
  assert.ok(callsAfter.length > callsBefore, "Retry must issue a new request");
  await page.close();
});

test("PG8: switching Apps→AI on the SAME mounted picker cancels the obsolete request and starts a fresh one", async () => {
  const { page } = await open(browser, { q: "delay=400" });
  await clickTab(page, "AI");
  await page.waitForSelector(".w6w-apppicker-card-id", { timeout: 15000 });
  const ids = await cardIds(page);
  // Every rendered card must be an "ai" (i%3===0) app — a stale Apps-tab
  // response landing after the AI switch would pollute this with non-ai ids.
  for (const id of ids) {
    if (id === "findme-1337") continue;
    const n = Number(id.replace("vendor-app-", ""));
    assert.equal(n % 3, 0, `card ${id} must belong to the AI category, not a late Apps-tab response`);
  }
  await page.close();
});

test("PG9: unmounting the picker while a request is pending never crashes and never renders a late result", async () => {
  const { page, errs } = await open(browser, { q: "delay=600" });
  await page.waitForSelector(".w6w-stepbuilder-apps", { timeout: 15000 });
  // Close the modal via `Modal.tsx`'s own outside-click mechanism: a real
  // click on the native `<dialog>`'s `::backdrop` dispatches with the
  // DIALOG element itself as `event.target` (Modal.tsx's own documented
  // trick — `::backdrop` is a pseudo-element, not a hit-testable DOM node
  // Playwright's locator/mouse APIs can reliably target from raw viewport
  // coordinates once the dialog is promoted to the top layer), at
  // coordinates outside its own bounding rect. Dispatched directly against
  // the dialog element so this exercises exactly that documented mechanism,
  // not an assumption about cross-engine backdrop hit-testing.
  await page.evaluate(() => {
    const dialog = document.querySelector("dialog.w6w-modal");
    const r = dialog.getBoundingClientRect();
    dialog.dispatchEvent(
      new MouseEvent("click", { clientX: r.left - 20, clientY: r.top - 20, bubbles: true }),
    );
  });
  await page.waitForSelector(".w6w-modal-backdrop", { state: "detached", timeout: 15000 });
  await page.waitForTimeout(800); // let the in-flight response try to land
  assert.equal(errs.length, 0, `no pageerror after unmount: ${errs.join("; ")}`);
  await page.close();
});

test("PG10: two rapid keystrokes issue only ONE debounced request, not one per keystroke", async () => {
  const { page } = await open(browser);
  await page.waitForSelector(".w6w-apppicker-card-id", { timeout: 15000 });
  const before = (await calls(page)).length;
  const box = page.getByPlaceholder("Search apps…");
  await box.pressSequentially("ab", { delay: 20 });
  await page.waitForTimeout(500); // past the 300ms debounce, once
  const after1 = await calls(page);
  assert.equal(after1.length, before + 1, "rapid keystrokes must collapse into one debounced request");
  await page.close();
});

test("PG11: the appsOnly modal renders Apps/AI but not Functions/Workflows", async () => {
  const { page } = await open(browser);
  await page.waitForSelector(".w6w-stepbuilder-tab", { timeout: 15000 });
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll(".w6w-stepbuilder-tab")].map((t) => t.textContent.trim()),
  );
  assert.ok(tabs.includes("Apps"));
  assert.ok(tabs.includes("AI"));
  assert.equal(tabs.includes("Functions"), false);
  assert.equal(tabs.includes("Workflows"), false);
  await page.close();
});
