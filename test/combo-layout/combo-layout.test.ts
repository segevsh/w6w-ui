// Real-Chromium layout gate for the Combobox width / ƒx placement fix (T0.2.1). jsdom performs no
// layout, so this renders the REAL Combobox (react-dom/server) inside the three host shapes it is
// used in, styled by the COMMITTED src/styles.css, and measures in headless Chromium (host
// playwright-core). Every assertion is a relation between two live measurements.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";

const React = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { Combobox } = await import("../../src/components/Combobox.tsx");

const CSS = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
const combo = (label: string) =>
  renderToStaticMarkup(
    React.createElement(Combobox, {
      mode: "combobox",
      "aria-label": label,
      value: "a",
      options: [{ value: "a", label: "Alpha" }],
      onChange: () => {},
    }),
  );
const FX = '<button type="button" class="w6w-expr-fx">ƒx</button>';
const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<label id="g1" class="w6w-field" style="width:600px"><span>Action</span>${combo("g1")}</label>
<div class="w6w-field" style="width:600px"><div id="g2" class="w6w-fx-wrap"><div class="w6w-fx-grow">${combo("g2")}</div>${FX}</div></div>
<div class="w6w-field" style="width:600px"><div id="g3" class="w6w-fx-wrap">${combo("g3")}${FX}</div></div>
</body></html>`;

let browser: Awaited<ReturnType<typeof chromium.launch>>;
let page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>;
before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent(HTML);
});
after(async () => {
  await browser?.close();
});

const box = (sel: string) =>
  page.evaluate((s) => {
    const r = (document.querySelector(s) as HTMLElement).getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width };
  }, sel);

test("C1 a Combobox in a plain .w6w-field fills the field's width", async () => {
  const field = await box("#g1");
  const input = await box('#g1 input[aria-label="g1"]');
  assert.ok(input.width >= field.width - 1, `C1 input ${input.width} vs field ${field.width}`);
});

for (const id of ["g2", "g3"]) {
  test(`C2 ${id}: inside .w6w-fx-wrap the input grows and ƒx sits at the field's right end`, async () => {
    const wrap = await box(`#${id}`);
    const input = await box(`#${id} input[aria-label="${id}"]`);
    const fx = await box(`#${id} .w6w-expr-fx`);
    assert.ok(wrap.right - fx.right <= 12, `C2 ${id} ƒx gap to right edge ${wrap.right - fx.right}`);
    assert.ok(input.width >= wrap.width * 0.75, `C2 ${id} input ${input.width} of ${wrap.width}`);
  });
}
