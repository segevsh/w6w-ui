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

// Not one of the original hand-listed roots: ExecutionFilters / AppPicker /
// standalone Combobox markup (class names copied from the components).
const OTHER_BODY = `
  <div class="w6w-execution-filters"><input id="xs" class="w6w-execution-filters-search" type="search">
    <select id="xe" class="w6w-execution-filters-select"><option>a</option></select>
    <input id="xd" class="w6w-execution-filters-date" type="date"></div>
  <div class="w6w-stepbuilder-apps"><input id="ap" class="w6w-stepbuilder-search" type="text"></div>
  <select id="cb" class="w6w-combobox"><option>a</option></select>`;
const OTHER_SELS = ["#xs", "#xe", "#xd", "#ap", "#cb"];

test("R1 components outside the old root list follow the OS", async () => {
  for (const os of OS) {
    await withPage(os, { body: OTHER_BODY }, async (page) => {
      for (const sel of OTHER_SELS) assert.equal(await scheme(page, sel), os, `os=${os} ${sel}`);
    });
  }
});

test("R2 components outside the old root list follow data-theme on <html> and a wrapper", async () => {
  for (const os of OS) {
    const t = os === "light" ? "dark" : "light";
    await withPage(os, { htmlAttrs: `data-theme="${t}"`, body: OTHER_BODY }, async (page) => {
      for (const sel of OTHER_SELS) assert.equal(await scheme(page, sel), t, `os=${os} html=${t} ${sel}`);
      assert.equal(await scheme(page, "html"), "normal", `os=${os} html stays normal`);
    });
    await withPage(os, { body: `<div data-theme="${t}">${OTHER_BODY}</div>` }, async (page) => {
      for (const sel of OTHER_SELS) assert.equal(await scheme(page, sel), t, `os=${os} wrapper=${t} ${sel}`);
    });
  }
});

test("N1 nested themes: the nearest data-theme wins (light in dark, dark in light)", async () => {
  const sels = [".w6w-field", "#s", "#i", "dialog.w6w-modal", "#ds", ...OTHER_SELS];
  for (const os of OS) {
    for (const [outer, inner] of [["dark", "light"], ["light", "dark"]]) {
      const nest = `<div data-theme="${outer}"><div id="in" data-theme="${inner}">${UI_BODY}${OTHER_BODY}</div></div>`;
      await withPage(os, { body: nest }, async (page) => {
        for (const sel of sels) assert.equal(await scheme(page, sel), inner, `os=${os} ${outer}>${inner} ${sel}`);
        assert.equal(await scheme(page, "#in"), "normal", `os=${os} ${outer}>${inner} host wrapper untouched`);
      });
      await withPage(os, { htmlAttrs: `data-theme="${outer}"`, body: `<div data-theme="${inner}">${UI_BODY}${OTHER_BODY}</div>` }, async (page) => {
        for (const sel of sels) assert.equal(await scheme(page, sel), inner, `os=${os} html=${outer} panel=${inner} ${sel}`);
        assert.equal(await scheme(page, "html"), "normal", `os=${os} html stays normal`);
      });
    }
  }
});

test("W1 a themed host wrapper keeps its own canvas; the ui root inside it follows the theme", async () => {
  for (const os of OS) {
    const t = os === "light" ? "dark" : "light";
    await withPage(os, { body: `<div id="w" data-theme="${t}"><div class="w6w-field" id="f"></div></div>` }, async (page) => {
      assert.equal(await scheme(page, "#w"), "normal", `os=${os}`);
      assert.equal(await scheme(page, "#f"), t, `os=${os}`);
      assert.equal(await scheme(page, "html"), "normal", `os=${os}`);
    });
  }
});

test("H4 a host data-theme element keeps its own color-scheme (any theme value, any OS)", async () => {
  for (const os of OS) {
    for (const theme of ["forest", "dark", "light"]) {
      await withPage(
        os,
        { body: `<div id="h" data-theme="${theme}"><input id="hi" type="text"></div>` },
        async (page) => {
          assert.equal(await scheme(page, "#h"), "normal", `os=${os} theme=${theme}`);
          assert.equal(await scheme(page, "#hi"), "normal", `os=${os} theme=${theme} input`);
        },
      );
    }
  }
});

test("H5 a host class that merely contains w6w- is not a ui root", async () => {
  for (const os of OS) {
    await withPage(
      os,
      { body: `<div id="h" class="my-w6w-card"><select id="hs"><option>a</option></select></div>` },
      async (page) => {
        assert.equal(await scheme(page, "#h"), "normal", `os=${os}`);
        assert.equal(await scheme(page, "#hs"), "normal", `os=${os} select`);
      },
    );
  }
});

test("H6 a host element's own color-scheme wins for an input nested in a ui root", async () => {
  for (const os of OS) {
    await withPage(
      os,
      {
        body: `<div class="w6w-field"><div id="h" style="color-scheme:dark"><input id="hi" type="text"></div><input id="ui" type="text"></div>`,
      },
      async (page) => {
        assert.equal(await scheme(page, "#hi"), "dark", `os=${os} host input`);
        assert.equal(await scheme(page, "#ui"), os, `os=${os} ui input still follows ui root`);
      },
    );
  }
});
