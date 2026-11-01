// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/WorkflowFlowEditor.run-pause.test.ts  (Node 24)
//
// adhoc/run-pause: the node toolbar's ⏸ pause and ⃠ disable toggles, their persistent canvas
// badges, the lossless round-trip of `ui.paused` / `disabled`, and ▶ handing a run that
// continues downstream to the host (`onRunFromNode`) with every paused node as `stopAt`.
// Rig: jsdom + react-dom (mirrors WorkflowFlowEditor.app-trigger-node.test.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
const win = dom.window as unknown as Record<string, unknown>;
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
win.matchMedia = g.matchMedia;
class FakeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
g.MutationObserver = win.MutationObserver ?? FakeObserver;
win.MutationObserver = g.MutationObserver;
g.ResizeObserver = FakeObserver;
win.ResizeObserver = FakeObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.Window = dom.window.Window;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
win.requestAnimationFrame = raf;
win.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as NodeJS.Timeout);
const dlg = (dom.window as unknown as { HTMLDialogElement: { prototype: Record<string, unknown> } })
  .HTMLDialogElement.prototype;
dlg.showModal = function (this: { open: boolean }) {
  this.open = true;
};
dlg.close = function (this: { open: boolean }) {
  this.open = false;
};

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { WorkflowFlowEditor } = await import("../WorkflowFlowEditor.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
const { flowToWorkflow, workflowToFlow } = await import("../flow-utils.ts");
const flags = await import("../flow-node-flags.ts");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;
type FlowWorkflow = import("../flow-types.ts").FlowWorkflow;
type FlowStep = import("../flow-types.ts").FlowStep;
type RunFromNodeRequest = import("../WorkflowFlowEditor.tsx").RunFromNodeRequest;

// Manual trigger → A → B → C, plus a For each (control) with no ▶ unless runs continue.
function makeWorkflow(): FlowWorkflow {
  return {
    id: "wf_1",
    name: "wf",
    nodes: [
      { id: "T", uses: { app: "@w6w/trigger", action: "manual" }, with: {} },
      { id: "A", uses: { app: "@w6w/script", action: "run" }, with: {} },
      { id: "B", uses: { app: "@w6w/script", action: "run" }, with: {}, ui: { paused: true } },
      { id: "C", uses: { app: "@w6w/script", action: "run" }, with: {}, disabled: true },
      { id: "L", uses: { app: "@w6w/control", action: "foreach" }, with: { items: [], body: [] } },
    ],
    edges: [
      { from: "T", to: "A" },
      { from: "A", to: "B" },
      { from: "B", to: "C" },
      { from: "C", to: "L" },
    ],
  } as unknown as FlowWorkflow;
}

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    listApps: async () => [],
    listAppsPage: async () => ({ apps: [], total: 0 }),
    listAppsByIds: async () => [],
    listConnections: async () => [],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    getAppActions: async () => [],
    listStepTests: async () => [],
    invokeAction: async () => {
      throw new Error("a run that continues never invokes a single node");
    },
    ...overrides,
  } as unknown as W6WApi;
}

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const click = (el: Element | undefined | null) => {
  assert.ok(el, `expected element to click; DOM: ${document.body.innerHTML.slice(0, 600)}`);
  return act(async () => {
    (el as HTMLElement).click();
  });
};

async function mountEditor(
  value: FlowWorkflow,
  extra: Record<string, unknown> = {},
  api = fakeApi(),
) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const changes: FlowWorkflow[] = [];
  await act(async () => {
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(W6WUIProvider, {
          api,
          children: React.createElement(WorkflowFlowEditor, {
            value,
            height: 600,
            onChange: (next: FlowWorkflow) => {
              changes.push(next);
            },
            ...extra,
          } as never),
        }),
      ),
    );
  });
  await flush();
  return { root, changes };
}

const card = (id: string) =>
  document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;
const inCard = (id: string, sel: string) => card(id)?.querySelector(sel) ?? null;
/** Select a node so React Flow shows its toolbar, then return the toolbar's buttons. */
async function toolbarOf(id: string) {
  await click(card(id));
  await flush();
  const bars = Array.from(document.querySelectorAll(".w6w-node-toolbar"));
  assert.equal(bars.length, 1, "exactly the selected node's toolbar is shown");
  return bars[0] as HTMLElement;
}
const nodeOf = (wf: FlowWorkflow, id: string) =>
  (wf.nodes as FlowStep[]).find((n) => n.id === id) as FlowStep;

