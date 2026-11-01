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
  const choose = (id) => page.locator(`[data-connection-id="${id}"]`).click();
  const connectionButton = () => page.getByRole("button", { name: "Connection", exact: true });
  const definition = () => page.evaluate(() => window.__value);
  const node = (wf, id) => wf.nodes.find((n) => n.id === id);
  const account = (wf, id) => {
    const uses = node(wf, id).uses;
    return uses.connectionRef ? wf.connections[uses.connectionRef].connection : uses.connection;
  };
  const startAdd = async (name) => {
    await page.getByRole("button", { name: "+ Node", exact: true }).click();
    await page.getByRole("button", { name: "Apps", exact: true }).click();
    await page.locator(".w6w-stepbuilder-item").filter({ has: page.getByText(name, { exact: true }) }).click();
    await connectionButton().waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector('button[aria-label="Connection"]')?.disabled);
  };
  const pickAction = async (count) => {
    await page.getByPlaceholder("— pick an action —").click();
    await page.getByRole("option", { name: "List webhooks (list)", exact: true }).click();
    await page.waitForFunction((count) => window.__value.nodes.length === count, count);
  };

  await open("create_webhook");
  assert.match(await page.locator('[data-connection-id="conn_b"]').innerText(), /In use in this workflow.*create_webhook, get_event/);
  assert.equal(await page.getByText("Use connection from a node", { exact: true }).count(), 0);
  await choose("conn_b");
  assert.equal(await page.getByRole("button", { name: "Only this node" }).count(), 0, "same-account selection does not prompt");
  await connectionButton().click();
  const unchanged = await definition();
  await choose("conn_a");
  let confirm = page.getByRole("dialog", { name: "Change connection", exact: true });
  assert.equal(await confirm.locator("li").allTextContents().then(a => a.join(",")), "create_webhook,get_event");
  assert.equal(await confirm.locator("dialog").count(), 0);
  assert.equal(await page.locator("dialog dialog").count(), 0, "confirmation is a sibling dialog");
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.deepEqual(await definition(), unchanged);
  await connectionButton().click();
  await choose("conn_a");
  await page.getByRole("button", { name: "Only this node", exact: true }).click();
  let wf = await definition();
  assert.equal(account(wf, "create_webhook"), "conn_a");
  assert.equal(account(wf, "get_event"), "conn_b");
  assert.equal(node(wf, "create_webhook").uses.connectionRef, node(wf, "find_webhook").uses.connectionRef);
  await close();

  await open("find_webhook");
  await choose("conn_b");
  await page.getByRole("button", { name: "All 2 nodes", exact: true }).click();
  await close();
  // All three now use conn_b, under two independent reference keys.
  await open("get_event");
  await choose("conn_a");
  assert.deepEqual((await page.getByRole("dialog", { name: "Change connection", exact: true }).locator("li").allTextContents()).sort(), ["create_webhook", "find_webhook", "get_event"]);
  await page.getByRole("button", { name: "All 3 nodes", exact: true }).click();
  wf = await definition();
  for (const id of ["create_webhook", "find_webhook", "get_event"]) assert.equal(account(wf, id), "conn_a");
  assert.equal(account(wf, "other_app"), "conn_other");
  assert.equal(wf.nodes.filter(n => n.uses.connection).length, 0);
  await close();
  await page.evaluate(() => window.__reload());
  await open("get_event");
  assert.equal(await connectionButton().innerText(), "Segev account");
  await connectionButton().click();
  await page.getByRole("button", { name: "Test", exact: true }).first().click();
  await page.getByRole("button", { name: "Test", exact: true }).last().click();
  await page.waitForFunction(() => window.__invoke);
  assert.equal(await page.evaluate(() => window.__invoke.connectionId), "conn_a");
  await close();
  console.log("PASS: account annotations, cancel, only-this-node, all separate/shared bindings, reload, invocation");

  await startAdd("Eventbrite");
  assert.equal(await connectionButton().innerText(), "Segev account");
  assert.equal(await page.locator(".w6w-app-conn-row button").count(), 2);
  await connectionButton().click();
  await choose("conn_b");
  assert.equal(await page.getByRole("button", { name: "Only this node" }).count(), 0, "uncommitted draft never changes existing nodes");
  assert.equal(account(await definition(), "get_event"), "conn_a");
  await pickAction(5);
  wf = await definition();
  const addedId = wf.nodes.at(-1).id;
  assert.equal(account(wf, addedId), "conn_b");
  await connectionButton().click();
  await choose("conn_a");
  await connectionButton().click();
  await choose("conn_b");
  await page.getByRole("button", { name: "Only this node", exact: true }).click();
  await page.getByRole("button", { name: "Configure", exact: true }).click();
  const beforeParams = await definition();
  await page.getByLabel("Note", { exact: true }).fill("first");
  await page.getByLabel("Note", { exact: true }).fill("second");
  await page.getByLabel("Note", { exact: true }).blur();
  await page.waitForFunction((id) => window.__value.nodes.find(n => n.id === id)?.with?.note === "second", addedId);
  wf = await definition();
  assert.deepEqual(Object.keys(wf.connections), Object.keys(beforeParams.connections));
  assert.equal(account(wf, addedId), "conn_b");
  assert.equal(account(wf, "get_event"), "conn_a");
  await close();
  await startAdd("Eventbrite");
  assert.equal(await connectionButton().innerText(), "Eventbrite account", "last added same-app node wins");
  await close();
  console.log("PASS: latest-node defaults, draft isolation, progressive add, stable references during parameter edits");

  await page.evaluate(() => window.__setWorkflow({ manifestVersion: "2", id: "cohost_flow", name: "Cohost flow", nodes: [], edges: [] }));
  await startAdd("Cohost");
  assert.equal(await connectionButton().innerText(), "Default");
  assert.equal(await page.getByText(/Connected automatically|Use connection from a node/).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Create connection", exact: true }).count(), 0);
  await page.screenshot({ path: "/tmp/connection-picker-cohost.png" });
  await pickAction(1);
  let cohostId = (await definition()).nodes[0].id;
  assert.equal(account(await definition(), cohostId), "zerocred:cohost");
  await connectionButton().click();
  await choose("cohost_account");
  await close();
  await startAdd("Cohost");
  assert.equal(await connectionButton().innerText(), "Cohost account");
  await pickAction(2);
  await connectionButton().click();
  assert.match(await page.locator('[data-connection-id="cohost_account"]').innerText(), /In use in this workflow/);
  await choose("zerocred:cohost");
  await page.screenshot({ path: "/tmp/connection-picker-confirm.png" });
  await page.getByRole("button", { name: "All 2 nodes", exact: true }).click();
  await page.waitForFunction(() => window.__value.nodes.every(n => window.__value.connections[n.uses.connectionRef].connection === "zerocred:cohost"));
  await close();
  await open((await definition()).nodes.at(-1).id);
  assert.equal(await connectionButton().innerText(), "Default");
  console.log("PASS: Cohost default, existing account inheritance, progressive shared switch, consistent add/edit UI");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
