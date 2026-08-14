// Browser gate for ActionTestForm's OWN pop-out ("Edit params", `Modal
// size="full"`) — the surface T1.4.1's contract declared unpinnable in round
// 1 (no rig in this repo mounted ActionTestForm) and which round 1's
// specificity fix then regressed: with `-full`'s `overflow: hidden` live for
// the first time, a realistic param count (15-23 is typical for a
// first-party action) clipped ~409px of content with zero internal scroll
// container and zero scrollbar — reachable pre-fix (the dialog itself
// scrolled under the base rule's `overflow: auto`), unreachable after.
// Adopted from T1.4.1 round 2's evaluator harness/probe
// (`artifacts/T1.4.1-ungated-harness-entry.tsx` /
// `T1.4.1-ungated-probe.cjs` in the project folder) into a permanent guard.
// Mounts the REAL ActionTestForm, bundled from source by ./run.sh, into real
// Chromium via harness-entry.tsx — no jsdom (it performs no layout: every
// rect and scrollHeight would read zero and this test would pass on the
// broken tree), no `@w6w/ui` substitute.
const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const pw = require(process.env.PW_CORE_MOUNT || "/pw");
const ENGINE = process.env.ENGINE || "chromium";
const engine = pw[ENGINE];
if (!engine) throw new Error(`no such browser engine: ${ENGINE}`);

