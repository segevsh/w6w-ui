// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/ActionTestForm.action-picker.test.ts  (Node 24)
//
// N2 — the built-in action picker on `ActionTestForm` is a `Combobox` in
// `mode="auto"`: a short action list still renders the native `<select>` (same
// placeholder option, same `Title (key)` labels as before), a long one switches
// to the filterable combobox. Mirrors `ActionTestForm.overrides.test.ts`'s
// jsdom + react-dom/client + act rig (CodeMirror's RAF trio included, since the
// form always mounts the three Overrides sub-editors).
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
const { ActionTestForm } = await import("../ActionTestForm.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;
type ActionDef = import("../types.ts").ActionDef;

function fakeApi() {
  return {
    listApps: async () => [],
    getAppAuth: async () => [],
    listConnectionsForApp: async () => [],
    listConnections: async () => [],
    getAppActions: async () => [],
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
  } as unknown as W6WApi;
}

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

async function render(actions: ActionDef[]) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api: fakeApi(),
        children: React.createElement(ActionTestForm, {
          appId: "app_1",
          actions,
          connectionId: "conn_1",
        }),
      }),
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { container, root };
}

/** The built-in action picker's `.w6w-field` — matched on its visible "Action" label. */
function actionField(container: Element): Element {
  const field = Array.from(container.querySelectorAll(".w6w-field")).find((f) =>
    f.querySelector("span")?.textContent?.startsWith("Action"),
  );
  assert.ok(field, "the Action field should render");
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

test('a short action list keeps the native <select>: placeholder first, labels "Title (key)"', async () => {
  const { container, root } = await render(SHORT);

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
    "the placeholder option and the Title (key) labels are the pre-Combobox markup",
  );

  await act(async () => {
    root.unmount();
  });
});

test("picking from that <select> still selects the action (the picker is not controlled-only)", async () => {
  const { container, root } = await render(SHORT);

  const select = actionField(container).querySelector("select") as HTMLSelectElement;
  await act(async () => {
    select.value = "list";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });

  assert.ok(
    container.textContent?.includes("list"),
    "the picked action's header (title + key) renders from the built-in selection",
  );

  await act(async () => {
    root.unmount();
  });
});

test("a long action list renders the combobox: typing filters, picking commits the action", async () => {
  const { container, root } = await render(LONG);
  const field = actionField(container);

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

  assert.equal(input.value, "Action 7 (act-7)", "picking shows the chosen label");
  assert.equal(input.getAttribute("aria-expanded"), "false", "and closes the popup");
  assert.ok(container.textContent?.includes("act-7"), "the chosen action's key renders below");

  await act(async () => {
    root.unmount();
  });
});

test("forceSelection: typing never becomes the value — blur rolls the text back to the selection", async () => {
  const { container, root } = await render(LONG);
  const field = actionField(container);
  const input = field.querySelector('input[role="combobox"]') as HTMLInputElement;

  await setInputValue(input, "act-9");
  await act(async () => {
    (field.querySelector('[role="option"]') as HTMLElement).dispatchEvent(
      new dom.window.MouseEvent("mousedown", { bubbles: true }),
    );
  });
  assert.equal(input.value, "Action 9 (act-9)");

  await setInputValue(input, "not an action");
  await act(async () => {
    input.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });

  assert.equal(input.value, "Action 9 (act-9)", "unpicked text is discarded on blur");
  assert.ok(container.textContent?.includes("act-9"), "the value is still act-9");

  await act(async () => {
    root.unmount();
  });
});
