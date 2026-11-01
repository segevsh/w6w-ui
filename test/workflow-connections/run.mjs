// node test/workflow-connections/run.mjs
// Uses local Playwright Chromium. Bundles this checkout in memory; no server or DB.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const { build } = require(
  require.resolve("esbuild", { paths: [require.resolve("vite")] }),
);
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("./harness.tsx", import.meta.url))],
  bundle: true,
  write: false,
  conditions: ["w6w-source"],
  jsx: "automatic",
  format: "iife",
});
const css = await readFile(new URL("../../src/styles.css", import.meta.url));
const browser = await chromium.launch({ args: ["--no-sandbox"], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
try {
  const page = await browser.newPage({
    viewport: { width: 1150, height: 800 },
  });
  page.setDefaultTimeout(8000);
  const errors = [];
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
  await page.goto("http://preview.test/");
  const open = async (id) => {
    await page.getByTestId(`rf__node-${id}`).dblclick();
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    await page.getByRole("button", { name: "Connection", exact: true }).click();
  };
  const close = async () => {
    await page.keyboard.press("Escape");
    await page.locator("dialog").waitFor({ state: "hidden" });
  };
  const selectSource = () =>
    page.getByRole("button", {
      name: "find_webhook Segev account",
      exact: true,
    }).click();
  const selectAccount = () =>
    page.getByRole("button", {
      name: "Eventbrite account connected",
      exact: true,
    }).click();
  const definition = () => page.evaluate(() => window.__value);
  const node = (wf, id) => wf.nodes.find((n) => n.id === id);

  await open("create_webhook");
  assert.equal(
    await page.getByRole("button", { name: /other_app/ }).count(),
    0,
  );
  await selectSource();
  await page.waitForFunction(() => {
    const nodes = window.__value.nodes;
    return nodes.find((n) => n.id === "create_webhook").uses.connectionRef ===
      nodes.find((n) => n.id === "find_webhook").uses.connectionRef;
  });
  let wf = await definition();
  assert.ok(wf.connections);
  assert.equal(wf.nodes.filter((n) => n.uses.connection).length, 0);
  await close();
  await open("get_event");
  await selectSource();
  await close();

  // Selecting an account detaches only the selected node.
  await open("create_webhook");
  await selectAccount();
  wf = await definition();
  assert.notEqual(
    node(wf, "create_webhook").uses.connectionRef,
    node(wf, "find_webhook").uses.connectionRef,
  );
  assert.equal(
    node(wf, "get_event").uses.connectionRef,
    node(wf, "find_webhook").uses.connectionRef,
  );
  await close();

  // An explicit shared edit updates every consumer and survives a remount.
  await open("find_webhook");
  await page.getByRole("button", {
    name: "Change shared connection…",
    exact: true,
  }).click();
  await selectAccount();
  wf = await definition();
  assert.equal(
    wf.connections[node(wf, "get_event").uses.connectionRef].connection,
    "conn_b",
  );
  await close();
  await page.evaluate(() => window.__reload());
  await open("get_event");
  assert.match(
    await page.getByRole("button", { name: "Connection", exact: true })
      .innerText(),
    /Shared.*Eventbrite account/,
  );
  await page.getByRole("button", { name: "Connection", exact: true }).click();
  await page.getByRole("button", { name: "Test", exact: true }).first().click();
  await page.getByRole("button", { name: "Test", exact: true }).last().click();
  await page.waitForFunction(() => window.__invoke);
  assert.equal(
    await page.evaluate(() => window.__invoke.connectionId),
    "conn_b",
  );
  await close();
  await page.getByRole("button", { name: "+ Node", exact: true }).click();
  await page.getByRole("button", { name: "Apps", exact: true }).click();
  await page.getByRole("button", { name: /Eventbrite/ }).click();
  await page.getByRole("button", { name: "Change", exact: true }).last()
    .click();
  await page.getByRole("button", {
    name: "find_webhook Eventbrite account",
    exact: true,
  }).click();
  await page.getByPlaceholder("— pick an action —").click();
  await page.getByRole("option", { name: "List webhooks (list)", exact: true })
    .click();
  await page.waitForFunction(() => window.__value.nodes.length === 5);
  wf = await definition();
  const addedId = wf.nodes.at(-1).id;
  assert.equal(
    node(wf, addedId).uses.connectionRef,
    node(wf, "find_webhook").uses.connectionRef,
  );
  // A direct selection on the progressive add form detaches once, then parameter
  // edits keep the same binding instead of allocating one per keystroke.
  await page.getByRole("button", { name: "Change", exact: true }).last()
    .click();
  await page.locator("dialog select").selectOption("conn_a");
  await page.getByRole("button", { name: "Configure", exact: true }).click();
  const beforeParams = await definition();
  await page.getByLabel("Note", { exact: true }).fill("first");
  await page.getByLabel("Note", { exact: true }).fill("second");
  await page.getByLabel("Note", { exact: true }).blur();
  await page.waitForFunction(
    (id) =>
      window.__value.nodes.find((n) => n.id === id)?.with?.note === "second",
    addedId,
  );
  wf = await definition();
  assert.equal(node(wf, addedId).with.note, "second");
  assert.deepEqual(
    Object.keys(wf.connections),
    Object.keys(beforeParams.connections),
  );
  assert.equal(
    wf.connections[node(wf, addedId).uses.connectionRef].connection,
    "conn_a",
  );
  assert.equal(
    wf.connections[node(wf, "find_webhook").uses.connectionRef].connection,
    "conn_b",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: sharing, node-only switch, shared edit, JSON persistence, reload and test invocation",
  );
} finally {
  await browser.close();
}
