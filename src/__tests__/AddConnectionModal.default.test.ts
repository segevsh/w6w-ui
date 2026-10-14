// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/AddConnectionModal.default.test.ts  (Node 24)
//
// T3.1.1 AC3 — `AddConnectionModal` preselects the server-flagged `default` auth method (rig mirrors
// AddConnectionModal.bounded.test.ts). Original header follows.
// `initialAppId` resolution, pinned:
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

type AuthLike = {
  key: string;
  type: string;
  displayName: string;
  default?: boolean;
  available?: boolean;
  fields: { key: string; label: string; type: string; required?: boolean }[];
};
const m = (key: string, extra: Partial<AuthLike> = {}): AuthLike => ({
  key,
  type: "apiKey",
  displayName: key,
  fields: [{ key: `${key}_field`, label: `${key} label`, type: "string", required: true }],
  ...extra,
});
const app = { id: "sendgrid", displayName: "SendGrid" };

async function open(auths: AuthLike[]) {
  const api = baseApi({
    getAppAuth: async () => auths as never,
    listAppsByIds: async () => [app as never],
  });
  const r = await renderModal(api, "sendgrid");
  await flush();
  return r;
}
const selected = (c: HTMLElement) => (c.querySelector("select") as HTMLSelectElement).value;
const renders = (c: HTMLElement, key: string) => c.textContent?.includes(`${key} label`) ?? false;

test("default on the 2nd entry: the 2nd is selected and its fields render", async () => {
  const { container, root } = await open([m("a"), m("b", { default: true })]);
  assert.equal(selected(container), "b");
  assert.ok(renders(container, "b"));
  assert.ok(!renders(container, "a"));
  await act(async () => root.unmount());
});

test("a default flagged available:false falls through to the first available", async () => {
  const { container, root } = await open([
    m("a"),
    m("b"),
    m("c", { default: true, available: false }),
  ]);
  assert.equal(selected(container), "a");
  assert.ok(renders(container, "a"));
  await act(async () => root.unmount());
});

test("no default: the first is selected, as before", async () => {
  const { container, root } = await open([m("a"), m("b")]);
  assert.equal(selected(container), "a");
  await act(async () => root.unmount());
});

test("after the user picks another method, the selection is the user's", async () => {
  const { container, root } = await open([m("a"), m("b", { default: true }), m("c")]);
  const sel = container.querySelector("select") as HTMLSelectElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(sel, "a");
    sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  assert.equal(selected(container), "a");
  assert.ok(renders(container, "a"));
  await act(async () => root.unmount());
});
