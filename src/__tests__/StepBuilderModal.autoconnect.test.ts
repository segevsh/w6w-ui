// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.autoconnect.test.ts  (Node 24)
//
// T4.2.1 — `AppStepConfig`'s third connection state: an app's `tenantAuth`/`jit`
// method is auto-satisfied for the calling scope's tenant (T3.1.1's new
// `AuthDef.autoSatisfied` field). Mirrors the harness `StepBuilderModal.commit.test.ts`
// establishes (jsdom globals, the `IS_REACT_ACT_ENVIRONMENT` flag, the dynamic
// imports, `fakeApi()`, and the `onAdd` capture) — that file already mounts
// `AppStepConfig` through `W6WUIProvider` and asserts on the committed step's
// `uses`, which is exactly the assertion surface this node needs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { BuiltStep } from "../StepBuilderModal.tsx";

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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { AppStepConfig } = await import("../StepBuilderModal.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;
type AuthDefLike = { key: string; type: string; available?: boolean; autoSatisfied?: boolean };
type ConnLike = { id: string; appId?: string; authKey?: string; state?: string };

function fakeApi(
  getAppAuth: () => Promise<AuthDefLike[]>,
  listConnectionsForApp: () => Promise<ConnLike[]>,
): W6WApi {
  return {
    listApps: async () => [],
    getAppAuth,
    listConnectionsForApp,
    listConnections: async () => [],
    getAppActions: async () => [
      {
        key: "send",
        title: "Send",
        params: [],
      },
    ],
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

// `T` per the contract's table: a `tenantAuth`-typed method, otherwise `available`.
const T = { key: "tenant", type: "tenantAuth", available: true };

async function mount(
  getAppAuth: () => Promise<AuthDefLike[]>,
  listConnectionsForApp: () => Promise<ConnLike[]>,
) {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  const onAddCalls: unknown[] = [];
  const onAdd = (step: unknown) => {
    onAddCalls.push(step);
    return "step_1"; // simulates addBuiltStep's minted id
  };
  // Progressive commit (T1.1.x) fires `onAdd` the moment Setup completes only
  // when `onDraftChange` is supplied — same wiring `commit.test.ts` uses to pin
  // the "picking the action commits" assertion; a no-op capture is enough here.
  const onDraftChange = () => {};

  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api: fakeApi(getAppAuth, listConnectionsForApp),
        children: React.createElement(AppStepConfig, {
          appId: "sendgrid",
          app: { id: "sendgrid", displayName: "SendGrid" },
          onAdd,
          onClose: () => {},
          onDraftChange,
        }),
      }),
    );
  });
  // Flush the auth/actions/connections effects (Promise.all in a useEffect).
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  return { container, root, onAddCalls };
}

async function pickAction(container: Element) {
  // T-1: the Action field is always the searchable combobox — open it on focus
  // and pick the option by its `Title (key)` label (no native <select>).
  const input = container.querySelector(
    '.w6w-field input[role="combobox"]',
  ) as HTMLInputElement | null;
  assert.ok(input, "the Action combobox should be present on the Setup tab");
  await act(async () => {
    input.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
  });
  const option = Array.from(container.querySelectorAll('[role="option"]')).find((o) =>
    (o.textContent ?? "").trim().endsWith("(send)"),
  ) as HTMLElement | undefined;
  assert.ok(option, "the Send action should be listed");
  await act(async () => {
    option.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
  });
}

function connectionButton(container: Element) {
  const button = container.querySelector('button[aria-label="Connection"]') as HTMLButtonElement;
  assert.ok(button);
  assert.equal(
    button.closest(".w6w-app-conn-row")?.querySelector('button[aria-label="App"]') !== null,
    true,
  );
  return button;
}

test("zero-credential app shows an editable Default account and commits it explicitly", async () => {
  const { container, root, onAddCalls } = await mount(
    async () => [{ ...T, autoSatisfied: true }],
    async () => [],
  );
  assert.equal(connectionButton(container).textContent, "Default");
  assert.doesNotMatch(
    container.textContent ?? "",
    /Connected automatically|Create connection|Use connection from a node/,
  );
  await act(async () => connectionButton(container).click());
  assert.ok(document.querySelector('[data-connection-id="zerocred:sendgrid"]'));
  assert.match(document.body.textContent ?? "", /New connection/);
  await act(async () => connectionButton(container).click());
  await pickAction(container);
  assert.deepEqual(
    onAddCalls.map((s) => (s as BuiltStep).uses),
    [{ app: "sendgrid", action: "send", connection: "zerocred:sendgrid" }],
  );
  await act(async () => root.unmount());
});

test("JIT Default keeps the scheduled-run caveat", async () => {
  const { container, root } = await mount(
    async () => [{ key: "jit", type: "jit", available: true, autoSatisfied: true }],
    async () => [],
  );
  assert.equal(connectionButton(container).textContent, "Default");
  assert.match(container.textContent ?? "", /Scheduled or queued runs need a stored connection/);
  await act(async () => root.unmount());
});

test("ordinary app selects its available account", async () => {
  const { container, root, onAddCalls } = await mount(
    async () => [T],
    async () => [{ id: "c1", appId: "sendgrid", authKey: "tenant", state: "connected" }],
  );
  await pickAction(container);
  assert.equal((onAddCalls[0] as BuiltStep).uses.connection, "c1");
  await act(async () => root.unmount());
});

test("mixed auth defaults to Default and allows a stored OAuth account from the same menu", async () => {
  const { container, root, onAddCalls } = await mount(
    async () => [
      { key: "oauth", type: "oauth2" },
      { ...T, autoSatisfied: true },
    ],
    async () => [{ id: "oauth1", appId: "sendgrid", authKey: "oauth", state: "connected" }],
  );
  assert.equal(connectionButton(container).textContent, "Default");
  await act(async () => connectionButton(container).click());
  const choice = document.querySelector('[data-connection-id="oauth1"]') as HTMLButtonElement;
  assert.ok(choice);
  await act(async () => choice.click());
  assert.equal(connectionButton(container).textContent, "oauth1");
  await pickAction(container);
  assert.equal((onAddCalls[0] as BuiltStep).uses.connection, "oauth1");
  await act(async () => root.unmount());
});

for (const auth of [T, { key: "pat", type: "apiKey", available: true, autoSatisfied: true }]) {
  test(`${auth.type} requires a stored account without an authorized default`, async () => {
    const { container, root, onAddCalls } = await mount(
      async () => [auth],
      async () => [],
    );
    await pickAction(container);
    assert.equal(onAddCalls.length, 0);
    assert.match(container.textContent ?? "", /This app needs a connection/);
    assert.equal(connectionButton(container).textContent, "No connection");
    await act(async () => root.unmount());
  });
}
