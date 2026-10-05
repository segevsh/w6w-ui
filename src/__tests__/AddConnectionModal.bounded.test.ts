// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/AddConnectionModal.bounded.test.ts  (Node 24)
//
// T2.1.1 AC3 — `AddConnectionModal`'s `initialAppId` resolution, pinned:
// `listAppsByIds` present → its OWN result decides (found → that app; a miss
// — empty result or rejection — → not-found), `listApps` is NEVER called
// alongside it; `listAppsByIds` absent and `listApps` present → today's
// full-list resolution; both absent → not-found, no throw. jsdom bootstrap
// mirrors `AppPicker.paged.test.ts`'s rig verbatim (same `<dialog>` shim is
// needed here too — `AddConnectionModal` renders the same `Modal` wrapper).
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

// jsdom implements <dialog> as an element but not its imperative API — `Modal`
// (`AddConnectionModal`'s wrapper) calls `showModal()` in a mount effect.
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
const { AddConnectionModal } = await import("../AddConnectionModal.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;
type AppSummaryLike = { id: string; displayName: string };

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function mount(el: React.ReactElement) {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  return { container: container as HTMLElement, root, el };
}

/**
 * The minimum `AddConnectionModal` + its `initialAppId` effect needs to
 * settle, genuinely OMITTING `listApps`/`listAppsByIds`/`listAppsPage` unless
 * `overrides` supplies them — not a Proxy-style answer-everything stub (see
 * the same distinction in `StepBuilderModal.app-triggers.test.ts`'s
 * `fakeApi`). Declared `: W6WApi` with no `as`/`unknown` cast on every call
 * site below so reverting `listApps?` back to required fails THESE fixtures
 * at typecheck, not just at runtime.
 */
function baseApi(overrides: Partial<W6WApi> = {}): W6WApi {
  return {
    getAppAuth: async () => [],
    createConnection: async () => {
      throw new Error("not used in this test");
    },
    startAppOAuthFlow: async () => {
      throw new Error("not used in this test");
    },
    getAppActions: async () => [],
    listConnectionsForApp: async () => [],
    listConnections: async () => [],
    invokeAction: async () => {
      throw new Error("not used in this test");
    },
    listSavedTests: async () => [],
    createSavedTest: async () => {
      throw new Error("not used in this test");
    },
    updateSavedTest: async () => {
      throw new Error("not used in this test");
    },
    deleteSavedTest: async () => {},
    recordTestRun: async () => {},
    saveStepTest: async () => {
      throw new Error("not used in this test");
    },
    recordStepTestRun: async () => {},
    listStepTests: async () => [],
    listFunctions: async () => [],
    getFunction: async () => {
      throw new Error("not used in this test");
    },
    invokeFunction: async () => undefined,
    listWorkflows: async () => [],
    getWorkflow: async () => {
      throw new Error("not used in this test");
    },
    runWorkflow: async () => {
      throw new Error("not used in this test");
    },
    ...overrides,
  };
}

async function renderModal(api: W6WApi, initialAppId: string) {
  const { container, root } = mount(React.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(AddConnectionModal, {
          onClose: () => {},
          onCreated: () => {},
          initialAppId,
        } as never),
      ),
    );
  });
  return { container, root };
}

test("listAppsByIds present + found: resolves straight to that app, zero listApps calls", async () => {
  let listAppsCalls = 0;
  const byIdsCalls: string[][] = [];
  const app: AppSummaryLike = { id: "sendgrid", displayName: "SendGrid" };
  const api = baseApi({
    listApps: async () => {
      listAppsCalls += 1;
      return [];
    },
    listAppsByIds: async (ids) => {
      byIdsCalls.push([...ids]);
      return ids.includes(app.id) ? [app as never] : [];
    },
  });
  const { container, root } = await renderModal(api, "sendgrid");
  await flush();
  assert.deepEqual(byIdsCalls, [["sendgrid"]]);
  assert.equal(listAppsCalls, 0, "a found bounded id must never also call listApps");
  assert.ok(container.querySelector("code")?.textContent?.includes("sendgrid"));
  await act(async () => root.unmount());
});

test("listAppsByIds present + miss (empty result): not-found, zero listApps calls — no fallback to the full catalog", async () => {
  let listAppsCalls = 0;
  const api = baseApi({
    listApps: async () => {
      listAppsCalls += 1;
      return [];
    },
    listAppsByIds: async () => [],
    // Gives the step-one AppPicker (rendered after the not-found outcome) a
    // bounded seam of its OWN, so its unrelated legacy fetch can never be the
    // thing that (mis)credits `listAppsCalls` — this test is only about
    // whether the initialAppId MISS itself falls back, per the mutation
    // battery ("restore fallbackToFullList() on the bounded-miss branch").
    listAppsPage: async () => ({ apps: [] }),
  });
  const { container, root } = await renderModal(api, "no-such-app");
  await flush();
  assert.equal(listAppsCalls, 0, "a bounded miss must never fall back to listApps");
  assert.equal(container.querySelector(".w6w-modal-title")?.textContent, "Add connection");
  await act(async () => root.unmount());
});

test("listAppsByIds present + reject: not-found, zero listApps calls", async () => {
  let listAppsCalls = 0;
  const api = baseApi({
    listApps: async () => {
      listAppsCalls += 1;
      return [];
    },
    listAppsByIds: async () => {
      throw new Error("boom");
    },
    listAppsPage: async () => ({ apps: [] }),
  });
  const { container, root } = await renderModal(api, "sendgrid");
  await flush();
  assert.equal(listAppsCalls, 0, "a rejected bounded lookup must never fall back to listApps");
  assert.equal(container.querySelector(".w6w-modal-title")?.textContent, "Add connection");
  await act(async () => root.unmount());
});

test("no listAppsByIds + listApps present: today's full-list resolution still works", async () => {
  let listAppsCalls = 0;
  const app: AppSummaryLike = { id: "sendgrid", displayName: "SendGrid" };
  const api = baseApi({
    listApps: async () => {
      listAppsCalls += 1;
      return [app as never];
    },
  });
  const { container, root } = await renderModal(api, "sendgrid");
  await flush();
  assert.equal(listAppsCalls, 1);
  assert.ok(container.querySelector("code")?.textContent?.includes("sendgrid"));
  await act(async () => root.unmount());
});

test("neither listAppsByIds nor listApps: resolves to not-found without ever calling an undefined function", async () => {
  const api = baseApi();
  const { container, root } = await renderModal(api, "sendgrid");
  await flush();
  assert.equal(container.querySelector(".w6w-modal-title")?.textContent, "Add connection");
  assert.ok(
    container.textContent?.includes("No apps registered yet"),
    "falls to the step-one AppPicker, which settles into its own empty state",
  );
  await act(async () => root.unmount());
});
