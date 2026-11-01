// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.app-triggers.test.ts  (Node 24)
//
// Triggers tab (26-10-30-03 T2.1.1): two columns + "Search all apps", and an
// app picked there runs the app-ACTION flow itself (adhoc/trigger-flow):
// AppStepConfig's Setup screen (app, account, picker), where picking the
// trigger adds ONE trigger node through onAdd, exactly as picking an action
// adds an action node. Mirrors
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
    listConnectionsForApp: async (appId: string) =>
      o.conns ?? [
        { id: "conn_1", appId, displayName: "Main", authKey: "oauth", state: "connected" },
      ],
    getAppTriggers: async () => [
      {
        key: "event-updated",
        title: "Event Updated",
        type: "poll",
        params: [{ key: "organization", label: "Organization", type: "string", required: true }],
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

test("A1: two columns — Your apps (triggerCount > 0, the 0 one absent) | Built-in; Search all apps present", async () => {
  const { api, calls } = makeTriggerApi();
  const { container, root } = await mountTriggers(api, calls);
  const grid = container.querySelector(".w6w-readytouse");
  assert.ok(grid);
  assert.equal(grid.getAttribute("data-cols"), "2");
  const cols = grid.querySelectorAll(".w6w-readytouse-col");
  assert.equal(cols[0].querySelector(".w6w-readytouse-heading")?.textContent, "Your apps");
  assert.equal(cols[1].querySelector(".w6w-readytouse-heading")?.textContent, "Built-in");
  assert.deepEqual(rowNames(cols[0]), ["Eventbrite", "Slackish"]);
  assert.deepEqual(rowNames(cols[1]), ["Manual trigger", "Webhook", "Schedule"]);
  assert.ok(byText(container, "Search all apps"));
  await act(async () => root.unmount());
});

test("A1: no connected app declares a trigger -> the left column stays, with an empty state that searches", async () => {
  const { api, calls } = makeTriggerApi({ connected: ["plainapp"] });
  const { container, root } = await mountTriggers(api, calls);
  const grid = container.querySelector(".w6w-readytouse");
  assert.equal(grid?.getAttribute("data-cols"), "2");
  const cols = grid?.querySelectorAll(".w6w-readytouse-col") ?? [];
  assert.equal(cols.length, 2);
  assert.deepEqual(rowNames(cols[0]), []);
  assert.match(cols[0].textContent ?? "", /No connected apps with triggers yet/);
  assert.deepEqual(rowNames(cols[1]), ["Manual trigger", "Webhook", "Schedule"]);
  await click(buttons(cols[0]).find((b) => b.textContent === "Search all apps"));
  await flush();
  assert.equal(calls.pageOpts[0]?.hasTriggers, true, "the empty state opens the filtered search");
  await act(async () => root.unmount());
});

test("A1: under StrictMode the connected apps still resolve into the left column", async () => {
  const { api, calls } = makeTriggerApi();
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(W6WUIProvider, {
          api,
          children: React.createElement(StepBuilderModal, {
            onClose: () => {},
            onAdd: () => "step_1",
            workflowId: "wf_1",
          }),
        }),
      ),
    );
  });
  await openTriggersTab(container);
  await flush();
  const cols = container.querySelectorAll(".w6w-readytouse-col");
  assert.deepEqual(rowNames(cols[0]), ["Eventbrite", "Slackish"]);
  assert.ok(calls.byIds.length >= 1);
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

/** Pick `label` in the Setup tab's searchable picker — the SAME combobox the
 *  action flow uses (StepBuilderModal.commit.test.ts drives it the same way). */
async function pick(container: Element, label: string) {
  const input = container.querySelector(
    '.w6w-field input[role="combobox"]',
  ) as HTMLInputElement | null;
  assert.ok(input, `the picker renders; DOM text: ${container.textContent}`);
  await act(async () => {
    input.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
  });
  const option = Array.from(container.querySelectorAll('[role="option"]')).find((o) =>
    (o.textContent ?? "").trim().startsWith(label),
  ) as HTMLElement | undefined;
  assert.ok(option, `option "${label}" is listed`);
  await act(async () => {
    option.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
  });
}

