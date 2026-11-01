// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/ExecutionLogPanel.skip-reason.test.ts
// A skipped step says why; a step on another path (`not_on_path`) leaves the list for a footer.
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

async function mount(steps: Step[]) {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ExecutionLogPanel, { steps }));
  });
  return container;
}
const rowLabels = (c: HTMLElement) =>
  Array.from(c.querySelectorAll(".w6w-execution-log-row-label")).map((e) => e.textContent);

test("S1 - not_on_path steps leave the list for one collapsed footer naming them", async () => {
  const c = await mount([
    { id: "manual_trigger_1", status: "skipped", skipReason: "not_on_path" },
    { id: "eb_webhook", status: "succeeded" },
    { id: "find_webhook", label: "Find webhook", status: "skipped", skipReason: "not_on_path" },
    { id: "data_1", status: "succeeded" },
  ]);
  assert.deepEqual(rowLabels(c), ["eb_webhook", "data_1"]);
  const footer = c.querySelector("[data-testid=execution-log-off-path]") as HTMLDetailsElement;
  assert.ok(footer, "footer rendered");
  assert.equal(footer.open, false, "collapsed by default");
  assert.equal(
    footer.querySelector("summary")?.textContent,
    "2 steps on other paths, not part of this run",
  );
  assert.deepEqual(
    Array.from(footer.querySelectorAll("li")).map((e) => e.textContent),
    ["manual_trigger_1", "Find webhook"],
  );
  assert.equal(c.textContent?.includes("Skipped"), false, "no Skipped badge for other paths");
});

test("S2 - real skips keep the Skipped pill with a short reason; a legacy skip has none", async () => {
  const c = await mount([
    { id: "a", status: "skipped", skipReason: "condition" },
    { id: "b", status: "skipped", skipReason: "stopped" },
    { id: "d", status: "skipped", skipReason: "disabled" },
    { id: "old", status: "skipped" },
  ]);
  assert.deepEqual(rowLabels(c), ["a", "b", "d", "old"]);
  assert.equal(c.querySelectorAll(".w6w-step-pill-skipped").length, 4);
  assert.deepEqual(
    Array.from(c.querySelectorAll("[data-testid=execution-log-skip-reason]")).map(
      (e) => e.textContent,
    ),
    ["condition false", "run stopped", "disabled"],
  );
  assert.equal(c.querySelector("[data-testid=execution-log-off-path]"), null, "no footer");
});

test("S3 - only off-path steps: the empty label shows, with the footer below it", async () => {
  const c = await mount([{ id: "x", status: "skipped", skipReason: "not_on_path" }]);
  assert.ok(c.querySelector(".w6w-execution-log-empty"));
  assert.equal(
    c.querySelector("[data-testid=execution-log-off-path] summary")?.textContent,
    "1 step on other paths, not part of this run",
  );
});
