// Run (from packages/ui): node --max-old-space-size=2048 --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/ParamsForm.dynamic-sites.test.ts
//
// T1.4 A8: the three action-param ParamsForm sites pass `dynamic` (with connectionId).
// Rig mirrors StepEditModal.setup-and-configure.test.ts.
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

// jsdom@30 doesn't implement <dialog>'s imperative API — `Modal.tsx` calls
// `el.showModal()` in a mount effect, which would otherwise throw.
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
const { AppStepConfig } = await import("../StepBuilderModal.tsx");
const { ActionTestForm } = await import("../ActionTestForm.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
const { ExpressionOptionsProvider } = await import("../components/ExpressionOptions.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;
type FlowStep = import("../flow-types.ts").FlowStep;

const ACTION = {
  key: "messages",
  type: "action",
  title: "Messages",
  params: [{ key: "model", label: "Model", type: "string", options: { source: "resolveFields" } }],
};
const CONNS = [
  { id: "c1", appId: "anthropic", authKey: "apiKey", displayName: "one" },
  { id: "c2", appId: "anthropic", authKey: "apiKey", displayName: "two" },
];

type Call = { appId: string; actionKey: string; body: Record<string, unknown> };

function fakeApi(calls: Call[]) {
  return {
    listApps: async () => [{ id: "anthropic", displayName: "Anthropic" }],
    getAppAuth: async () => [],
    listConnectionsForApp: async () => CONNS,
    listConnections: async () => [],
    getAppActions: async () => [ACTION],
    invokeAction: async () => ({ value: {} }),
    listStepTests: async () => [],
    listSavedTests: async () => [],
    resolveActionFields: async (
      appId: string,
      actionKey: string,
      body: Record<string, unknown>,
    ) => {
      calls.push({ appId, actionKey, body });
      return { fields: { model: { options: [{ value: "m1", label: "M1" }] } } };
    },
  } as unknown as W6WApi;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function wrap(calls: Call[], child: unknown) {
  return React.createElement(W6WUIProvider, {
    api: fakeApi(calls),
    children: React.createElement(ExpressionOptionsProvider, {
      value: { sampleValues: {} },
      children: child as never,
    }),
  });
}

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  return { container, root: createRoot(container) };
}

function assertInit(calls: Call[], connectionId: string) {
  assert.ok(calls.length >= 1, "resolveActionFields must be called (connectionId present)");
  const c = calls[calls.length - 1];
  assert.equal(c.appId, "anthropic");
  assert.equal(c.actionKey, "messages");
  assert.equal(c.body.reason, "init");
  assert.equal(c.body.connectionId, connectionId);
  assert.equal(c.body.version, undefined);
}

test("A8 ActionTestForm passes dynamic with its connectionId", async () => {
  const calls: Call[] = [];
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      wrap(
        calls,
        React.createElement(ActionTestForm, {
          appId: "anthropic",
          actions: [ACTION as never],
          action: ACTION as never,
          connectionId: "c1",
        }),
      ),
    );
  });
  await flush();
  assertInit(calls, "c1");
  assert.ok(container.querySelector("[role=combobox]"), "dynamic field renders a Combobox");
  await act(async () => root.unmount());
});

test("A8 AppStepConfig passes dynamic with its connectionId", async () => {
  const calls: Call[] = [];
  const { root } = mountRoot();
  await act(async () => {
    root.render(
      wrap(
        calls,
        React.createElement(AppStepConfig, {
          appId: "anthropic",
          app: { id: "anthropic", displayName: "Anthropic" } as never,
          onAdd: () => "s1",
          onClose: () => {},
          initialAction: "messages",
          initialConnection: "c1",
          initialWith: {},
        }),
      ),
    );
  });
  await flush();
  await flush();
  assertInit(calls, "c1");
  await act(async () => root.unmount());
});

test("A8 StepEditModal passes dynamic; a connection switch in Setup re-inits with the new id", async () => {
  const calls: Call[] = [];
  const { container, root } = mountRoot();
  let step: FlowStep = {
    id: "s1",
    uses: { app: "anthropic", action: "messages", connection: "c1" },
    with: {},
  };
  const render = async () => {
    await act(async () => {
      root.render(
        wrap(
          calls,
          React.createElement(StepEditModal, {
            workflowId: "wf_1",
            step,
            upstreamSteps: [],
            onChange: (next: FlowStep) => {
              step = next;
            },
            onClose: () => {},
          }),
        ),
      );
    });
    await flush();
  };
  const tab = async (name: string) => {
    const b = Array.from(container.querySelectorAll(".w6w-subtabs button")).find(
      (x) => x.textContent === name,
    ) as HTMLButtonElement;
    assert.ok(b, `${name} tab`);
    await act(async () => b.click());
    await flush();
  };
  await render();
  await tab("Configure");
  assertInit(calls, "c1");

  await tab("Setup");
  const conn = container.querySelector(
    '.w6w-stepconfig-body button[aria-label="Connection"]',
  ) as HTMLButtonElement;
  assert.ok(conn);
  await act(async () => conn.click());
  await flush();
  const item = Array.from(container.querySelectorAll(".w6w-flyout .w6w-stepbuilder-item")).find(
    (b) => b.textContent?.includes("two"),
  ) as HTMLButtonElement;
  assert.ok(item, "connection two listed");
  await act(async () => item.click());
  await flush();
  assert.equal(step.uses.connection, "c2");
  await render();
  await tab("Configure");
  assertInit(calls, "c2");
  await act(async () => root.unmount());
});