function typeInto(input: Element | null, value: string) {
  assert.ok(input, "the trigger's param renders");
  return act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

/** The Setup screen's shape: subtabs, field labels, footer buttons. */
function setupShape(c: Element) {
  const text = (n: Element) => (n.textContent ?? "").trim();
  return {
    subtabs: Array.from(c.querySelectorAll(".w6w-subtab")).map(text),
    fields: Array.from(
      c.querySelectorAll(".w6w-stepconfig-body .w6w-field > span:first-child"),
    ).map(text),
    footer: Array.from(c.querySelectorAll(".w6w-stepconfig-footer button")).map(text),
  };
}

async function openEventbrite(container: Element) {
  const col = container.querySelector(".w6w-readytouse-col");
  await click(buttons(col as Element).find((b) => b.textContent?.includes("Eventbrite")));
  await flush();
}

const EXPECTED_USES = {
  app: "eventbrite",
  action: "event-updated",
  connection: "conn_1",
  trigger: true,
};

test("A3: Eventbrite -> account already picked on the one Setup screen -> clicking 'Event Updated' adds the trigger node", async () => {
  const { api, calls } = makeTriggerApi();
  const drafts: [string, unknown][] = [];
  const { container, root } = await mountTriggers(api, calls, {
    onDraftChange: (id: string, s: unknown) => drafts.push([id, s]),
  });
  await openEventbrite(container);
  // No separate account screen: the one connection is auto-picked on Setup.
  assert.ok(!container.querySelector(".w6w-stepbuilder-list"), "no trigger card list");
  assert.ok(container.textContent?.includes("Main"), "the auto-picked account shows");
  assert.ok(!byText(container, "Add trigger"), "no separate Add trigger button");
  assert.equal(calls.added.length, 0);
  await pick(container, "Event Updated");
  // The click alone adds the node.
  assert.deepEqual(calls.added, [{ uses: EXPECTED_USES, with: {} }]);
  // Required params: Configure is the node's config, edits update the SAME node.
  await click(byText(container, "Next →"));
  await typeInto(container.querySelector(".w6w-stepconfig-body input"), "org_9");
  assert.equal(calls.added.length, 1, "no second node");
  const last = drafts[drafts.length - 1] as [string, { uses: unknown; with: unknown }];
  assert.equal(last[0], "step_1");
  assert.deepEqual(last[1].uses, EXPECTED_USES);
  assert.deepEqual(last[1].with, { organization: "org_9" });
  assert.equal(calls.subs, 0);
  await act(async () => root.unmount());
});

test("A3: the trigger flow has the action flow's steps — same Setup screen and tabs, Trigger in Action's place", async () => {
  const { api, calls } = makeTriggerApi();
  (api as unknown as Record<string, unknown>).getAppActions = async () => [
    { key: "get-event", title: "Get Event", params: [] },
  ];
  // The action flow: the same app opened for an action.
  const a = mountRoot();
  await act(async () => {
    a.root.render(
      React.createElement(W6WUIProvider, {
        api,
        children: React.createElement(StepBuilderModal, {
          onClose: () => {},
          onAdd: () => "step_1",
          initialApp: eventbrite,
        }),
      }),
    );
  });
  await flush();
  const action = setupShape(a.container);
  await act(async () => a.root.unmount());

  const { container, root } = await mountTriggers(api, calls);
  await openEventbrite(container);
  const trigger = setupShape(container);
  assert.deepEqual(action, {
    subtabs: ["Setup", "Configure", "Test"],
    fields: ["App", "Action *"],
    footer: ["Cancel", "Next →"],
  });
  assert.deepEqual(trigger, {
    subtabs: action.subtabs,
    fields: ["App", "Trigger *"],
    footer: action.footer,
  });
  await act(async () => root.unmount());
});

test("A3: the same flow from Search all apps; without progressive commit, Test's Add node adds it", async () => {
  const { api, calls } = makeTriggerApi();
  const { container, root } = await mountTriggers(api, calls);
  await click(byText(container, "Search all apps"));
  await flush();
  const card = Array.from(container.querySelectorAll(".w6w-apppicker-card")).find((c) =>
    c.textContent?.includes("eventbrite"),
  );
  await click(card);
  await flush();
  await pick(container, "Event Updated");
  await click(byText(container, "Next →"));
  assert.ok(byText(container, "Next →")?.disabled, "a required param gates Configure");
  await typeInto(container.querySelector(".w6w-stepconfig-body input"), "org_9");
  await click(byText(container, "Next →"));
  assert.match(container.textContent ?? "", /Event Updated runs when Eventbrite reports it/);
  await click(byText(container, "Add node"));
  assert.deepEqual(calls.added, [{ uses: EXPECTED_USES, with: { organization: "org_9" } }]);
  assert.equal(calls.subs, 0);
  await act(async () => root.unmount());
});

test("A4: '+ New' on the Setup screen resolves AddConnectionModal's initialAppId to the app", async () => {
  const { api, calls } = makeTriggerApi();
  const { container, root } = await mountTriggers(api, calls);
  await openEventbrite(container);
  const before = calls.byIds.length;
  await click(container.querySelector('button[aria-label="Connection"]') as HTMLButtonElement);
  await click(byText(document.body, "+ New connection"));
  await flush();
  assert.ok(
    calls.byIds.slice(before).some((ids) => ids.length === 1 && ids[0] === "eventbrite"),
    `AddConnectionModal must resolve initialAppId=eventbrite; saw ${JSON.stringify(calls.byIds)}`,
  );
  await act(async () => root.unmount());
});

test("A5: an auto-satisfied app uses its Built-in account", async () => {
  const { api, calls } = makeTriggerApi({
    auths: [{ key: "t", type: "tenantAuth", available: true, autoSatisfied: true }],
  });
  const { container, root } = await mountTriggers(api, calls, { onDraftChange: () => {} });
  await openEventbrite(container);
  assert.equal(container.querySelector('button[aria-label="Connection"]')?.textContent, "Built-in");
  await pick(container, "Event Created");
  assert.deepEqual(calls.added, [
    {
      uses: {
        app: "eventbrite",
        action: "event-created",
        trigger: true,
        connection: "zerocred:eventbrite",
      },
      with: {},
    },
  ]);
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

test("A4: '+ New' -> Save connection -> created id becomes uses.connection", async () => {
  let created = false;
  let createdFor = "";
  const { api, calls } = makeTriggerApi();
  // Two connections after creation so auto-selecting the first cannot mask a dropped setConnectionId.
  const patch = api as unknown as Record<string, unknown>;
  patch.listConnectionsForApp = async () =>
    created
      ? [
          { id: "conn_OLD", displayName: "Old" },
          { id: "conn_NEW", displayName: "Fresh" },
        ]
      : [{ id: "conn_OLD", displayName: "Old" }];
  patch.getAppAuth = async () => [
    { key: "k", type: "apiKey", displayName: "Key", available: true, fields: [] },
  ];
  patch.createConnection = async (appId: string) => {
    createdFor = appId;
    created = true;
    return { id: "conn_NEW" };
  };
  const { container, root } = await mountTriggers(api, calls, { onDraftChange: () => {} });
  await openEventbrite(container);
  await click(container.querySelector('button[aria-label="Connection"]') as HTMLButtonElement);
  await click(byText(document.body, "+ New connection"));
  await flush();
  await click(byText(container, "Save connection"));
  await flush();
  assert.equal(createdFor, "eventbrite");
  await pick(container, "Event Created");
  assert.deepEqual(calls.added, [
    {
      uses: { app: "eventbrite", action: "event-created", connection: "conn_NEW", trigger: true },
      with: {},
    },
  ]);
  await act(async () => root.unmount());
});

test("A3: with progressive commit, a picked trigger is handed to the host's step editor (onOpenStep)", async () => {
  const { api, calls } = makeTriggerApi();
  const opened: string[] = [];
  const { container, root } = await mountTriggers(api, calls, {
    onDraftChange: () => {},
    onOpenStep: (id: string) => opened.push(id),
  });
  await openEventbrite(container);
  assert.deepEqual(opened, []);
  await pick(container, "Event Updated");
  assert.equal(calls.added.length, 1);
  assert.deepEqual(opened, ["step_1"]);
  await act(async () => root.unmount());
});
