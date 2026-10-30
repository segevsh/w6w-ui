// Run: node --import ./src/test-jsx-loader.mjs --test src/components/__tests__/ExecutionLogPanel.iterations.test.ts  (Node 24)
//
// Mirrors `Copyable.test.ts`'s header (JSDOM + navigator + matchMedia +
// MutationObserver + IS_REACT_ACT_ENVIRONMENT) — the CodeMirror-specific
// Window/requestAnimationFrame trio `JsonEditor.copy.test.ts` needs is not
// required here: `CodeBlock` (used for input/output — see A3 in the
// component's own doc comment) mounts no CodeMirror, only `<pre><code>` plus
// `Copyable`'s plain DOM listeners.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { ExecutionLogPanelProps, ExecutionLogStep } from "../ExecutionLogPanel.tsx";

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
const { ExecutionLogPanel } = await import("../ExecutionLogPanel.tsx");

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

async function renderPanel(props: ExecutionLogPanelProps) {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(React.createElement(ExecutionLogPanel, props));
  });
  const html = container.innerHTML;
  await act(async () => {
    root.unmount();
  });
  return html;
}

/** Like `renderPanel`, but keeps the root mounted so a test can interact
 *  with the live DOM (e.g. open a row's `<details>`) before reading html. */
async function mountPanel(props: ExecutionLogPanelProps) {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(React.createElement(ExecutionLogPanel, props));
  });
  return { container, root };
}

/** Iterations 0..5, body = map_ticket_1 then update_event_ticket_1, index 3 failed in the 2nd step. */
function fixture(
  over: Partial<ExecutionLogStep> = {},
  failAt: number | null = 3,
): ExecutionLogStep {
  const iterations = [0, 1, 2, 3, 4, 5].map((index) => {
    const failed = index === failAt;
    return {
      index,
      status: (failed ? "failed" : "succeeded") as "failed" | "succeeded",
      ...(failed ? { failedNodeId: "update_event_ticket_1" } : {}),
      steps: [
        {
          id: "map_ticket_1",
          status: "succeeded" as const,
          input: { n: index },
          output: { mapped: `m${index}` },
        },
        {
          id: "update_event_ticket_1",
          status: (failed ? "failed" : "succeeded") as "failed" | "succeeded",
          input: { ticket: `t${index}` },
          ...(failed ? { error: { message: `ticket t${index} exploded` } } : {}),
        },
      ],
    };
  });
  return {
    id: "f0",
    label: "Each ticket",
    status: failAt === null ? "succeeded" : "failed",
    iterations,
    ...over,
  };
}

async function mount(step: ExecutionLogStep) {
  return mountPanel({ steps: [step] });
}
const text = (c: HTMLElement, id: string) =>
  c.querySelector(`[data-testid="${id}"]`)?.textContent ?? "";
const selects = (c: HTMLElement) =>
  Array.from(
    c.querySelectorAll<HTMLSelectElement>('[data-testid="execution-log-iteration-select"]'),
  );
async function choose(sel: HTMLSelectElement, value: string) {
  await act(async () => {
    sel.value = value;
    sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

test("T151-P1 summary, chips in index order, last iteration preselected with no failure", async () => {
  const { container, root } = await mount(fixture({ iterationsTotal: 6 }, null));
  assert.equal(text(container, "execution-log-foreach-summary"), "6 items");
  const chips = Array.from(
    container.querySelectorAll('[data-testid="execution-log-iteration-chip"]'),
  );
  assert.deepEqual(
    chips.map((c) => c.getAttribute("data-status")),
    Array(6).fill("succeeded"),
  );
  assert.deepEqual(
    selects(container).map((s) => s.value),
    ["5", "5"],
  );
  await act(async () => root.unmount());
});

test("T151-P2 failure pointer names the failing body step and iteration; error visible unopened", async () => {
  const { container, root } = await mount(fixture());
  const summary = text(container, "execution-log-foreach-summary");
  assert.match(summary, /update_event_ticket_1/);
  assert.match(summary, /iteration 3/);
  assert.match(summary, /1 failed/);
  assert.deepEqual(
    selects(container).map((s) => s.value),
    ["3", "3"],
  );
  assert.ok(container.textContent?.includes("ticket t3 exploded"));
  assert.equal(container.querySelectorAll("details[open]").length, 0);
  await act(async () => root.unmount());
});

test("T151-P3 N and k come from iterationsTotal/iterationsFailed when given; singular copy", async () => {
  let m = await mount(fixture({ iterationsTotal: 250, iterationsFailed: 7 }));
  assert.match(text(m.container, "execution-log-foreach-summary"), /^250 items · 7 failed/);
  await act(async () => m.root.unmount());
  m = await mount({ ...fixture(), iterations: fixture().iterations?.slice(0, 1) });
  assert.equal(text(m.container, "execution-log-foreach-summary"), "1 item");
  await act(async () => m.root.unmount());
});

test("T151-P4 truncation line only when iterationsTruncated === true", async () => {
  let m = await mount(fixture({ iterationsTotal: 250, iterationsTruncated: true }));
  assert.match(text(m.container, "execution-log-foreach-summary"), /showing 6 of 250/);
  await act(async () => m.root.unmount());
  for (const flag of [false, undefined]) {
    m = await mount(fixture({ iterationsTotal: 250, iterationsTruncated: flag }));
    assert.doesNotMatch(text(m.container, "execution-log-foreach-summary"), /showing/);
    await act(async () => m.root.unmount());
  }
});

test("T151-P5 each sub-row selects independently; an absent step shows the Did-not-run copy", async () => {
  const step = fixture();
  step.iterations?.[1].steps.pop();
  const { container, root } = await mount(step);
  const [first, second] = selects(container);
  assert.ok(container.textContent?.includes("ticket t3 exploded"));
  await choose(second, "0");
  assert.equal(second.value, "0");
  assert.equal(first.value, "3", "the other sub-row keeps its selection");
  assert.ok(!container.textContent?.includes("ticket t3 exploded"));
  assert.ok(!container.textContent?.includes("Did not run"));
  await choose(second, "1");
  assert.ok(container.textContent?.includes("Did not run in this iteration."));
  assert.equal(first.value, "3");
  await act(async () => root.unmount());
});

test("T151-P6 a step without iterations renders no foreach DOM", async () => {
  const html = await renderPanel({
    steps: [{ id: "a", status: "succeeded", output: { x: 1 } }],
  });
  assert.doesNotMatch(html, /execution-log-foreach-summary|iteration-chip|iteration-select/);
});
