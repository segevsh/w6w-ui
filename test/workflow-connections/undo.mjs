// Exercise workflow undo with the real editor and its existing connection fixture.
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
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://preview.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path === "/"
        ? "text/html"
        : path.endsWith("css")
        ? "text/css"
        : "application/javascript",
      body: path === "/"
        ? '<html data-theme="light"><head><link rel="stylesheet" href="/ui.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'
        : path.endsWith("css")
        ? css
        : Buffer.from(bundle.outputFiles[0].contents),
    });
  });
  const fresh = async () => {
    await page.goto("http://preview.test/");
    await page.getByTestId("rf__node-find_webhook").waitFor();
  };
  const definition = () => page.evaluate(() => window.__value);
  const canvasKey = async (key) => {
    await page.locator(".react-flow__pane").click({ position: { x: 1040, y: 550 } });
    await page.keyboard.press(key);
  };
  const close = async () => {
    await page.keyboard.press("Escape");
    await page.locator("dialog").waitFor({ state: "hidden" });
  };
  const open = async (id) => page.getByTestId(`rf__node-${id}`).dblclick();
  const account = (wf, id) => {
    const uses = wf.nodes.find((n) => n.id === id).uses;
    return uses.connectionRef ? wf.connections[uses.connectionRef].connection : uses.connection;
  };
  const wire = async (from, to) => {
    const source = await page.getByTestId(`rf__node-${from}`).locator(
      ".react-flow__handle.source:not(.w6w-handle-error)",
    ).first().boundingBox();
    const target = await page.getByTestId(`rf__node-${to}`).locator(".react-flow__handle.target")
      .boundingBox();
    assert.ok(source && target);
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(
      ({ from, to }) => window.__value.edges.some((e) => e.from === from && e.to === to),
      { from, to },
    );
  };

  await fresh();
  await page.getByRole("button", { name: "+ Node", exact: true }).click();
  await page.getByRole("button", { name: "Controls", exact: true }).click();
  await page.locator(".w6w-stepbuilder-item").filter({
    has: page.getByText("Race", { exact: true }),
  }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal((await definition()).nodes.length, 5);
  // Cmd on macOS and Ctrl on Windows/Linux both work.
  await canvasKey("Meta+z");
  assert.equal((await definition()).nodes.length, 4);
  await canvasKey("Control+Shift+z");
  assert.equal((await definition()).nodes.length, 5);
  await canvasKey("Control+z");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await canvasKey("Control+y");
  assert.equal((await definition()).nodes.length, 4, "a new edit invalidates redo");
  console.log("PASS: node addition, Cmd/Ctrl undo, redo, and branching history");

  await fresh();
  await wire("find_webhook", "create_webhook");
  await canvasKey("Control+z");
  assert.equal((await definition()).edges.length, 0);
  await canvasKey("Meta+Shift+z");
  assert.equal((await definition()).edges.length, 1);
  await page.getByTestId("rf__node-find_webhook").click();
  await page.getByRole("button", { name: "Delete node", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  assert.equal((await definition()).nodes.length, 3);
  await canvasKey("Control+z");
  assert.equal((await definition()).nodes.length, 4);
  assert.deepEqual((await definition()).edges, [{ from: "find_webhook", to: "create_webhook" }]);
  console.log("PASS: connecting, deleting, and restoring nodes with their edges");

  for (const savePosition of [true, false]) {
    await fresh();
    await page.evaluate((savePosition) =>
      window.__setWorkflow({
        ...window.__value,
        id: `wf_drag_${savePosition}`,
        settings: { savePosition },
      }), savePosition);
    const card = page.getByTestId("rf__node-find_webhook");
    await card.click();
    const before = await card.boundingBox();
    await page.mouse.move(before.x + 60, before.y + 15);
    await page.mouse.down();
    await page.mouse.move(before.x + 140, before.y + 75, { steps: 12 });
    await page.mouse.up();
    assert.ok((await card.boundingBox()).x > before.x + 30);
    await canvasKey("Control+z");
    const after = await card.boundingBox();
    assert.ok(Math.abs(after.x - before.x) < 1);
    assert.ok(Math.abs(after.y - before.y) < 1);
  }
  console.log("PASS: one undo per drag, with or without persisted positions");

  await fresh();
  await open("create_webhook");
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByRole("button", { name: "Connection", exact: true }).click();
  await page.getByRole("button", { name: "find_webhook Segev account", exact: true }).click();
  await close();
  assert.equal(account(await definition(), "create_webhook"), "conn_a");
  await canvasKey("Control+z");
  assert.equal(account(await definition(), "create_webhook"), "conn_b");
  await canvasKey("Control+y");
  await open("find_webhook");
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByRole("button", { name: "Connection", exact: true }).click();
  await page.getByRole("button", { name: "Change shared connection…", exact: true }).click();
  await page.getByRole("button", { name: "Eventbrite account connected", exact: true }).click();
  // Undo while the modal remains open must refresh its form as well as the definition.
  await page.keyboard.press("Control+z");
  assert.equal(account(await definition(), "find_webhook"), "conn_a");
  assert.equal(account(await definition(), "create_webhook"), "conn_a");
  assert.match(
    await page.getByRole("button", { name: "Connection", exact: true }).innerText(),
    /Segev account/,
  );
  await close();
  console.log("PASS: individual and shared connection undo, including the open editor");

  await fresh();
  await wire("find_webhook", "create_webhook");
  await open("find_webhook");
  const note = page.getByRole("textbox", { name: "Note", exact: true });
  await note.pressSequentially("Updated configuration");
  await page.getByRole("button", { name: "Test", exact: true }).first().click();
  await page.evaluate(() => {
    window.__holdTest = true;
  });
  await page.getByRole("button", { name: "Test", exact: true }).last().click();
  await page.waitForFunction(() => window.__releaseTest);
  // The pending test finishes normally even if its authored parameters are undone.
  await page.keyboard.press("Control+z");
  assert.equal(
    (await definition()).nodes.find((n) => n.id === "find_webhook").with?.note,
    undefined,
  );
  await page.evaluate(() => window.__releaseTest());
  await page.waitForFunction(() => window.__testRuns.length === 1);
  assert.match(await page.locator(".w6w-steptest").innerText(), /learnedField/);
  await page.keyboard.press("Control+Shift+z");
  await page.keyboard.press("Control+z");
  assert.equal(
    (await definition()).nodes.find((n) => n.id === "find_webhook").with?.note,
    undefined,
  );
  assert.match(
    await page.locator(".w6w-steptest").innerText(),
    /learnedField/,
    "undo keeps the displayed test result",
  );
  assert.equal(await page.evaluate(() => window.__testRuns.length), 1);
  await page.getByRole("button", { name: "Configure", exact: true }).click();
  assert.equal(await note.inputValue(), "", "typing is one workflow edit");
  await page.keyboard.press("Control+Shift+z");
  assert.equal(await note.inputValue(), "Updated configuration");
  await close();
  await open("create_webhook");
  await page.getByRole("button", { name: "Use an expression for Note", exact: true }).click();
  await page.getByRole("button", { name: "Show fields", exact: true }).first().click();
  assert.match(
    await page.locator("dialog").last().innerText(),
    /learnedField/,
    "the learned output shape remains available to downstream fields",
  );
  console.log("PASS: configuration undo keeps test results and learned output fields");

  await fresh();
  await open("find_webhook");
  await note.pressSequentially("Typing");
  await note.press("Control+z");
  assert.equal((await definition()).nodes.length, 4, "native input undo cannot remove a step");
  assert.equal(await note.inputValue(), "", "text input retains native undo");
  await note.pressSequentially("Saved edit");
  await close();
  await page.evaluate(() => window.__setReadOnly(true));
  await canvasKey("Control+z");
  assert.equal(
    (await definition()).nodes.find((n) => n.id === "find_webhook").with.note,
    "Saved edit",
  );
  await page.evaluate(() => window.__setReadOnly(false));
  await page.evaluate(() => window.__setWorkflow({ ...window.__value, id: "wf_other" }));
  await canvasKey("Control+z");
  assert.equal(
    (await definition()).nodes.find((n) => n.id === "find_webhook").with.note,
    "Saved edit",
    "a different workflow starts with empty history",
  );
  console.log("PASS: native text undo, read-only gating, and workflow isolation");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
