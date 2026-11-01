// Exercise auto-layout, section geometry and undo through the real editor button.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("vite")] }));
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("./harness.tsx", import.meta.url))],
  bundle: true,
  write: false,
  conditions: ["w6w-source"],
  jsx: "automatic",
  format: "iife",
});
const css = await readFile(new URL("../../src/styles.css", import.meta.url));
const browser = await chromium.launch({
  args: ["--no-sandbox"],
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
const workflow = {
  manifestVersion: "2",
  id: "wf_layout",
  name: "Order email",
  nodes: [
    {
      id: "order_placed",
      uses: { app: "cohost", action: "order-placed", trigger: true },
      position: { x: 40, y: 300 },
    },
    { id: "manual", uses: { app: "@w6w/trigger", action: "manual" }, position: { x: 40, y: 40 } },
    { id: "get_order", uses: { app: "cohost", action: "get-order" }, position: { x: 600, y: 40 } },
    { id: "data", uses: { app: "@w6w/data", action: "set" }, position: { x: 600, y: 300 } },
    { id: "get_entry", uses: { app: "@w6w/store", action: "get" }, position: { x: 650, y: 500 } },
    {
      id: "render_subject",
      uses: { app: "@w6w/template", action: "render" },
      position: { x: 650, y: 650 },
    },
    {
      id: "render_body",
      uses: { app: "@w6w/template", action: "render" },
      position: { x: 900, y: 650 },
    },
    { id: "send", uses: { app: "other", action: "mail-send" }, position: { x: 650, y: 850 } },
  ],
  edges: [
    { from: "order_placed", to: "data" },
    { from: "manual", to: "get_order" },
    { from: "get_order", to: "data" },
    { from: "data", to: "get_entry" },
    { from: "get_entry", to: "render_subject" },
    { from: "render_subject", to: "render_body" },
    { from: "render_body", to: "send" },
  ],
  canvas: {
    sections: [
      {
        id: "parse",
        title: "Parse template",
        color: "#6366f1",
        nodes: ["get_entry", "render_subject", "render_body"],
        position: { x: 600, y: 450 },
        size: { width: 550, height: 300 },
      },
    ],
  },
};
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://preview.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType:
        path === "/" ? "text/html" : path.endsWith("css") ? "text/css" : "application/javascript",
      body:
        path === "/"
          ? '<html data-theme="light"><head><link rel="stylesheet" href="/ui.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'
          : path.endsWith("css")
            ? css
            : Buffer.from(bundle.outputFiles[0].contents),
    });
  });
  await page.goto("http://preview.test/");
  await page.getByTestId("rf__node-find_webhook").waitFor();
  await page.evaluate((wf) => window.__setWorkflow(wf), workflow);
  await page.getByTestId("rf__node-order_placed").waitFor();
  await page.waitForFunction(
    () => document.querySelector('[data-id="order_placed"]')?.getBoundingClientRect().width > 0,
  );
  const before = await page.evaluate(() => window.__value);
  await page.getByRole("button", { name: "Auto-layout the graph", exact: true }).click();
  await page.waitForFunction(() => window.__value.canvas.sections[0].position.x !== 600);
  const next = await page.evaluate(() => window.__value);
  const pos = (id) => next.nodes.find((n) => n.id === id).position;
  assert.equal(pos("order_placed").x, pos("manual").x);
  assert.notEqual(pos("order_placed").y, pos("manual").y);
  assert.equal(pos("get_order").y, pos("manual").y);
  assert.equal(pos("data").y, pos("order_placed").y);
  assert.deepEqual(next.edges, before.edges);
  assert.deepEqual(
    next.nodes.map(({ position, ...rest }) => rest),
    before.nodes.map(({ position, ...rest }) => rest),
  );
  assert.deepEqual(next.canvas.sections[0].nodes, before.canvas.sections[0].nodes);
  // Wait for fitView's animation before measuring the screen-space rectangles.
  await page.waitForTimeout(400);
  const frame = await page.locator('[data-section-id="parse"]').boundingBox();
  assert.ok(frame);
  for (const n of workflow.nodes) {
    const rect = await page.getByTestId(`rf__node-${n.id}`).boundingBox();
    assert.ok(rect);
    const inside =
      rect.x >= frame.x &&
      rect.y >= frame.y &&
      rect.x + rect.width <= frame.x + frame.width &&
      rect.y + rect.height <= frame.y + frame.height;
    const overlaps =
      rect.x < frame.x + frame.width &&
      rect.x + rect.width > frame.x &&
      rect.y < frame.y + frame.height &&
      rect.y + rect.height > frame.y;
    const member = next.canvas.sections[0].nodes.includes(n.id);
    assert.equal(member ? inside : overlaps, member, `${n.id} section bounds`);
  }
  // The direct trigger edge must not touch the unrelated Get order card.
  const blocked = await page.evaluate(() => {
    const card = document.querySelector('[data-id="get_order"]').getBoundingClientRect();
    const path = document.querySelector(
      '[data-testid="rf__edge-order_placed->data"] .react-flow__edge-path',
    );
    const matrix = path.getScreenCTM();
    for (let at = 0; at <= path.getTotalLength(); at += 2) {
      const p = path.getPointAtLength(at).matrixTransform(matrix);
      if (p.x > card.left && p.x < card.right && p.y > card.top && p.y < card.bottom) return true;
    }
    return false;
  });
  assert.equal(blocked, false);
  await page.screenshot({ path: process.env.LAYOUT_SCREENSHOT ?? "/tmp/workflow-auto-layout.png" });
  console.log("PASS: separate trigger paths, measured spacing, and correct section bounds");
  await page.locator(".react-flow__pane").click({ position: { x: 1040, y: 550 } });
  await page.keyboard.press("Control+z");
  const undo = await page.evaluate(() => window.__value);
  assert.deepEqual(undo.nodes, before.nodes);
  assert.deepEqual(undo.canvas, before.canvas);
  assert.deepEqual(undo.edges, before.edges);
  await page.keyboard.press("Control+Shift+z");
  const redo = await page.evaluate(() => window.__value);
  assert.deepEqual(redo.nodes, next.nodes);
  assert.deepEqual(redo.canvas, next.canvas);
  await page.evaluate(() => window.__reload());
  await page.getByTestId("rf__node-order_placed").waitFor();
  assert.deepEqual((await page.evaluate(() => window.__value)).canvas, next.canvas);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: one undo/redo restores nodes and sections together; saved layout survives reload",
  );
  const zoom = () =>
    page
      .locator(".react-flow__viewport")
      .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
  const zoomOut = page.locator(".react-flow__controls-zoomout");
  for (let i = 0; i < 30 && (await zoomOut.isEnabled()); i++) {
    await zoomOut.click();
  }
  assert.ok(Math.abs((await zoom()) - 0.05) < 0.001, "can zoom out to 5%");
  // A wheel gesture persists the viewport; fit/zoom helper calls intentionally do not.
  await page.locator(".react-flow__controls-zoomin").click();
  await page.mouse.move(900, 550);
  await page.mouse.wheel(0, 600);
  await page.waitForFunction(() => window.__value.settings?.viewport?.zoom === 0.05);
  assert.equal((await page.evaluate(() => window.__value)).settings.viewport.zoom, 0.05);
  await page.evaluate(() => window.__reload());
  await page.getByTestId("rf__node-order_placed").waitFor();
  assert.ok(Math.abs((await zoom()) - 0.05) < 0.001, "5% zoom survives reload");
  await page.evaluate(
    (wf) =>
      window.__setWorkflow({
        ...wf,
        id: "wf_wide",
        canvas: {},
        nodes: wf.nodes.map((n) => ({ ...n, position: { x: n.position.x * 10, y: n.position.y } })),
      }),
    workflow,
  );
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForFunction(
    () =>
      new DOMMatrixReadOnly(
        getComputedStyle(document.querySelector(".react-flow__viewport")).transform,
      ).a < 0.5,
  );
  assert.ok((await zoom()) < 0.5, "Fit view also passes the old limit");
  assert.deepEqual(errors, []);
  console.log("PASS: zoom-out reaches 5%, persists on reload, and Fit view fits wide workflows");
} finally {
  await browser.close();
}