test("RP1: withPaused / withDisabled set and clear, never writing false or an empty ui", () => {
  const base: FlowStep = { id: "A", uses: { app: "@w6w/script", action: "run" } };
  const paused = flags.withPaused(base, true);
  assert.deepEqual(paused.ui, { paused: true });
  assert.deepEqual(flags.withPaused(paused, false), base, "unpausing drops the emptied ui");
  assert.equal("ui" in flags.withPaused(paused, false), false);
  const disabled = flags.withDisabled(base, true);
  assert.equal(disabled.disabled, true);
  assert.deepEqual(flags.withDisabled(disabled, false), base);
  assert.equal("disabled" in flags.withDisabled(disabled, false), false);
  // Another ui key survives unpausing.
  const other = { ...base, ui: { paused: true, x: 1 } } as unknown as FlowStep;
  assert.deepEqual(flags.withPaused(other, false).ui, { x: 1 });
});

test("RP2: pausedStopAt lists every paused node except the start node", () => {
  const steps = makeWorkflow().nodes as FlowStep[];
  assert.deepEqual(flags.pausedStopAt(steps, "T"), ["B"]);
  assert.deepEqual(flags.pausedStopAt(steps, "B"), [], "▶ on a paused node runs it");
});

test("RP3: workflowToFlow -> flowToWorkflow keeps ui.paused and disabled", () => {
  const wf = makeWorkflow();
  const { nodes, edges } = workflowToFlow(wf as never);
  const back = flowToWorkflow(wf as never, nodes, edges) as unknown as FlowWorkflow;
  assert.deepEqual(nodeOf(back, "B").ui, { paused: true });
  assert.equal(nodeOf(back, "C").disabled, true);
  assert.equal("ui" in nodeOf(back, "A"), false);
  assert.equal("disabled" in nodeOf(back, "A"), false);
});

test("RP4: paused and disabled nodes carry persistent badges without hover; disabled is greyed", async () => {
  const { root } = await mountEditor(makeWorkflow());
  assert.ok(inCard("B", '[data-testid="step-paused-badge"]'), "paused badge on B");
  assert.equal(inCard("B", '[data-testid="step-disabled-badge"]'), null);
  assert.ok(inCard("C", '[data-testid="step-disabled-badge"]'), "disabled badge on C");
  assert.equal(inCard("A", '[data-testid="step-paused-badge"]'), null);
  assert.equal(inCard("A", '[data-testid="step-disabled-badge"]'), null);
  const c = inCard("C", ".w6w-node-disabled") as HTMLElement | null;
  assert.ok(c, "disabled wrapper class");
  const cardBox = c.querySelector("[data-run-status]") as HTMLElement;
  assert.equal(cardBox.style.opacity, "0.45");
  assert.match(
    inCard("C", '[data-testid="step-disabled-badge"]')?.getAttribute("title") ?? "",
    /skipped in every run/,
  );
  await act(async () => root.unmount());
});

test("RP5: toolbar order is run, pause, disable | divider | edit, copy, delete", async () => {
  const { root } = await mountEditor(makeWorkflow());
  const bar = await toolbarOf("A");
  const kids = Array.from(bar.children).map((el) =>
    el.classList.contains("w6w-node-toolbar-divider")
      ? "|"
      : (el.getAttribute("aria-label") ?? "?"),
  );
  assert.deepEqual(kids, [
    "Test-run this node",
    "Pause node",
    "Disable node",
    "|",
    "Edit node",
    "Duplicate node",
    "Delete node",
  ]);
  await act(async () => root.unmount());
});

