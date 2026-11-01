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
    listConnectionsForApp: async (appId: string) => [
      { id: "conn_1", appId, displayName: "Main", authKey: "oauth", state: "connected" },
    ],
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
  // Both triggers wear the half-pill entry chrome; a normal step does not.
  assert.ok(card("T2")?.querySelector(".w6w-node-trigger"), "built-in trigger is a half-pill");
  assert.ok(card("T1")?.querySelector(".w6w-node-trigger"), "app trigger is a half-pill");
  assert.equal(card("A")?.querySelector(".w6w-node-trigger"), null);
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
    connectionRef: "T1",
    trigger: true,
  });
  assert.deepEqual(t1?.with, { organization: "org_1" });
  assert.equal(back.nodes.length, 4);
});

const subtabs = () =>
  Array.from(document.querySelectorAll(".w6w-subtab")).map((b) => (b.textContent ?? "").trim());

test("A4: editing T1 opens the SAME step editor as an action (Setup · Configure · Test), on its params", async () => {
  const { container, root, changes } = await mountEditor(makeWorkflow());
  // Open the editor: double-click the app trigger node.
  await act(async () => {
    card("T1")?.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
  });
  await flush();
  await flush();
  const modal = document.querySelector('[aria-label="Edit step"]');
  assert.ok(modal, "the step editor is open");
  assert.equal(modal.querySelector(".w6w-step-rename code")?.textContent, "T1");
  assert.deepEqual(subtabs(), ["Setup", "Configure", "Test"]);
  assert.ok(!byText("Add trigger"), "no separate Add trigger button");
  const input = document.querySelector(
    ".w6w-stepconfig-body input:not([type=hidden])",
  ) as HTMLInputElement;
  assert.equal(input?.value, "org_1", "Configure shows the stored `with`");
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set?.call(
      input,
      "org_2",
    );
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const last = changes.at(-1);
  assert.ok(last, "onChange fired");
  const t1 = last.nodes.find((n: { id: string }) => n.id === "T1");
  const { connection, ...uses } = T1_USES;
  assert.deepEqual(t1?.uses, { ...uses, connectionRef: "T1" });
  assert.deepEqual(last.connections, { T1: { app: T1_USES.app, connection } });
  assert.deepEqual(t1?.with, { organization: "org_2" });
  assert.equal(last.nodes.length, 4, "same node, no duplicate");
  // Setup: the app, its account and the trigger, where an action's Action sits.
  await click(byText("Setup"));
  const labels = Array.from(
    document.querySelectorAll(".w6w-stepconfig-body .w6w-field > span:first-child"),
  ).map((n) => (n.textContent ?? "").trim());
  assert.ok(labels.includes("Trigger"), `Setup labels: ${labels}`);
  assert.ok(!labels.includes("Action"));
  void container;
  await act(async () => root.unmount());
});

