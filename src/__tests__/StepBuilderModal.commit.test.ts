// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.commit.test.ts  (Node 24)
//
// No DOM/interaction test harness existed anywhere in `ui`/`studio` before this
// file (confirmed: the only precedent, UptimeStrip.test.ts, is a one-shot
// `renderToStaticMarkup` snapshot — no hooks, no events). Progressive commit is
// a stateful, effect-driven, user-interaction behavior, so a real DOM + a real
// interactive react-dom/client root is the only way to pin it. `../test-jsx-loader.mjs`
// (new) supplies the one missing piece Node's own type-stripping can't do —
// transpiling `.tsx` — everything else is jsdom + react-dom, already-real
// dependencies of this package (jsdom added as a devDependency by this task).
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { AppStepConfig, ControlStepConfig } = await import("../StepBuilderModal.tsx");
const { W6wUIProvider } = await import("../provider.tsx");
type W6wApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6wApi>>;

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    listApps: async () => [],
    getAppAuth: async () => [],
    listConnectionsForApp: async () => [],
    listConnections: async () => [],
    getAppActions: async () => [
      {
        key: "send",
        title: "Send",
        params: [{ key: "to", type: "string", required: true, label: "To" }],
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
    ...overrides,
  } as unknown as W6wApi;
}

function setInputValue(input: Element | null, value: string) {
  const el = input as HTMLInputElement;
  const descriptor = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  );
  const setter = descriptor?.set;
  setter?.call(el, value);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

test("AppStepConfig commits once on setup-complete, then routes edits through onDraftChange", async () => {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  const onAddCalls: unknown[] = [];
  const onDraftChangeCalls: [string, { with?: Record<string, unknown> }][] = [];
  const onAdd = (step: unknown) => {
    onAddCalls.push(step);
    return "step_1"; // simulates addBuiltStep's minted id
  };
  const onDraftChange = (id: string, step: { with?: Record<string, unknown> }) => {
    onDraftChangeCalls.push([id, step]);
  };

  await act(async () => {
    root.render(
      React.createElement(W6wUIProvider, {
        api: fakeApi(),
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

  assert.equal(onAddCalls.length, 0, "no action picked yet — nothing committed");

  const select = container.querySelector("select") as HTMLSelectElement | null;
  assert.ok(select, "action <select> should be present on the Setup tab");

  await act(async () => {
    select.value = "send";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });

  assert.equal(onAddCalls.length, 1, "picking the action commits exactly once");
  assert.deepEqual((onAddCalls[0] as { uses: unknown }).uses, {
    app: "sendgrid",
    action: "send",
  });

  // Move to Configure and edit the required param several times — each edit
  // must update the already-committed node, never mint a second one.
  const configureTab = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === "Configure",
  );
  assert.ok(configureTab);
  await act(async () => {
    configureTab.click();
  });

  const toInput = container.querySelector('input[type="text"]');
  assert.ok(toInput, "the 'to' param field should be rendered on Configure");

  for (const v of ["a@example.com", "b@example.com", "c@example.com"]) {
    await act(async () => {
      setInputValue(toInput, v);
    });
  }

  assert.equal(onAddCalls.length, 1, "onAdd must NOT fire again on subsequent edits");
  assert.ok(onDraftChangeCalls.length >= 1, "edits after commit must route through onDraftChange");
  for (const [id] of onDraftChangeCalls) {
    assert.equal(id, "step_1", "every post-commit update targets the minted id");
  }
  const last = onDraftChangeCalls[onDraftChangeCalls.length - 1];
  assert.equal(last[1].with?.to, "c@example.com");

  await act(async () => {
    root.unmount();
  });
});

test("ControlStepConfig commits on mount, then routes edits through onDraftChange", async () => {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  const onAddCalls: unknown[] = [];
  const onDraftChangeCalls: [string, unknown][] = [];
  const onAdd = (step: unknown) => {
    onAddCalls.push(step);
    return "gate_1";
  };
  const onDraftChange = (id: string, step: unknown) => {
    onDraftChangeCalls.push([id, step]);
  };
  const node = {
    app: "@w6w/control",
    action: "if",
    label: "If",
    displayName: "If",
    icon: "if",
    group: "control" as const,
    ports: { in: 1, out: 1 },
    params: [{ key: "cond", type: "string", required: true, label: "Condition" }],
  };

  // Wrapped in `W6wUIProvider` (not in the contract's original snippet):
  // `ControlStepConfig` unconditionally mounts `useSeedSources`, which reads
  // `useW6wApi()` regardless of `enabled` (T1.1.1, merged after this contract
  // was drafted — same file, "different concern" per the contract's Context
  // note) — so a bare render now throws "useW6wApi must be used inside
  // <W6wUIProvider>" before it ever reaches the commit-on-mount effect this
  // test is pinning. Wrapping supplies that context without touching
  // T1.1.1's wiring or this test's assertions.
  await act(async () => {
    root.render(
      React.createElement(W6wUIProvider, {
        api: fakeApi(),
        children: React.createElement(ControlStepConfig, {
          node,
          onAdd,
          onClose: () => {},
          onDraftChange,
        }),
      }),
    );
  });

  assert.equal(onAddCalls.length, 1, "a control node commits on mount, exactly once");

  const condInput = container.querySelector('input[type="text"]');
  assert.ok(condInput, "the 'cond' param field should be rendered");
  for (const v of ["a", "b", "c"]) {
    await act(async () => {
      setInputValue(condInput, v);
    });
  }

  assert.equal(onAddCalls.length, 1, "onAdd must NOT fire again on subsequent edits");
  assert.ok(onDraftChangeCalls.length >= 1);
  for (const [id] of onDraftChangeCalls) assert.equal(id, "gate_1");

  await act(async () => {
    root.unmount();
  });
});
