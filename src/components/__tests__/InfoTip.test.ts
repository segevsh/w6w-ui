// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/components/__tests__/InfoTip.test.ts  (Node 24)
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { InfoTip } = await import("../InfoTip.tsx");

test("InfoTip — collapsed by default; click expands, second click collapses; name and title equal label", async () => {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(InfoTip, { label: "About secrets", children: "Hidden copy" }));
  });
  const btn = container.querySelector("button") as HTMLButtonElement;
  assert.ok(btn);
  assert.equal(btn.getAttribute("aria-label"), "About secrets");
  assert.equal(btn.getAttribute("title"), "About secrets");
  assert.equal(btn.getAttribute("aria-expanded"), "false");
  assert.ok(!container.textContent?.includes("Hidden copy"));

  await act(async () => {
    btn.click();
  });
  assert.equal(btn.getAttribute("aria-expanded"), "true");
  assert.ok(container.textContent?.includes("Hidden copy"));
  const controls = btn.getAttribute("aria-controls");
  assert.ok(controls);
  assert.equal(document.getElementById(controls)?.textContent, "Hidden copy");

  await act(async () => {
    btn.click();
  });
  assert.equal(btn.getAttribute("aria-expanded"), "false");
  assert.ok(!container.textContent?.includes("Hidden copy"));
  await act(async () => root.unmount());
});

test("InfoTip — aria-controls is on the button in the INITIAL server markup (no effect needed)", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const html = renderToStaticMarkup(
    React.createElement(InfoTip, { label: "About secrets", children: "Hidden copy" }),
  );
  assert.match(html, /<button[^>]*aria-controls="[^"]+"/);
  assert.doesNotMatch(html, /Hidden copy/);
});
