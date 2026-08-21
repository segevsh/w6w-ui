// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.homepage-tabs.test.ts  (Node 24)
//
// F-2.0's homepage: `Connected apps | Functions | Workflows`.
//
// This exists because those two tabs shipped UNREACHABLE. They were rendered
// behind `!appsOnly` — the same gate that hides Triggers/Controls/Utilities/
// Data — so every picker outside the workflow canvas (which is every picker
// that binds a *target*: a Function's Implementation card, an Endpoint's
// Target card, the rail's error handler) passed `appsOnly` and got only
// `Connected apps / Apps / AI`. The screenshot the human filed is exactly
// that sidebar. A Function and a Workflow are callable targets, not graph-only
// node kinds; `callables` is their own knob now, and `appsOnly` no longer
// touches them.
//
// Mounts the REAL StepBuilderModal in a real DOM via `react-dom/client` +
// `act` — StepBuilderModal.commit.test.ts's jsdom rig, extended with the
// `<dialog>` shim `Modal` needs and a fake `W6WApi` (the callable lists fetch
// through it on mount).
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

// jsdom implements <dialog> as an element but not its imperative API.
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

/** Enough of `W6WApi` for the two callable lists to resolve. Every other
 *  member is unreached by the tab strip and throws loudly if that changes. */
const api = new Proxy(
  {
    listApps: () => Promise.resolve([]),
    listConnections: () => Promise.resolve([]),
    listFunctions: () => Promise.resolve([]),
    listWorkflows: () => Promise.resolve([]),
  } as Record<string, unknown>,
  {
    get(t, k: string) {
      if (k in t) return t[k];
      return () => Promise.resolve([]);
    },
  },
);

async function tabsFor(props: Record<string, unknown>): Promise<string[]> {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api: api as never, children: null } as never,
        React.createElement(StepBuilderModal, {
          onClose: () => {},
          onAdd: () => {},
          ...props,
        } as never),
      ),
    );
  });
  const tabs = Array.from(document.querySelectorAll(".w6w-stepbuilder-tab")).map((el) =>
    (el.textContent || "").trim(),
  );
  await act(async () => root.unmount());
  return tabs;
}

test("the homepage leads with Connected apps | Functions | Workflows", async () => {
  const tabs = await tabsFor({});
  assert.deepEqual(
    tabs.slice(0, 3),
    ["Connected apps", "Functions", "Workflows"],
    `F-2.0's homepage, in order; got ${JSON.stringify(tabs)}`,
  );
});

// THE regression this file exists for. `appsOnly` hides the graph-only tabs;
// it must not touch the two callable ones.
test("appsOnly hides Triggers/Controls/Utilities/Data and KEEPS Functions/Workflows", async () => {
  const tabs = await tabsFor({ appsOnly: true });
  assert.deepEqual(
    tabs,
    ["Connected apps", "Functions", "Workflows", "Apps", "AI"],
    `appsOnly must leave the callable tabs standing; got ${JSON.stringify(tabs)}`,
  );
  for (const graphOnly of ["Triggers", "Controls", "Utilities", "Data"]) {
    assert.ok(!tabs.includes(graphOnly), `${graphOnly} must be hidden by appsOnly`);
  }
});

test("callables narrows the callable tabs, and [] removes both", async () => {
  assert.deepEqual(await tabsFor({ appsOnly: true, callables: ["function"] }), [
    "Connected apps",
    "Functions",
    "Apps",
    "AI",
  ]);
  assert.deepEqual(await tabsFor({ appsOnly: true, callables: [] }), [
    "Connected apps",
    "Apps",
    "AI",
  ]);
});

// The error handler's shape: `ErrorReroute.target` is a `Callable`, a two-arm
// union with no action arm, so offering an app tab there would offer picks
// that must be refused.
test("apps={false} leaves exactly the callable tabs, and opens on one of them", async () => {
  const tabs = await tabsFor({ appsOnly: true, apps: false });
  assert.deepEqual(tabs, ["Functions", "Workflows"], `got ${JSON.stringify(tabs)}`);
});

test("the default open tab is Connected apps — and Functions when apps are off", async () => {
  const container = document.getElementById("root");
  assert.ok(container);

  for (const [props, expected] of [
    [{ appsOnly: true }, "Connected apps"],
    [{ appsOnly: true, apps: false }, "Functions"],
    [{ appsOnly: true, initialTab: "workflows" }, "Workflows"],
  ] as const) {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(
          W6WUIProvider,
          { api: api as never, children: null } as never,
          React.createElement(StepBuilderModal, {
            onClose: () => {},
            onAdd: () => {},
            ...props,
          } as never),
        ),
      );
    });
    const active = document.querySelector(".w6w-stepbuilder-tab.active");
    assert.equal(
      (active?.textContent || "").trim(),
      expected,
      `initial tab for ${JSON.stringify(props)}`,
    );
    await act(async () => root.unmount());
  }
});
