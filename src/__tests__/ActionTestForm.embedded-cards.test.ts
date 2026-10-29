// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/ActionTestForm.embedded-cards.test.ts  (Node 24)
//
// T1.1.2 — embedded ActionTestForm lays params / result / saved tests out as
// stacked `.card`s (each with a `.section-head`), with no side column. The
// jsdom rig is copied from ActionTestForm.overrides.test.ts.
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

// CodeMirror 6 needs these three (verified necessary + jointly sufficient at
// `WorkflowFlowEditor.test-tab.test.ts:47-58`) — `ActionTestForm` always mounts
// three `JsonEditor`/CodeMirror instances for the Overrides sub-editors.
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

function fakeApi(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  } as unknown as W6WApi;
}

const ACTION: ActionDef = {
  key: "send",
  type: "action",
  title: "Send",
  params: [{ key: "to", type: "string", label: "To" }],
};

async function mount(props: Record<string, unknown>) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api: fakeApi({ invokeAction: async () => ({ value: { ok: 1 } }) }),
        children: React.createElement(ActionTestForm, {
          appId: "app_1",
          actions: [ACTION],
          action: ACTION,
          ...props,
        }),
      }),
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { container, root };
}

async function run(container: Element) {
  const btn = container.querySelector(".w6w-tester-actions button") as HTMLButtonElement;
  assert.ok(btn, "Run action button");
  await act(async () => {
    btn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

const cards = (c: Element) => [...c.querySelectorAll(".card")];
const headOf = (card: Element) => card.querySelector(":scope > .section-head h3")?.textContent;
const unmount = (root: { unmount(): void }) =>
  act(async () => {
    root.unmount();
  });

test("embedded + connection: params, result, saved-tests each in a headed card; no side column", async () => {
  const { container, root } = await mount({ embedded: true, connectionId: "conn_1" });
  assert.deepEqual(cards(container).map(headOf), ["Parameters", "Saved tests and history"]);
  await run(container);
  assert.deepEqual(cards(container).map(headOf), [
    "Parameters",
    "Result",
    "Saved tests and history",
  ]);
  assert.ok(
    cards(container)[1].querySelector(".w6w-result-viewer"),
    "result lives in the Result card",
  );
  assert.equal(container.querySelectorAll(".w6w-tester-embedded-rail").length, 0);
  assert.equal(container.querySelectorAll(".w6w-tester-embedded-cols").length, 0);
  await unmount(root);
});

test("embedded without connection: params/result cards, no saved-tests card", async () => {
  const { container, root } = await mount({ embedded: true });
  await run(container);
  assert.deepEqual(cards(container).map(headOf), ["Parameters", "Result"]);
  assert.equal(container.querySelectorAll(".w6w-tester-embedded-rail").length, 0);
  await unmount(root);
});

test("non-embedded: no cards, no embedded wrappers", async () => {
  const { container, root } = await mount({ connectionId: "conn_1" });
  await run(container);
  assert.equal(cards(container).length, 0);
  assert.equal(container.querySelectorAll("[class*='w6w-tester-embedded']").length, 0);
  assert.ok(container.querySelector(".w6w-result-viewer"), "result still rendered inline");
  await unmount(root);
});