const VP = { width: 1440, height: 900 };

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>action-test-form</title>
<link rel="stylesheet" href="/ui.css">
</head><body><div id="root"></div>
<script src="/bundle.js"></script></body></html>`;

async function open(browser) {
  const page = await browser.newPage({ viewport: VP });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.route("**/*", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/") return route.fulfill({ contentType: "text/html", body: HTML });
    if (p === "/bundle.js")
      return route.fulfill({ contentType: "text/javascript", path: "/w/bundle.js" });
    if (p === "/ui.css") return route.fulfill({ contentType: "text/css", path: "/w/ui.css" });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("http://action-test-form.test/");
  await page.waitForFunction(() => window.__mounted === true, null, { timeout: 10000 });
  await page.waitForTimeout(150);
  if (errs.length) throw new Error(`pageerror mounting: ${errs.join("; ")}`);
  return page;
}

let browser;
before(async () => {
  browser = await engine.launch();
});
after(async () => {
  if (browser) await browser.close();
});

// ── M-popout-scroll — the "Edit params" pop-out shows ALL content, reachable
//    via its OWN internal scrollbar, not the dialog's (which is `overflow:
//    hidden` by design — pinned decision #2 of T1.4.1 round 1, gated
//    separately by M-full in test/expr-template). ─────────────────────────
test("M-popout-scroll — ActionTestForm's -full pop-out shows all content via an internal scroll boundary, nothing clipped", async () => {
  const page = await open(browser);

  const btn = await page.$('button[aria-label="Open the params editor in a larger view"]');
  assert.ok(btn, "expand-to-pop-out toggle button not found");
  await btn.click();
  await page.waitForSelector("dialog[open]", { timeout: 5000 });
  await page.waitForTimeout(150);

  const info = await page.evaluate(() => {
    const dlg = document.querySelector("dialog");
    const scroller = document.querySelector(".w6w-tester-popout-scroll");
    const runBtn = [...document.querySelectorAll(".w6w-tester-actions button")].find(
      (b) => b.textContent.trim() === "Run action",
    );
    const dlgRect = dlg?.getBoundingClientRect();
    const runRectBefore = runBtn?.getBoundingClientRect();
    return {
      dlgWidth: dlgRect?.width ?? null,
      dlgOverflow: dlg ? getComputedStyle(dlg).overflow : null,
      dlgClipped: dlg ? dlg.scrollHeight - dlg.clientHeight : null,
      scrollerFound: !!scroller,
      scrollerOverflow: scroller ? scroller.scrollHeight - scroller.clientHeight : null,
      runFoundBefore: !!runBtn,
      runTopBefore: runRectBefore ? runRectBefore.top : null,
      runBottomBefore: runRectBefore ? runRectBefore.bottom : null,
      dlgBottom: dlgRect ? dlgRect.bottom : null,
      docScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  // Same -full mechanics M-full pins (expr-template): still ≥1150 wide, still
  // `overflow: hidden` on the DIALOG itself, no horizontal page scroll.
  assert.ok(info.dlgWidth >= 1150, `-full dialog width ${info.dlgWidth} < 1150 floor`);
  assert.equal(
    info.dlgOverflow,
    "hidden",
    `-full dialog computed overflow was "${info.dlgOverflow}", expected "hidden"`,
  );
  assert.ok(
    info.docScrollWidth <= info.viewportWidth,
    `-full dialog causes horizontal page scroll: documentElement.scrollWidth ${info.docScrollWidth} > viewport width ${info.viewportWidth}`,
  );

  // The dialog itself must NOT be the thing that overflows (that is what
  // `overflow: hidden` on the DIALOG means, per the round-1 fix) — any
  // overflow must be contained by the internal scroller below, not the
  // dialog box.
  assert.equal(
    info.dlgClipped,
    0,
    `-full dialog itself has clipped content (scrollHeight - clientHeight = ${info.dlgClipped}) — overflow must be owned by .w6w-tester-popout-scroll, not the dialog`,
  );

  // The internal scroll boundary must exist...
  assert.ok(info.scrollerFound, ".w6w-tester-popout-scroll not found inside the pop-out dialog");
  // ...and, at this realistic (14-param) fixture, actually have real content
  // to scroll — otherwise a host that merely stops clipping (nothing to
  // clip) would pass this assertion for the wrong reason, exactly like I1's
  // "scrollableBefore > 0" precondition in test/picker-layout.
  assert.ok(
    info.scrollerOverflow > 0,
    `.w6w-tester-popout-scroll has nothing to scroll at 14 params (overflow ${info.scrollerOverflow}) — this fixture must actually stress the layout`,
  );

  assert.ok(info.runFoundBefore, `"Run action" button not found in the pop-out's action bar`);
  // The action bar (Run/Save/Delete) is a PINNED footer, outside the scroll
  // region — it must already be fully visible within the dialog's own box
  // before any scrolling, at this realistic param count.
  assert.ok(
    info.runBottomBefore <= info.dlgBottom + 1,
    `"Run action" button (bottom ${info.runBottomBefore}) sits below the dialog's own bottom (${info.dlgBottom}) — it is clipped, not reachable`,
  );

  // Scroll the internal container to the bottom: it must actually move (a
  // fixed, non-scrolling container — e.g. `overflow: hidden` accidentally
  // landing on `.w6w-tester-popout-scroll` itself — would leave scrollTop at
  // 0), and the action bar's own position must be UNCHANGED by that scroll
  // (it lives outside the scroll region, pinned).
  const after_ = await page.evaluate(() => {
    const scroller = document.querySelector(".w6w-tester-popout-scroll");
    scroller.scrollTop = 999999;
    const runBtn = [...document.querySelectorAll(".w6w-tester-actions button")].find(
      (b) => b.textContent.trim() === "Run action",
    );
    const r = runBtn?.getBoundingClientRect();
    return {
      scrollTopAfter: scroller.scrollTop,
      runTopAfter: r ? r.top : null,
      runBottomAfter: r ? r.bottom : null,
    };
  });
  assert.ok(
    after_.scrollTopAfter > 0,
    `.w6w-tester-popout-scroll did not actually scroll (scrollTop stayed ${after_.scrollTopAfter}) — it is not a real scroll container`,
  );
  assert.equal(
    after_.runTopAfter,
    info.runTopBefore,
    `"Run action" button moved after scrolling the params region (before top ${info.runTopBefore}, after ${after_.runTopAfter}) — it must be a pinned footer, not part of the scrolled content`,
  );

  await page.close();
});
