// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.exclude-callables.test.ts
//
// T1.2.1 — `excludeCallableIds` hides a callable by id on the Functions tab and on
// "Ready to use"; every other entry, and the unset case, are unchanged.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
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

const proto = dom.window.HTMLDialogElement?.prototype as unknown as Record<string, unknown>;
if (proto && typeof proto.showModal !== "function") {
  proto.showModal = function showModal(this: HTMLElement) {
    this.setAttribute("open", "");
  };
  proto.close = function close(this: HTMLElement) {
    this.removeAttribute("open");
  };
}

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { StepBuilderModal } = await import("../StepBuilderModal.tsx");
const { W6WUIProvider } = await import("../provider.tsx");

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const readIds = (container: Element) =>
  Array.from(container.querySelectorAll(".w6w-stepbuilder-item--callable code")).map((el) =>
    (el.textContent || "").trim(),
  );

const api = {
  listConnections: async () => [],
  listFunctions: async () => [
    { id: "fn_self", name: "same-name", displayName: "Self" },
    { id: "fn_other", name: "same-name", displayName: "Other" },
  ],
  listWorkflows: async () => [],
  listAppsByIds: async () => [],
};

async function open(excludeCallableIds: string[] | undefined, tab: "connected" | "functions") {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(StepBuilderModal, {
          onClose: () => {},
          onAdd: () => {},
          appsOnly: true,
          callables: ["function"],
          initialTab: tab,
          excludeCallableIds,
        } as never),
      ),
    );
  });
  await flush();
  const ids = readIds(container);
  await act(async () => root.unmount());
  return ids;
}

for (const tab of ["connected", "functions"] as const) {
  test(`${tab}: excluded id is hidden, others stay (id equality, not name)`, async () => {
    assert.deepEqual((await open(["fn_self"], tab)).sort(), ["fn_other"]);
  });
  test(`${tab}: unset lists everything`, async () => {
    assert.deepEqual((await open(undefined, tab)).sort(), ["fn_other", "fn_self"]);
  });
}
