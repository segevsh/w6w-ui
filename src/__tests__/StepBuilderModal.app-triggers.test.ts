// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.app-triggers.test.ts  (Node 24)
//
// Triggers tab (26-10-30-03 T2.1.1): two columns + "Search all apps", and
// app -> account -> trigger adds ONE trigger node through onAdd. Mirrors
// StepBuilderModal.commit.test.ts's JSDOM + react-dom mount rig.
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

// jsdom implements <dialog> as an element but not its imperative API — `Modal`
// (StepBuilderModal's wrapper) calls `showModal()` in a mount effect.
const dialogProto = dom.window.HTMLDialogElement?.prototype as unknown as Record<string, unknown>;
if (dialogProto && typeof dialogProto.showModal !== "function") {
  dialogProto.showModal = function showModal(this: HTMLElement) {
    this.setAttribute("open", "");
  };
  dialogProto.close = function close(this: HTMLElement) {
    this.removeAttribute("open");
  };
}

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { StepBuilderModal } = await import("../StepBuilderModal.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;

/** The minimum `useReadyToUse` needs to settle, PLUS whatever `overrides`
 *  adds — `listTriggerApps`/`getAppTriggers`/`createSubscription` are NOT
 *  included here, so a test that never passes them in `overrides` gets an
 *  object that genuinely OMITS the key (case (c) — a `Proxy`-style
 *  answer-everything stub would defeat that assertion). */
function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    listApps: async () => [],
    listConnections: async () => [],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    ...overrides,
  } as unknown as W6WApi;
}

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

async function openTriggersTab(container: Element) {
  // Flush the useReadyToUse effect (Promise.all-ish, several api calls).
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  const triggersTab = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === "Triggers",
  );
  assert.ok(triggersTab, "the Triggers tab button must render");
  await act(async () => {
    triggersTab.click();
  });
}

function flush() {
  return act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const eventbrite = { id: "eventbrite", displayName: "Eventbrite", triggerCount: 2 };
const plain = { id: "plainapp", displayName: "Plain App", triggerCount: 0 };
const slack = { id: "slackish", displayName: "Slackish", triggerCount: 1 };
const catalog: Record<string, unknown> = { eventbrite, plainapp: plain, slackish: slack };

type Calls = {
  added: unknown[];
  subs: number;
  pageOpts: Record<string, unknown>[];
  byIds: string[][];
  auth?: unknown[];
};

function makeTriggerApi(
  o: { auths?: unknown[]; conns?: unknown[]; page?: unknown; connected?: string[] } = {},
) {
  const calls: Calls = { added: [], subs: 0, pageOpts: [], byIds: [] };
  const api = fakeApi({
    listConnections: async () =>
      (o.connected ?? ["eventbrite", "plainapp", "slackish"]).map((appId, i) => ({
        id: `c${i}`,
        appId,
        // Inline meta WITHOUT triggerCount — the column must not trust it.
        app: { displayName: appId },
      })),
    listAppsByIds: async (ids: string[]) => {
      calls.byIds.push([...ids]);
      return ids.map((i) => catalog[i]).filter(Boolean);
    },
    listAppsPage: async (opts: Record<string, unknown>) => {
      calls.pageOpts.push(opts);
      return o.page ?? { apps: [eventbrite, slack], total: 7, nextCursor: "n1" };
    },
    getAppAuth: async () => o.auths ?? [{ key: "oauth", type: "oauth2", available: true }],
    listConnectionsForApp: async () => o.conns ?? [{ id: "conn_1", displayName: "Main" }],
    getAppTriggers: async () => [
      {
        key: "event-updated",
        title: "Event Updated",
        type: "poll",
        params: [{ key: "organization", label: "Organization", type: "string" }],
      },
      { key: "event-created", title: "Event Created" },
    ],
    createSubscription: async () => {
      calls.subs += 1;
      return {};
    },
  });
  return { api, calls };
}

async function mountTriggers(api: W6WApi, calls: Calls, props: Record<string, unknown> = {}) {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api,
        children: React.createElement(StepBuilderModal, {
          onClose: () => {},
          onAdd: (b: unknown) => {
            calls.added.push(b);
            return "step_1";
          },
          workflowId: "wf_1",
          ...props,
        }),
      }),
    );
  });
  await openTriggersTab(container);
  await flush();
  return { container, root };
}

