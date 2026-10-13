// Run (from packages/ui): node --experimental-strip-types --import ./src/test-jsx-loader.mjs --test src/__tests__/ExecutionLogPanel.meta.test.ts
// T3.2.3: the Metadata block beside Output in a run-inspection row (R-12: absent stays absent).
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body></body></html>");
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;
g.matchMedia = (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});
(dom.window as unknown as Record<string, unknown>).matchMedia = g.matchMedia;
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { ExecutionLogPanel } = await import("../components/ExecutionLogPanel.tsx");

type Step = Parameters<typeof ExecutionLogPanel>[0]["steps"][number];
const META = {
  app: "io.w6w.eventbrite",
  version: "1.2.3",
  action: "get-event",
  connectionId: "conn_1",
};

async function mount(step: Step, expand = true) {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ExecutionLogPanel, { steps: [step] }));
  });
  const details = container.querySelector("details");
  if (expand && details) {
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new dom.window.Event("toggle", { bubbles: true }));
    });
  }
  return container;
}
const headings = (c: HTMLElement) =>
  Array.from(c.querySelectorAll(".w6w-execution-log-json strong")).map((e) => e.textContent);

test("E1 - input + output + meta: Input, Output, Metadata in order, with the values", async () => {
  const c = await mount({
    id: "s",
    status: "succeeded",
    input: { a: 1 },
    output: { b: 2 },
    meta: META,
  });
  assert.deepEqual(headings(c), ["Input", "Output", "Metadata"]);
  const body = c.querySelector(".w6w-execution-log-row-body")?.textContent ?? "";
  assert.ok(body.includes('"connectionId": "conn_1"'));
  assert.ok(body.includes('"version": "1.2.3"'));
  assert.ok(body.includes("io.w6w.eventbrite"));
  assert.ok(body.includes("get-event"));
});

test("E2 - no meta: two JSON blocks and no Metadata text", async () => {
  const c = await mount({ id: "s", status: "succeeded", input: { a: 1 }, output: { b: 2 } });
  assert.equal(c.querySelectorAll(".w6w-execution-log-json").length, 2);
  assert.equal(c.textContent?.includes("Metadata"), false);
});

test("E3 - a failed step with error + meta only is expandable and shows Metadata", async () => {
  const c = await mount({
    id: "s",
    status: "failed",
    error: { message: "boom" },
    meta: META,
  });
  assert.equal(c.querySelectorAll("details").length, 1);
  assert.deepEqual(headings(c), ["Input", "Output", "Metadata"]);
  const blocks = Array.from(c.querySelectorAll(".w6w-execution-log-json"));
  assert.equal(blocks[1].textContent?.includes("Not available."), true, "Output stays unavailable");
  assert.equal(blocks[2].textContent?.includes("conn_1"), true);
});

test("E4 - meta: null is treated like no meta", async () => {
  const c = await mount({
    id: "s",
    status: "succeeded",
    input: { a: 1 },
    output: { b: 2 },
    meta: null,
  });
  assert.equal(c.querySelectorAll(".w6w-execution-log-json").length, 2);
  assert.equal(c.textContent?.includes("Metadata"), false);
  const bare = await mount({ id: "t", status: "failed", error: { message: "x" }, meta: null });
  assert.equal(
    bare.querySelectorAll("details").length,
    0,
    "null meta does not make a row expandable",
  );
});

test("E5 - connectionId: null renders as null", async () => {
  const c = await mount({
    id: "s",
    status: "succeeded",
    output: 1,
    meta: { ...META, connectionId: null },
  });
  assert.ok(c.textContent?.includes('"connectionId": null'));
});
