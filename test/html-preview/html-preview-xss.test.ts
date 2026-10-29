// Real-Chromium XSS / beacon gate for HtmlPreview (T0.1.1). The markup under test is the REAL
// component rendered by react-dom/server, loaded into headless Chromium (host playwright-core);
// a local HTTP server records every request the preview makes. jsdom executes no iframe, so only
// a real browser can show that a hostile payload neither runs script nor reaches the network.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";

const React = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { HtmlPreview } = await import("../../src/components/HtmlPreview.tsx");

const hits: string[] = [];
let page = "";
const server = createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(page);
    return;
  }
  hits.push(String(req.url));
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("");
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const ORIGIN = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const PAYLOAD = [
  '<h1 id="xss-h1">vendor page</h1>',
  '<script>parent.postMessage("script-ran","*")</script>',
  `<img src="${ORIGIN}/img-beacon">`,
  `<img src="x" onerror="parent.postMessage('onerror-ran','*')">`,
  `<link rel="stylesheet" href="${ORIGIN}/css-beacon">`,
  `<style>@import url("${ORIGIN}/import-beacon");</style>`,
  `<iframe src="${ORIGIN}/frame-beacon"></iframe>`,
  `<base href="${ORIGIN}/base/"><img src="rel-beacon">`,
].join("\n");

let browser: Awaited<ReturnType<typeof chromium.launch>>;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server.close();
});

async function open() {
  const markup = renderToStaticMarkup(React.createElement(HtmlPreview, { html: PAYLOAD }));
  page = `<!doctype html><html><body><script>window.__msgs=[];addEventListener("message",(e)=>window.__msgs.push(String(e.data)));</script>${markup}</body></html>`;
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${ORIGIN}/`);
  return { ctx, p };
}

test("X1 attributes: sandbox is present and empty; CSP meta is the first thing in srcdoc", async () => {
  const { ctx, p } = await open();
  const iframe = p.locator("iframe.w6w-html-preview");
  assert.equal(await iframe.getAttribute("sandbox", { timeout: 5000 }), "", "X1 sandbox");
  const srcdoc = (await iframe.getAttribute("srcdoc", { timeout: 5000 })) ?? "";
  assert.ok(
    srcdoc.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"'),
    "X1 CSP meta first",
  );
  await ctx.close();
});

test("X2 behaviour: payload renders, runs no script, makes no request", async () => {
  hits.length = 0;
  const { ctx, p } = await open();
  const frame = p.frameLocator("iframe.w6w-html-preview");
  assert.equal(
    await frame.locator("#xss-h1").textContent({ timeout: 5000 }),
    "vendor page",
    "X2 rendered",
  );
  await p.waitForTimeout(1500);
  const msgs = await p.evaluate(() => (window as unknown as { __msgs: string[] }).__msgs);
  assert.deepEqual(msgs, [], "X2 no script ran");
  assert.deepEqual(hits, [], "X2 no request");
  await ctx.close();
});