const buttons = (c: Element) => Array.from(c.querySelectorAll("button"));
const byText = (c: Element, t: string) =>
  buttons(c).find((b) => (b.textContent ?? "").trim() === t);
const trig = (c: Element, title: string) =>
  buttons(c).find((b) => b.querySelector("strong")?.textContent === title);
const click = (el: Element | undefined) => {
  assert.ok(el, `expected element to click; DOM text: ${document.body.textContent}`);
  return act(async () => {
    (el as HTMLElement).click();
  });
};
const rowNames = (col: Element | null) =>
  Array.from(col?.querySelectorAll(".w6w-stepbuilder-item strong") ?? []).map((n) =>
    (n.textContent ?? "").trim(),
  );

test("A1: two columns — connected apps with triggerCount > 0 (the 0 one absent) | built-ins; Search all apps present", async () => {
  const { api, calls } = makeTriggerApi();
  const { container, root } = await mountTriggers(api, calls);
  const grid = container.querySelector(".w6w-readytouse");
  assert.ok(grid);
  assert.equal(grid.getAttribute("data-cols"), "2");
  const cols = grid.querySelectorAll(".w6w-readytouse-col");
  assert.deepEqual(rowNames(cols[0]), ["Eventbrite", "Slackish"]);
  assert.deepEqual(rowNames(cols[1]), ["Manual trigger", "Webhook", "Schedule"]);
  assert.ok(byText(container, "Search all apps"));
  await act(async () => root.unmount());
});

test("A1: no connected app declares a trigger -> the left column disappears; right + button remain", async () => {
  const { api, calls } = makeTriggerApi({ connected: ["plainapp"] });
  const { container, root } = await mountTriggers(api, calls);
  const grid = container.querySelector(".w6w-readytouse");
  assert.equal(grid?.getAttribute("data-cols"), "1");
  assert.equal(grid?.querySelectorAll(".w6w-readytouse-col").length, 1);
  assert.deepEqual(rowNames(grid?.querySelector(".w6w-readytouse-col") ?? null), [
    "Manual trigger",
    "Webhook",
    "Schedule",
  ]);
  assert.ok(byText(container, "Search all apps"));
  await act(async () => root.unmount());
});

test("A2: Search all apps shows AppPicker; listAppsPage carries hasTriggers:true; footer '2 of 7' + Load more", async () => {
  const { api, calls } = makeTriggerApi();
  const { container, root } = await mountTriggers(api, calls);
  await click(byText(container, "Search all apps"));
  await flush();
  assert.equal(calls.pageOpts.length, 1);
  assert.equal(calls.pageOpts[0].hasTriggers, true);
  assert.equal(calls.pageOpts[0].compact, true);
  const count = container.querySelector(".w6w-apppicker-count");
  assert.match((count?.textContent ?? "").replace(/\s+/g, " "), /2 of 7/);
  assert.ok(byText(container, "Load more"));
  assert.equal(container.querySelectorAll(".w6w-apppicker-card").length, 2);
  await act(async () => root.unmount());
});

async function pickAndAdd(container: Element) {
  // account step
  assert.ok(container.textContent?.includes("Main"), "the account step lists the connection");
  await click(byText(container, "Next →"));
  await flush();
  // trigger step
  await click(trig(container, "Event Updated"));
  const input = container.querySelector("input[type=text], input:not([type])") as HTMLInputElement;
  assert.ok(input, "the trigger's param renders");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "org_9");
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await click(byText(container, "Add trigger"));
}

