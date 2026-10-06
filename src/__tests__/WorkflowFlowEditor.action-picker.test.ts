// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/WorkflowFlowEditor.action-picker.test.ts  (Node 24)
//
// N2 — `StepEditModal`'s Setup tab picks the step's ACTION with a `Combobox` in
// `mode="auto"`. Two behaviours are pinned here, both straight off the contract:
//   * while the app's action manifest is still loading (`actions === null`) the
//     field is DISABLED and shows the step's current action key as its single
//     option — it never goes blank;
//   * a long action list renders the filterable combobox, and picking from it
//     commits the new action (and wipes `with`, as the old <select> did).
// Mirrors `StepEditModal.setup-and-configure.test.ts`'s jsdom + act rig.
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

g.Window = dom.window.Window;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
(dom.window as unknown as Record<string, unknown>).requestAnimationFrame = raf;
(dom.window as unknown as Record<string, unknown>).cancelAnimationFrame = (id: number) =>
  clearTimeout(id as unknown as NodeJS.Timeout);

// jsdom@30 doesn't implement <dialog>'s imperative API — `Modal.tsx` calls it.
(
  dom.window as unknown as { HTMLDialogElement: { prototype: Record<string, unknown> } }
).HTMLDialogElement.prototype.showModal = function (this: { open: boolean }) {
  this.open = true;
};
(
  dom.window as unknown as { HTMLDialogElement: { prototype: Record<string, unknown> } }
).HTMLDialogElement.prototype.close = function (this: { open: boolean }) {
  this.open = false;
};

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { StepEditModal } = await import("../WorkflowFlowEditor.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
const { ExpressionOptionsProvider } = await import("../components/ExpressionOptions.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;
type FlowStep = import("../flow-types.ts").FlowStep;

const APPS = [{ id: "sendgrid", displayName: "SendGrid" }];
const CONNS = [{ id: "conn_1", appId: "sendgrid", authKey: "apiKey", displayName: "prod" }];

/** 20 actions — more than 60% of jsdom's 768px viewport at 32px a row. */
const LONG_ACTIONS = [
  { key: "send", title: "Send", params: [] },
  ...Array.from({ length: 20 }, (_, i) => ({
    key: `act-${i + 1}`,
    title: `Action ${i + 1}`,
    params: [],
  })),
];

const STEP: FlowStep = {
  id: "step_1",
  uses: { app: "sendgrid", action: "send", connection: "conn_1" },
  with: { subject: "Hello" },
};

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    listApps: async () => APPS,
    getAppAuth: async () => [],
    listConnectionsForApp: async () => CONNS,
    listConnections: async () => [],
    getAppActions: async () => [{ key: "send", title: "Send", params: [] }],
    invokeAction: async () => ({ value: {} }),
    listStepTests: async () => [],
    saveStepTest: async () => ({ id: "t1" }),
    recordStepTestRun: async () => {},
    createConnection: async () => ({
      id: "c1",
      appId: "sendgrid",
      authKey: "apiKey",
      state: "ok" as const,
    }),
    startAppOAuthFlow: async () => ({ authorizationUrl: "" }),
    ...overrides,
  } as unknown as W6WApi;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Mounts `StepEditModal` on the given step, opens the Setup subtab, and returns
 *  the container plus every committed `FlowStep` seen by `onChange`. */
async function mountOnSetupTab(step: FlowStep, apiOverrides: Record<string, unknown> = {}) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const changes: FlowStep[] = [];

  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api: fakeApi(apiOverrides),
        children: React.createElement(ExpressionOptionsProvider, {
          value: { sampleValues: {} },
          children: React.createElement(StepEditModal, {
            workflowId: "wf_1",
            step,
            upstreamSteps: [],
            onChange: (next: unknown) => changes.push(next as FlowStep),
            onClose: () => {},
          }),
        }),
      }),
    );
  });
  await flush();

  const setupTab = Array.from(container.querySelectorAll(".w6w-subtabs button")).find(
    (b) => b.textContent === "Setup",
  ) as HTMLButtonElement | undefined;
  assert.ok(setupTab, "the Setup subtab button should be present");
  await act(async () => {
    setupTab.click();
  });
  await flush();

  return { container, root, changes };
}

/** The Setup tab's Action field (matched on its visible label). */
function actionField(container: Element): Element {
  const field = Array.from(container.querySelectorAll(".w6w-field")).find((f) =>
    f.querySelector("span")?.textContent?.startsWith("Action"),
  );
  assert.ok(field, "the Action field should render on the Setup tab");
  return field;
}

async function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  );
  await act(async () => {
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

test("actions === null: the Action field is disabled and shows the step's own action as its single option", async () => {
  // A manifest that never lands — `actions` stays null for the whole test.
  const { container, root } = await mountOnSetupTab(STEP, {
    getAppActions: () => new Promise(() => {}),
  });

  const select = actionField(container).querySelector("select") as HTMLSelectElement | null;
  assert.ok(select, "with no manifest the picker still renders (as the native fallback)");
  assert.equal(select.disabled, true, "it must be disabled while the actions are null");
  assert.deepEqual(
    Array.from(select.options).map((o) => [o.value, o.textContent]),
    [["send", "send"]],
    "the step's current action is the only option — the field never goes blank",
  );
  assert.equal(select.value, "send");

  await act(async () => {
    root.unmount();
  });
});

test("a long action list renders the combobox, and picking commits the new action with `with` reset", async () => {
  const { container, root, changes } = await mountOnSetupTab(STEP, {
    getAppActions: async () => LONG_ACTIONS,
  });
  const field = actionField(container);

  assert.equal(field.querySelector("select"), null, "no native <select> once the list is long");
  const input = field.querySelector('input[role="combobox"]') as HTMLInputElement | null;
  assert.ok(input, "the picker must be the combobox input");
  assert.equal(input.value, "Send", "the step's action is the selected label");

  await setInputValue(input, "Action 7");
  assert.deepEqual(
    Array.from(field.querySelectorAll('[role="option"]')).map((o) => o.textContent),
    ["Action 7"],
    "the typed text filters the options down to the one match",
  );

  await act(async () => {
    (field.querySelector('[role="option"]') as HTMLElement).dispatchEvent(
      new dom.window.MouseEvent("mousedown", { bubbles: true }),
    );
  });

  const committed = changes.at(-1);
  assert.ok(committed, "picking an action must commit");
  assert.equal(committed.uses.action, "act-7", "the picked key lands in uses.action");
  assert.deepEqual(committed.with, {}, "and the old action's params are wiped, as before");

  await act(async () => {
    root.unmount();
  });
});
