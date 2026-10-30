// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/WorkflowFlowEditor.app-trigger-node.test.ts  (Node 24)
//
// 26-10-30-03 T2.1.2: a `uses.trigger` node is a trigger on the canvas — chrome
// (no inbound / error handle, "<App> · <title>"), "+ Node" wiring, editing via
// AppTriggerConfig, and a lossless load -> save round-trip. Rig: jsdom + react-dom
// (mirrors WorkflowFlowEditor.test-tab.test.ts / StepBuilderModal.app-triggers.test.ts).
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
const { WorkflowFlowEditor, StepEditModal } = await import("../WorkflowFlowEditor.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
const flow = await import("../flow.ts");
const { flowToWorkflow, workflowToFlow } = await import("../flow-utils.ts");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;
type FlowWorkflow = import("../flow-types.ts").FlowWorkflow;

const T1_USES = {
  app: "eventbrite",
  action: "event-updated",
  connection: "conn_1",
  trigger: true,
} as const;
const T1_WITH = { organization: "org_1" };

function makeWorkflow(): FlowWorkflow {
  return {
    id: "wf_1",
    name: "wf",
    nodes: [
      { id: "T1", uses: { ...T1_USES }, with: { ...T1_WITH } },
      { id: "A", uses: { app: "@w6w/script", action: "run" }, with: {} },
      { id: "T2", uses: { app: "@w6w/trigger", action: "manual" }, with: {} },
      { id: "B", uses: { app: "@w6w/script", action: "run" }, with: {} },
    ],
    edges: [
      { from: "T1", to: "A" },
      { from: "T2", to: "B" },
    ],
  } as unknown as FlowWorkflow;
}

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    listApps: async () => [],
    listAppsPage: async () => ({ apps: [], total: 0 }),
    listAppsByIds: async () => [],
    getAppAuth: async () => [{ key: "oauth", type: "oauth2", available: true }],
    listConnections: async () => [],
    listConnectionsForApp: async () => [{ id: "conn_1", displayName: "Main" }],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    getAppActions: async () => {
      throw new Error("an app trigger node must never read getAppActions");
    },
    getAppTriggers: async () => [
      {
        key: "event-updated",
        title: "Event Updated",
        type: "poll",
        params: [{ key: "organization", label: "Organization", type: "string" }],
      },
    ],
    createSubscription: async () => {
      throw new Error("the editor never subscribes (D-7)");
    },
    ...overrides,
  } as unknown as W6WApi;
}

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const buttons = () => Array.from(document.querySelectorAll("button"));
const byText = (t: string) => buttons().find((b) => (b.textContent ?? "").trim() === t);
const click = (el: Element | undefined | null) => {
  assert.ok(el, `expected element to click; DOM: ${document.body.textContent?.slice(0, 400)}`);
  return act(async () => {
    (el as HTMLElement).click();
  });
};
const eventbrite = { id: "eventbrite", displayName: "Eventbrite", triggerCount: 1 };

async function mountEditor(value: FlowWorkflow, api = fakeApi()) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const changes: FlowWorkflow[] = [];
  const render = (v: FlowWorkflow) =>
    act(async () => {
      root.render(
        React.createElement(W6WUIProvider, {
          api,
          children: React.createElement(WorkflowFlowEditor, {
            value: v,
            apps: [eventbrite],
            height: 600,
            onChange: (next: FlowWorkflow) => {
              changes.push(next);
            },
          } as never),
        }),
      );
    });
  await render(value);
  await flush();
  return { container, root, changes, render };
}

const card = (id: string) =>
  document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;
const handles = (id: string, type: "source" | "target") =>
  Array.from(card(id)?.querySelectorAll(`.react-flow__handle.${type}`) ?? []);

test("A1: isTriggerStep — built-ins and uses.trigger true; a plain app node false; exported from flow", () => {
  const f = flow.isTriggerStep;
  assert.equal(f({ app: "@w6w/trigger" }), true);
  assert.equal(f({ app: "@w6w/webhook" }), true);
  assert.equal(f({ app: "@w6w/scheduler" }), true);
  assert.equal(f({ app: "eventbrite", trigger: true }), true);
  assert.equal(f({ app: "eventbrite" }), false);
  assert.equal(flow.isTriggerApp("eventbrite"), false);
  assert.equal(flow.isTriggerApp("@w6w/trigger"), true);
});

test("A2: app trigger card has no target / error handle and is titled '<App> · <trigger title>'; both triggers render", async () => {
  const { root } = await mountEditor(makeWorkflow());
  assert.ok(card("T1") && card("T2"), "both trigger nodes render");
  // Built-in trigger card (ControlNodeCard) is the reference: no inbound, no error exit.
  assert.equal(handles("T2", "target").length, 0);
  assert.equal(handles("T2", "source").length, 1);
  // The app trigger card passes the same DOM test.
  assert.equal(handles("T1", "target").length, 0, "no inbound port");
  assert.equal(handles("T1", "source").length, 1, "success exit only — no error exit");
  // A normal step keeps both (the assertion above is not vacuous).
  assert.equal(handles("A", "target").length, 1);
  assert.match(card("T1")?.textContent ?? "", /Eventbrite · Event Updated/);
  await act(async () => root.unmount());
});