test("A4: StepEditModal for a uses.trigger node reads getAppTriggers, never getAppActions", async () => {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  let reads = 0;
  let triggerReads = 0;
  const api = fakeApi({
    getAppActions: async () => {
      reads += 1;
      return [];
    },
    getAppTriggers: async () => {
      triggerReads += 1;
      return [{ key: "event-updated", title: "Event Updated", params: [] }];
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
  assert.ok(triggerReads >= 1);
  await click(byText("Test"));
  assert.match(container.textContent ?? "", /Event Updated runs when/);
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
  // The app-action flow's Setup screen: picking the trigger adds the node.
  const picker = document.querySelector(
    '.w6w-stepbuilder-config input[role="combobox"]',
  ) as HTMLInputElement;
  await act(async () => {
    picker.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
  });
  const option = Array.from(document.querySelectorAll('[role="option"]')).find((o) =>
    (o.textContent ?? "").startsWith("Event Updated"),
  );
  assert.ok(option, "Event Updated is listed");
  await act(async () => {
    option.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
  });
  await flush();
  const last = changes.at(-1);
  assert.ok(last, "onChange fired");
  const added = last.nodes.find((n: { uses: { trigger?: boolean } }) => n.uses.trigger);
  assert.ok(added, "the app trigger node was added");
  // …and it opens in its own step editor, on its config.
  const editor = document.querySelector('[aria-label="Edit step"]');
  assert.ok(editor, "the new node's step editor is open");
  assert.equal(editor.querySelector(".w6w-step-rename code")?.textContent, added.id);
  assert.equal(document.querySelector(".w6w-subtab.active")?.textContent, "Configure");
  assert.deepEqual(
    last.edges,
    [{ from: "T2", to: "B" }],
    "no edge into (or out of) the new trigger",
  );
  await act(async () => root.unmount());
});

test("A3: a floating app trigger next to a separate chain still wires FROM the app trigger on + Node", async () => {
  const wf = {
    id: "wf_1",
    name: "wf",
    nodes: [
      { id: "T1", uses: { ...T1_USES }, with: { ...T1_WITH } },
      { id: "X", uses: { app: "@w6w/script", action: "run" }, with: {} },
      { id: "Y", uses: { app: "@w6w/script", action: "run" }, with: {} },
    ],
    edges: [{ from: "X", to: "Y" }],
  } as unknown as FlowWorkflow;
  const { changes, root } = await mountEditor(wf);
  await openBuilder();
  await click(byText("Controls"));
  await flush();
  await click(buttons().find((b) => b.textContent?.includes("Wait")));
  await flush();
  const last = changes.at(-1);
  assert.ok(last);
  const added = last.nodes.find((n: { id: string }) => !["T1", "X", "Y"].includes(n.id));
  assert.ok(added, "a node was added");
  assert.deepEqual(
    (last.edges ?? []).filter((e: { to: string }) => e.to === added.id),
    [{ from: "T1", to: added.id }],
    "the only new edge is T1 -> new (T1 is the existing trigger, not the chain tail X->Y)",
  );
  await act(async () => root.unmount());
});

// T1.3.1 — registration badge: ONE list read per workflow, Retry by subscription id.
function threeTriggerWorkflow(): FlowWorkflow {
  return {
    id: "wf_1",
    name: "wf",
    nodes: [
      { id: "T1", uses: { ...T1_USES }, with: {} },
      { id: "T2", uses: { ...T1_USES }, with: {} },
      { id: "T3", uses: { ...T1_USES }, with: {} },
      { id: "A", uses: { app: "@w6w/script", action: "run" }, with: {} },
    ],
    edges: [{ from: "T1", to: "A" }],
  } as unknown as FlowWorkflow;
}
const badge = (id: string) => card(id)?.querySelector("[data-trigger-registration]") ?? null;

test("T1.3.1: one list call for three trigger nodes; failed shows error + Retry (subscription id), refetches, flips to registered without remount; unbound/non-trigger show none", async () => {
  let listCalls = 0;
  const retried: string[] = [];
  let state: Record<string, unknown>[] = [
    {
      id: "sub_T1",
      nodeId: "T1",
      status: "failed",
      lastError: { code: "partner_down", message: "partner returned 503" },
      lastFireAt: null,
    },
    { id: "sub_T2", nodeId: "T2", status: "paused", lastFireAt: "2026-10-30T12:34:00Z" },
    { id: "sub_wf", nodeId: null, status: "registered" },
  ];
  const api = fakeApi({
    listSubscriptionsForWorkflow: async () => {
      listCalls += 1;
      return state;
    },
    retrySubscriptionRegistration: async (id: string) => {
      retried.push(id);
      state = state.map((s) => (s.id === id ? { ...s, status: "registered", lastError: null } : s));
      return state[0];
    },
  });
  const { root } = await mountEditor(threeTriggerWorkflow(), api);
  await flush();
  assert.equal(listCalls, 1, "one fetch for three trigger nodes");
  assert.match(badge("T1")?.textContent ?? "", /partner returned 503/);
  assert.equal(badge("T1")?.getAttribute("data-trigger-registration"), "failed");
  assert.equal(badge("T2")?.getAttribute("data-trigger-registration"), "paused");
  assert.equal(badge("T3"), null, "trigger with no bound subscription");
  assert.equal(badge("A"), null, "non-trigger node");
  const retryBtn = Array.from(card("T1")?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === "Retry",
  );
  assert.equal(
    Array.from(card("T2")?.querySelectorAll("button") ?? []).some((b) => b.textContent === "Retry"),
    false,
  );
  const t1Node = card("T1");
  await click(retryBtn);
  await flush();
  assert.deepEqual(retried, ["sub_T1"], "called with the subscription id, not the node id");
  assert.equal(listCalls, 2, "refetched after retry");
  assert.equal(card("T1"), t1Node, "same DOM node: no remount");
  assert.equal(badge("T1")?.getAttribute("data-trigger-registration"), "registered");
  assert.equal(badge("T1")?.textContent?.includes("partner returned 503"), false);
  await act(async () => root.unmount());
});

test("T1.3.1: without retrySubscriptionRegistration a failed badge has no Retry; without the list member no badge", async () => {
  const failed = [
    { id: "sub_T1", nodeId: "T1", status: "failed", lastError: { code: "x", message: "boom" } },
  ];
  const a = await mountEditor(
    threeTriggerWorkflow(),
    fakeApi({ listSubscriptionsForWorkflow: async () => failed }),
  );
  await flush();
  assert.match(badge("T1")?.textContent ?? "", /boom/);
  assert.equal(
    Array.from(card("T1")?.querySelectorAll("button") ?? []).some((b) => b.textContent === "Retry"),
    false,
  );
  await act(async () => a.root.unmount());
  const b = await mountEditor(threeTriggerWorkflow(), fakeApi());
  await flush();
  assert.equal(badge("T1"), null);
  await act(async () => b.root.unmount());
});