test("RP6: the pause toggle sets and clears ui.paused through onChange, and the badge follows", async () => {
  const { root, changes } = await mountEditor(makeWorkflow());
  let bar = await toolbarOf("A");
  const pause = bar.querySelector('[data-testid="node-pause-toggle"]');
  assert.equal(pause?.getAttribute("aria-pressed"), "false");
  await click(pause);
  await flush();
  assert.deepEqual(nodeOf(changes.at(-1) as FlowWorkflow, "A").ui, { paused: true });
  assert.ok(inCard("A", '[data-testid="step-paused-badge"]'), "badge appears");
  bar = document.querySelector(".w6w-node-toolbar") as HTMLElement;
  const again = bar.querySelector('[data-testid="node-pause-toggle"]');
  assert.equal(again?.getAttribute("aria-pressed"), "true");
  await click(again);
  await flush();
  assert.equal("ui" in nodeOf(changes.at(-1) as FlowWorkflow, "A"), false);
  assert.equal(inCard("A", '[data-testid="step-paused-badge"]'), null, "badge gone");
  await act(async () => root.unmount());
});

test("RP7: the disable toggle sets and clears disabled through onChange, greying the card", async () => {
  const { root, changes } = await mountEditor(makeWorkflow());
  const bar = await toolbarOf("A");
  await click(bar.querySelector('[data-testid="node-disable-toggle"]'));
  await flush();
  assert.equal(nodeOf(changes.at(-1) as FlowWorkflow, "A").disabled, true);
  assert.ok(inCard("A", '[data-testid="step-disabled-badge"]'));
  assert.ok(inCard("A", ".w6w-node-disabled"));
  const bar2 = document.querySelector(".w6w-node-toolbar") as HTMLElement;
  await click(bar2.querySelector('[data-testid="node-disable-toggle"]'));
  await flush();
  assert.equal("disabled" in nodeOf(changes.at(-1) as FlowWorkflow, "A"), false);
  assert.equal(inCard("A", ".w6w-node-disabled"), null);
  await act(async () => root.unmount());
});

test("RP8: without onRunFromNode a flow-control node has no ▶; with it, it does", async () => {
  let m = await mountEditor(makeWorkflow());
  let bar = await toolbarOf("L");
  assert.equal(bar.querySelector('[aria-label^="Test-run"], [aria-label^="Run from"]'), null);
  await act(async () => m.root.unmount());
  m = await mountEditor(makeWorkflow(), { onRunFromNode: async () => {} });
  bar = await toolbarOf("L");
  assert.ok(bar.querySelector('[aria-label^="Run from this node"]'), "▶ on a For each");
  await act(async () => m.root.unmount());
});

test("RP9: ▶ → Run hands the host the run with every paused node as stopAt, then closes", async () => {
  const calls: { id: string; req: RunFromNodeRequest }[] = [];
  const { root } = await mountEditor(makeWorkflow(), {
    onRunFromNode: async (id: string, req: RunFromNodeRequest) => {
      calls.push({ id, req });
    },
  });
  const bar = await toolbarOf("T");
  await click(bar.querySelector('[aria-label^="Run from this node"]'));
  await flush();
  await flush();
  const hint = document.querySelector('[data-testid="run-from-node-hint"]');
  assert.ok(hint, "the collect form says the run continues");
  assert.match(hint?.textContent ?? "", /stops before the paused node B/);
  const run = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim() === "▶ Run",
  );
  await click(run);
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, "T");
  assert.deepEqual(calls[0].req.stopAt, ["B"]);
  assert.deepEqual(calls[0].req.input, {}, "a trigger start sends its filled values as input");
  assert.equal(
    Array.from(document.querySelectorAll("button")).some(
      (b) => (b.textContent ?? "").trim() === "▶ Run",
    ),
    false,
    "the modal closed",
  );
  await act(async () => root.unmount());
});

test("RP10: a refused run stays in the modal with its message", async () => {
  const { root } = await mountEditor(makeWorkflow(), {
    onRunFromNode: async () => {
      throw Object.assign(new Error("Workflow is disabled."), { code: "workflow_disabled" });
    },
  });
  const bar = await toolbarOf("T");
  await click(bar.querySelector('[aria-label^="Run from this node"]'));
  await flush();
  await flush();
  const run = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim() === "▶ Run",
  );
  await click(run);
  await flush();
  assert.match(document.body.textContent ?? "", /Workflow is disabled\./);
  assert.match(document.body.textContent ?? "", /workflow_disabled/);
  await act(async () => root.unmount());
});