test("A5: workflowToFlow -> flowToWorkflow keeps T1's uses/with (independent literal)", () => {
  const wf = makeWorkflow();
  const { nodes, edges } = workflowToFlow(wf as never);
  const back = flowToWorkflow(wf as never, nodes, edges);
  const t1 = back.nodes.find((n: { id: string }) => n.id === "T1");
  assert.deepEqual(t1?.uses, {
    app: "eventbrite",
    action: "event-updated",
    connection: "conn_1",
    trigger: true,
  });
  assert.deepEqual(t1?.with, { organization: "org_1" });
  assert.equal(back.nodes.length, 4);
});

test("A4: editing T1 opens AppTriggerConfig preselected; changing the param emits onChange with trigger:true and the same id", async () => {
  const { container, root, changes } = await mountEditor(makeWorkflow());
  // Open the editor: double-click the app trigger node.
  await act(async () => {
    card("T1")?.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
  });
  await flush();
  await flush();
  assert.ok(byText("Add trigger"), "AppTriggerConfig's trigger step is open");
  const sel = document.querySelector('[data-selected="true"] strong');
  assert.equal(sel?.textContent, "Event Updated");
  const input = document.querySelector(
    ".w6w-stepbuilder-config input:not([type=hidden])",
  ) as HTMLInputElement;
  assert.equal(input?.value, "org_1", "the stored `with` is preselected");
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set?.call(
      input,
      "org_2",
    );
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await click(byText("Add trigger"));
  const last = changes.at(-1);
  assert.ok(last, "onChange fired");
  const t1 = last.nodes.find((n: { id: string }) => n.id === "T1");
  assert.deepEqual(t1?.uses, { ...T1_USES });
  assert.deepEqual(t1?.with, { organization: "org_2" });
  assert.equal(last.nodes.length, 4, "same node, no duplicate");
  void container;
  await act(async () => root.unmount());
});

test("A4: StepEditModal for a uses.trigger node never reads getAppActions", async () => {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  let reads = 0;
  const api = fakeApi({
    getAppActions: async () => {
      reads += 1;
      return [];
    },
  });
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api,
        children: React.createElement(StepEditModal, {
          workflowId: "wf_1",
          step: { id: "T1", uses: { ...T1_USES }, with: { ...T1_WITH } },
          upstreamSteps: [],
          onChange: () => {},
          onClose: () => {},
        }),
      }),
    );
  });
  await flush();
  assert.equal(reads, 0);
  assert.ok(byText("Add trigger"));
  await act(async () => root.unmount());
});

// --- A3: "+ Node" wiring, driven through the real builder -------------------

async function openBuilder() {
  await click(byText("+ Node"));
  await flush();
}

test("A3: a normal step added after a lone app trigger auto-wires FROM it", async () => {
  const wf = {
    id: "wf_1",
    name: "wf",
    nodes: [{ id: "T1", uses: { ...T1_USES }, with: { ...T1_WITH } }],
    edges: [],
  } as unknown as FlowWorkflow;
  const { changes, root } = await mountEditor(wf);
  await openBuilder();
  await click(byText("Controls"));
  await flush();
  await click(buttons().find((b) => b.textContent?.includes("Wait")));
  await flush();
  const last = changes.at(-1);
  assert.ok(last, `onChange fired; DOM: ${document.body.textContent?.slice(0, 300)}`);
  assert.equal(last.nodes.length, 2);
  const added = last.nodes.find((n: { id: string }) => n.id !== "T1");
  assert.deepEqual(last.edges, [{ from: "T1", to: added?.id }]);
  await act(async () => root.unmount());
});

test("A3: a second trigger (uses.trigger) stays floating — no edge into it", async () => {
  const wf = {
    id: "wf_1",
    name: "wf",
    nodes: [
      { id: "T2", uses: { app: "@w6w/trigger", action: "manual" }, with: {} },
      { id: "B", uses: { app: "@w6w/script", action: "run" }, with: {} },
    ],
    edges: [{ from: "T2", to: "B" }],
  } as unknown as FlowWorkflow;
  const api = fakeApi({
    listConnections: async () => [{ id: "c0", appId: "eventbrite", app: { displayName: "x" } }],
    listAppsByIds: async () => [eventbrite],
  });
  const { changes, root } = await mountEditor(wf, api);
  await openBuilder();
  await click(byText("Triggers"));
  await flush();
  await click(buttons().find((b) => b.textContent?.includes("Eventbrite")));
  await flush();
  await click(byText("Next →"));
  await flush();
  await click(buttons().find((b) => b.querySelector("strong")?.textContent === "Event Updated"));
  const input = document.querySelector(".w6w-stepbuilder-config input") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set?.call(
      input,
      "o",
    );
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await click(byText("Add trigger"));
  await flush();
  const last = changes.at(-1);
  assert.ok(last, "onChange fired");
  const added = last.nodes.find((n: { uses: { trigger?: boolean } }) => n.uses.trigger);
  assert.ok(added, "the app trigger node was added");
  assert.deepEqual(
    last.edges,
    [{ from: "T2", to: "B" }],
    "no edge into (or out of) the new trigger",
  );
  await act(async () => root.unmount());
});
