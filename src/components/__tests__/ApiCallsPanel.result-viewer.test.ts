// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/components/__tests__/ApiCallsPanel.result-viewer.test.ts  (Node 24)
//
// T0.1.2 — the captured request/response BODIES render through `ResultViewer`
// (format-sniffed: a JSON body becomes a tree, an HTML body an empty-sandbox
// iframe), while the header panes stay plain `<pre className="w6w-result">`.
// jsdom rig = `Copyable.test.ts`'s header, copied verbatim: `ResultViewer` wraps
// its body in `Copyable`, whose hover/copied state machine needs the same
// `navigator` + `matchMedia` + `MutationObserver` globals. jsdom executes no
// iframe, so this file proves only WHERE the body markup went (an iframe
// `srcdoc`, never this document) — the real-Chromium claim is
// `test/html-preview/html-preview-xss.test.ts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;
g.matchMedia =
  dom.window.matchMedia ??
  ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
(dom.window as unknown as Record<string, unknown>).matchMedia = g.matchMedia;

class FakeMutationObserver {
  observe() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
g.MutationObserver =
  (dom.window as unknown as Record<string, unknown>).MutationObserver ?? FakeMutationObserver;
(dom.window as unknown as Record<string, unknown>).MutationObserver = g.MutationObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { ApiCallsPanel } = await import("../ApiCallsPanel.tsx");
type ApiCallRecord = import("../../types.ts").ApiCallRecord;

/** One captured call: a JSON request body, an HTML response body. */
const CALL: ApiCallRecord = {
  host: "api.vendor.test",
  method: "POST",
  status: 200,
  url: "https://api.vendor.test/v1/things",
  requestHeaders: { "content-type": "application/json" },
  requestBody: '{"q":1}',
  responseHeaders: { "content-type": "text/html" },
  responseBody: "<!doctype html><h1>x</h1>",
  durationMs: 12,
};

async function mount(calls: ApiCallRecord[], defaultOpen = false) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ApiCallsPanel, { calls, defaultOpen }));
  });
  return { container, root };
}

const unmount = (root: { unmount(): void }) =>
  act(async () => {
    root.unmount();
  });

test("JSON and HTML bodies render through ResultViewer; headers stay <pre>", async () => {
  const { container, root } = await mount([CALL], true);
  assert.equal(container.querySelectorAll("details.w6w-result").length, 1, "one call, one details");
  assert.equal(
    container.querySelectorAll('.w6w-result-viewer[data-format="json"]').length,
    1,
    "request body is sniffed as JSON",
  );
  assert.equal(
    container.querySelectorAll('.w6w-result-viewer[data-format="html"]').length,
    1,
    "response body is sniffed as HTML",
  );
  assert.equal(
    container.querySelectorAll("pre.w6w-result").length,
    2,
    "only the two header panes are still <pre>",
  );
  await unmount(root);
});

test("a call with no captured bodies renders no ResultViewer at all", async () => {
  const { container, root } = await mount([{ ...CALL, requestBody: null, responseBody: null }]);
  assert.equal(container.querySelectorAll(".w6w-result-viewer").length, 0);
  assert.equal(container.querySelectorAll("pre.w6w-result").length, 2, "headers only");
  await unmount(root);
});
