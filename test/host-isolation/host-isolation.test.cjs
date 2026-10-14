// Host-isolation guards for `@w6w/ui/styles.css`: importing the stylesheet must
// leave the HOST <html> element's computed `color-scheme` untouched (H1-H3),
// while ui component roots still get the light/dark scheme (P1-P3). Computed
// style is the instrument — jsdom has no UA color-scheme/media handling, so
// this runs in real Chromium. Pages are built with page.setContent, inlining the
// stylesheet file named by CSS_FILE (no server, no build).
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { after, before, test } = require("node:test");

const pw = require(process.env.PW_CORE_MOUNT || "/pw");
const css = readFileSync(process.env.CSS_FILE, "utf8");

let browser;
before(async () => {
  const opts = { args: ["--no-sandbox"] };
  if (process.env.CHROME) opts.executablePath = process.env.CHROME;
  browser = await pw.chromium.launch(opts);
});
after(async () => {
  await browser?.close();
});

const OS = ["light", "dark"];

// Opens a page with `htmlAttrs` on <html>, `hostCss` as host style, and `body`.
async function withPage(os, { htmlAttrs = "", hostCss = "", body = "" }, fn) {
  const ctx = await browser.newContext({ colorScheme: os });
  try {
    const page = await ctx.newPage();
    await page.emulateMedia({ colorScheme: os });
    await page.setContent(
      `<!doctype html><html ${htmlAttrs}><head><style>${css}</style><style>${hostCss}</style></head><body>${body}</body></html>`,
    );
    return await fn(page);
  } finally {
    await ctx.close();
  }
}

const scheme = (page, sel) =>
  page.evaluate((s) => getComputedStyle(document.querySelector(s)).colorScheme, sel);

const UI_BODY = `
  <div class="w6w-field"><span>f</span><select id="s"><option>a</option></select><input id="i" type="text"></div>
  <dialog class="w6w-modal" id="d" open><select id="ds"><option>a</option></select></dialog>`;

test("H1 bare host: <html> color-scheme stays normal", async () => {
  for (const os of OS) {
    await withPage(os, { body: UI_BODY }, async (page) => {
      assert.equal(await scheme(page, "html"), "normal", `os=${os}`);
    });
  }
});

test("H2 host-declared html color-scheme survives the import, whatever the OS", async () => {
  for (const os of OS) {
    for (const host of OS) {
      await withPage(os, { hostCss: `html{color-scheme:${host}}`, body: UI_BODY }, async (page) => {
        assert.equal(await scheme(page, "html"), host, `os=${os} host=${host}`);
      });
    }
  }
});

test("H3 data-theme on <html> does not set color-scheme on <html>", async () => {
  for (const os of OS) {
    for (const t of OS) {
      await withPage(os, { htmlAttrs: `data-theme="${t}"`, body: UI_BODY }, async (page) => {
        assert.equal(await scheme(page, "html"), "normal", `os=${os} data-theme=${t}`);
      });
    }
  }
});

test("P1 no theme: ui roots and native controls inside them follow the OS", async () => {
  for (const os of OS) {
    await withPage(os, { body: UI_BODY }, async (page) => {
      for (const sel of [".w6w-field", "dialog.w6w-modal", "#s", "#i", "#ds"]) {
        assert.equal(await scheme(page, sel), os, `os=${os} ${sel}`);
      }
    });
  }
});

test("P2 a data-theme wrapper beats the OS for ui roots inside it", async () => {
  for (const os of OS) {
    const t = os === "light" ? "dark" : "light";
    await withPage(os, { body: `<div data-theme="${t}">${UI_BODY}</div>` }, async (page) => {
      for (const sel of [".w6w-field", "dialog.w6w-modal", "#s", "#ds"]) {
        assert.equal(await scheme(page, sel), t, `os=${os} wrapper=${t} ${sel}`);
      }
    });
  }
});

test("P3 data-theme on <html> beats the OS for ui roots (and not for <html>)", async () => {
  for (const os of OS) {
    const t = os === "light" ? "dark" : "light";
    await withPage(os, { htmlAttrs: `data-theme="${t}"`, body: UI_BODY }, async (page) => {
      for (const sel of [".w6w-field", "dialog.w6w-modal", "#s", "#ds"]) {
        assert.equal(await scheme(page, sel), t, `os=${os} html=${t} ${sel}`);
      }
      assert.equal(await scheme(page, "html"), "normal", `os=${os} html stays normal`);
    });
  }
});