const EXPECTED = {
  uses: { app: "eventbrite", action: "event-updated", connection: "conn_1", trigger: true },
  with: { organization: "org_9" },
};

test("A3: left column -> account -> trigger -> onAdd ONCE with the exact node; no createSubscription", async () => {
  const { api, calls } = makeTriggerApi();
  const { container, root } = await mountTriggers(api, calls);
  const col = container.querySelector(".w6w-readytouse-col");
  await click(buttons(col as Element).find((b) => b.textContent?.includes("Eventbrite")));
  await flush();
  await pickAndAdd(container);
  assert.deepEqual(calls.added, [EXPECTED]);
  assert.equal(calls.subs, 0);
  await act(async () => root.unmount());
});

test("A3: the same flow from Search all apps", async () => {
  const { api, calls } = makeTriggerApi();
  const { container, root } = await mountTriggers(api, calls);
  await click(byText(container, "Search all apps"));
  await flush();
  const card = Array.from(container.querySelectorAll(".w6w-apppicker-card")).find((c) =>
    c.textContent?.includes("eventbrite"),
  );
  await click(card);
  await flush();
  await pickAndAdd(container);
  assert.deepEqual(calls.added, [EXPECTED]);
  assert.equal(calls.subs, 0);
  await act(async () => root.unmount());
});

test("A4: '+ New' in the account step resolves AddConnectionModal's initialAppId to the app", async () => {
  const { api, calls } = makeTriggerApi();
  const { container, root } = await mountTriggers(api, calls);
  const col = container.querySelector(".w6w-readytouse-col");
  await click(buttons(col as Element).find((b) => b.textContent?.includes("Eventbrite")));
  await flush();
  const before = calls.byIds.length;
  await click(byText(container, "+ New"));
  await flush();
  assert.ok(
    calls.byIds.slice(before).some((ids) => ids.length === 1 && ids[0] === "eventbrite"),
    `AddConnectionModal must resolve initialAppId=eventbrite; saw ${JSON.stringify(calls.byIds)}`,
  );
  await act(async () => root.unmount());
});

test("A5: an auto-satisfied app skips the account step and emits no connection key", async () => {
  const { api, calls } = makeTriggerApi({
    auths: [{ key: "t", type: "tenantAuth", available: true, autoSatisfied: true }],
  });
  const { container, root } = await mountTriggers(api, calls);
  const col = container.querySelector(".w6w-readytouse-col");
  await click(buttons(col as Element).find((b) => b.textContent?.includes("Eventbrite")));
  await flush();
  assert.ok(!byText(container, "Next →"), "no account step");
  await click(trig(container, "Event Created"));
  await click(byText(container, "Add trigger"));
  assert.deepEqual(calls.added, [
    { uses: { app: "eventbrite", action: "event-created", trigger: true } },
  ]);
  assert.ok(!("connection" in (calls.added[0] as { uses: object }).uses));
  await act(async () => root.unmount());
});

test("A5: a built-in right-column pick still opens the unchanged control-node config and adds a @w6w node", async () => {
  const { api, calls } = makeTriggerApi();
  const { container, root } = await mountTriggers(api, calls, { onDraftChange: () => {} });
  const cols = container.querySelectorAll(".w6w-readytouse-col");
  await click(buttons(cols[1]).find((b) => b.textContent?.includes("Webhook")));
  await flush();
  assert.ok(container.textContent?.includes("@w6w/webhook"), "the Webhook node config opens");
  // Progressive commit (onDraftChange supplied) mints the control node on mount.
  assert.equal(calls.added.length, 1);
  assert.equal((calls.added[0] as { uses: { app: string } }).uses.app, "@w6w/webhook");
  assert.ok(!("trigger" in (calls.added[0] as { uses: object }).uses));
  assert.equal(calls.subs, 0);
  await act(async () => root.unmount());
});
