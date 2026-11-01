// Run (from packages/ui): node --experimental-strip-types --import ./src/test-jsx-loader.mjs --test src/__tests__/ExecutionLogPanel.conditions.test.ts
// An If / Stop / Router row shows its resolved comparisons as a left | operator | right | result table.
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

const cells = (c: HTMLElement) =>
  Array.from(c.querySelectorAll(".w6w-execution-log-conditions tbody tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td")).map((td) => td.textContent),
  );

test("an If input with a condition trace renders the comparison above Input", async () => {
  const c = await mount({
    id: "if_1",
    status: "succeeded",
    input: {
      condition: true,
      conditions: [{ left: "https://a/x", op: "===", right: "https://a/x", result: true }],
    },
    output: { matched: true },
  });
  assert.deepEqual(headings(c), ["Condition", "Input", "Output"]);
  assert.deepEqual(cells(c), [['"https://a/x"', "equals", '"https://a/x"', "true"]]);
});

test("a joined condition says how its rows combine; operands keep their JSON type", async () => {
  const c = await mount({
    id: "stop",
    status: "succeeded",
    input: {
      condition: false,
      combinator: "or",
      conditions: [
        { left: "5", op: ">", right: 5, result: false },
        { left: null, op: "!==", right: "", result: false },
      ],
    },
  });
  assert.ok(c.textContent?.includes("Any row must match"));
  assert.deepEqual(cells(c), [
    ['"5"', "greater than", "5", "false"],
    ["null", "does not equal", '""', "false"],
  ]);
});

test("a Router input gets one table per route that carries a trace", async () => {
  const c = await mount({
    id: "router",
    status: "succeeded",
    input: {
      routes: [
        {
          id: "r1",
          label: "Paid",
          condition: true,
          conditions: [{ left: 1, op: "===", right: 1, result: true }],
        },
        { id: "default", default: true },
      ],
    },
  });
  assert.equal(c.querySelectorAll(".w6w-execution-log-conditions").length, 1);
  assert.ok(
    c.querySelector("[data-testid=execution-log-conditions]")?.textContent?.includes("Paid"),
  );
});

test("an input without a trace renders no Condition block", async () => {
  const c = await mount({ id: "if_1", status: "succeeded", input: { condition: true } });
  assert.equal(c.querySelector("[data-testid=execution-log-conditions]"), null);
  assert.deepEqual(headings(c), ["Input", "Output"]);
});
