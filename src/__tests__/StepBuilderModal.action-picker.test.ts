// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.action-picker.test.ts  (Node 24)
//
// N2 — `AppStepConfig`'s Action field picks the app action with a `Combobox` in
// `mode="auto"`: the short list keeps the native `<select>` (placeholder option
// "— pick an action —" first, `Title (key)` labels), a long one is the
// filterable combobox — and picking clears the `Action *` required marker.
// Mirrors `StepBuilderModal.autoconnect.test.ts`'s jsdom + act rig.
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { AppStepConfig } = await import("../StepBuilderModal.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;
type ActionDef = import("../types.ts").ActionDef;

const SHORT: ActionDef[] = [
  { key: "send", type: "action", title: "Send", params: [] },
  { key: "list", type: "action", title: "List", params: [] },
];

/** 20 actions — more than 60% of jsdom's 768px viewport at 32px a row. */
const LONG: ActionDef[] = Array.from({ length: 20 }, (_, i) => ({
  key: `act-${i + 1}`,
  type: "action",
  title: `Action ${i + 1}`,
  params: [],
}));

function fakeApi(actions: ActionDef[]) {
  return {
    listApps: async () => [],
    getAppAuth: async () => [{ key: "apiKey", type: "apiKey", available: true }],
    listConnectionsForApp: async () => [],
    listConnections: async () => [],
    getAppActions: async () => actions,
    invokeAction: async () => ({ value: {} }),
    listSavedTests: async () => [],
    createSavedTest: async () => ({}),
    updateSavedTest: async () => ({}),
    deleteSavedTest: async () => {},
    recordTestRun: async () => {},
    saveStepTest: async () => ({ id: "t1" }),
    recordStepTestRun: async () => {},
    createConnection: async () => ({
      id: "c1",
      appId: "sendgrid",
      authKey: "apiKey",
      state: "ok" as const,
    }),
    startAppOAuthFlow: async () => ({ authorizationUrl: "" }),
    listStepTests: async () => [],
  } as unknown as W6WApi;
}

async function mount(actions: ActionDef[]) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const drafts: unknown[] = [];

  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api: fakeApi(actions),
        children: React.createElement(AppStepConfig, {
          appId: "sendgrid",
          app: { id: "sendgrid", displayName: "SendGrid" },
          onAdd: () => "step_1",
          onClose: () => {},
          onDraftChange: (step: unknown) => drafts.push(step),
        }),
      }),
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  return { container, root, drafts };
}

/** The Action field, matched on its visible label (which carries the " *" marker). */
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

test('a short action list keeps the native <select>: "— pick an action —" first, labels "Title (key)"', async () => {
  const { container, root } = await mount(SHORT);

  const select = actionField(container).querySelector("select") as HTMLSelectElement | null;
  assert.ok(select, "a short action list must still render the native <select>");
  assert.deepEqual(
    Array.from(select.options).map((o) => [o.value, o.textContent]),
    [
      ["", "— pick an action —"],
      // alphabetical by title, as before
      ["list", "List (list)"],
      ["send", "Send (send)"],
    ],
  );

  await act(async () => {
    root.unmount();
  });
});

test("a long action list renders the combobox, and picking clears the required marker", async () => {
  const { container, root } = await mount(LONG);
  const field = actionField(container);

  assert.equal(field.querySelector("span")?.textContent, "Action *", "nothing picked yet");
  assert.equal(field.querySelector("select"), null, "no native <select> once the list is long");
  const input = field.querySelector('input[role="combobox"]') as HTMLInputElement | null;
  assert.ok(input, "the picker must be the combobox input");
  assert.equal(input.getAttribute("placeholder"), "— pick an action —");

  await setInputValue(input, "Action 7");
  assert.deepEqual(
    Array.from(field.querySelectorAll('[role="option"]')).map((o) => o.textContent),
    ["Action 7 (act-7)"],
    "the typed text filters the options down to the one match",
  );

  await act(async () => {
    (field.querySelector('[role="option"]') as HTMLElement).dispatchEvent(
      new dom.window.MouseEvent("mousedown", { bubbles: true }),
    );
  });

  assert.equal(actionField(container).querySelector("span")?.textContent, "Action");
  assert.equal(input.value, "Action 7 (act-7)", "picking shows the chosen label");

  await act(async () => {
    root.unmount();
  });
});
