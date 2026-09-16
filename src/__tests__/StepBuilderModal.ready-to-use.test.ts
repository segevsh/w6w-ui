// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.ready-to-use.test.ts  (Node 24)
//
// T2.1.1 A3/C3 — `useReadyToUse`'s bounded connected-app id resolution
// (`W6WApi.listAppsByIds`): distinct connection app ids (including a
// synthetic zero-credential row), a bounded first batch, explicit
// "Load more" for the rest, missing/404 ids silently omitted, and the
// `listApps()` fallback for a provider that only implements the legacy
// method. jsdom bootstrap mirrors `StepBuilderModal.homepage-tabs.test.ts`'s
// rig verbatim; this file deliberately does NOT use that file's catch-all
// `Proxy` fixture (see `AppPicker.paged.test.ts`'s note on why a blanket
// stub defeats capability detection) — every fake here declares its members
// explicitly.
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

type AppLike = { id: string; displayName: string };

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function mount(api: Record<string, unknown>, props: Record<string, unknown> = {}) {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  return { container: container as HTMLElement, root, api, props };
}

async function render(m: ReturnType<typeof mount>) {
  await act(async () => {
    m.root.render(
      React.createElement(
        W6WUIProvider,
        { api: m.api, children: null } as never,
        React.createElement(StepBuilderModal, {
          onClose: () => {},
          onAdd: () => {},
          appsOnly: true,
          callables: [],
          ...m.props,
        } as never),
      ),
    );
  });
  await flush();
}

const readTabs = (container: Element) =>
  Array.from(container.querySelectorAll(".w6w-stepbuilder-tab")).map((el) =>
    (el.textContent || "").trim(),
  );
const readConnectedAppIds = (container: Element) =>
  Array.from(container.querySelectorAll(".w6w-readytouse .w6w-stepbuilder-item code")).map((el) =>
    (el.textContent || "").trim(),
  );
const findLoadMore = (container: Element) =>
  Array.from(container.querySelectorAll(".w6w-readytouse button")).find(
    (b) => (b.textContent || "").trim() === "Load more",
  ) as HTMLElement | undefined;

test("bounded: distinct connection app ids (real + synthetic zero-credential) resolve via listAppsByIds, one batch", async () => {
  const byIdsCalls: string[][] = [];
  const api = {
    listConnections: async () => [
      { id: "c1", appId: "slack" },
      { id: "c2", appId: "slack" }, // duplicate appId must be de-duplicated
      { id: "zerocred:sendgrid", appId: "sendgrid" }, // synthetic zero-credential row
    ],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listAppsByIds: async (ids: readonly string[]) => {
      byIdsCalls.push([...ids]);
      const table: Record<string, AppLike> = {
        slack: { id: "slack", displayName: "Slack" },
        sendgrid: { id: "sendgrid", displayName: "SendGrid" },
      };
      return ids.map((id) => table[id]).filter((a): a is AppLike => Boolean(a));
    },
    listApps: async () => {
      throw new Error("listApps must not be called when listAppsByIds resolves real data");
    },
  };
  const { container, root } = mount(api);
  await render({ container, root, api, props: {} });

  assert.equal(byIdsCalls.length, 1, "exactly one bounded batch request on open");
  assert.deepEqual([...byIdsCalls[0]].sort(), ["sendgrid", "slack"]);
  assert.ok(readTabs(container).includes("Ready to use"));
  assert.deepEqual(readConnectedAppIds(container).sort(), ["sendgrid", "slack"]);
  await act(async () => root.unmount());
});

test("bounded: more ids than one batch exposes explicit Load more, never auto-drains the rest", async () => {
  const BATCH = 12; // must match StepBuilderModal's READY_TO_USE_ID_BATCH
  const ids = Array.from({ length: BATCH + 3 }, (_, i) => `app_${i}`);
  const byIdsCalls: string[][] = [];
  const api = {
    listConnections: async () => ids.map((id, i) => ({ id: `c${i}`, appId: id })),
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listAppsByIds: async (batch: readonly string[]) => {
      byIdsCalls.push([...batch]);
      return batch.map((id) => ({ id, displayName: id }));
    },
    listApps: async () => {
      throw new Error("listApps must not be called on the bounded path");
    },
  };
  const { container, root } = mount(api);
  await render({ container, root, api, props: {} });

  assert.equal(byIdsCalls.length, 1);
  assert.equal(
    byIdsCalls[0].length,
    BATCH,
    "the first batch is bounded, not the whole connected-id list",
  );
  assert.equal(readConnectedAppIds(container).length, BATCH);
  const loadMore = findLoadMore(container);
  assert.ok(loadMore, "Load more must be present while ids remain unresolved");

  await act(async () => {
    loadMore?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });

  assert.equal(byIdsCalls.length, 2);
  assert.equal(byIdsCalls[1].length, 3, "the second batch requests only the remaining ids");
  assert.equal(readConnectedAppIds(container).length, BATCH + 3);
  assert.equal(findLoadMore(container), undefined, "no more ids left ⇒ no Load more button");
  await act(async () => root.unmount());
});

test("bounded: a missing/404 id is silently omitted, not shown as an error", async () => {
  const api = {
    listConnections: async () => [
      { id: "c1", appId: "slack" },
      { id: "c2", appId: "deleted-app" },
    ],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listAppsByIds: async (ids: readonly string[]) =>
      ids.filter((id) => id === "slack").map((id) => ({ id, displayName: "Slack" })),
    listApps: async () => {
      throw new Error("listApps must not be called on the bounded path");
    },
  };
  const { container, root } = mount(api);
  await render({ container, root, api, props: {} });

  assert.deepEqual(readConnectedAppIds(container), ["slack"]);
  assert.equal(container.querySelector(".w6w-error"), null);
  await act(async () => root.unmount());
});

test("bounded: an all-404 FIRST batch is a legitimate empty result, never a fallback to listApps()", async () => {
  // T2.1.1 ROUND 2: every connected app was since deleted from the catalog —
  // an ordinary real-world case, not a stub artifact. A fully-implemented,
  // well-typed `listAppsByIds` that correctly resolves every id to nothing
  // must never be treated as evidence the optional method "isn't really
  // implemented"; `bounded` is `typeof listAppsByIds === "function"` alone.
  //
  // An all-404 batch also makes "Ready to use" itself report `state ===
  // "empty"` (nothing resolved, no Functions/Workflows either), which flips
  // the modal's OWN default tab to Apps (existing, unrelated behavior) — so
  // this fixture also declares a valid (empty) `listAppsPage` for the Apps
  // tab's OWN bounded fetch, keeping `listApps()` genuinely unreachable from
  // EITHER path, rather than a throwing stub that would also poison the
  // Apps tab's legitimate, unrelated fetch.
  let byIdsCalls = 0;
  const api = {
    listConnections: async () => [
      { id: "c1", appId: "deleted-app-1" },
      { id: "c2", appId: "deleted-app-2" },
    ],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listAppsByIds: async () => {
      byIdsCalls += 1;
      return [];
    },
    listAppsPage: async () => ({ apps: [], nextCursor: undefined }),
    listApps: async () => {
      throw new Error("listApps must not be called on the bounded path");
    },
  };
  const { container, root } = mount(api);
  await render({ container, root, api, props: {} });

  assert.equal(
    byIdsCalls,
    1,
    "exactly one bounded batch request on open, never a catalog fallback",
  );
  assert.deepEqual(readConnectedAppIds(container), []);
  assert.equal(container.querySelector(".w6w-error"), null);
  assert.equal(
    findLoadMore(container),
    undefined,
    "nothing left unresolved ⇒ no Load more affordance",
  );
  await act(async () => root.unmount());
});

test("bounded: appsFilter narrows the resolved batch, exactly as the legacy full-catalog path did", async () => {
  const api = {
    listConnections: async () => [
      { id: "c1", appId: "slack" },
      { id: "c2", appId: "github" },
    ],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listAppsByIds: async (ids: readonly string[]) => {
      const table: Record<string, AppLike> = {
        slack: { id: "slack", displayName: "Slack" },
        github: { id: "github", displayName: "GitHub" },
      };
      return ids.map((id) => table[id]).filter((a): a is AppLike => Boolean(a));
    },
    listApps: async () => {
      throw new Error("listApps must not be called on the bounded path");
    },
  };
  const { container, root } = mount(api);
  await render({
    container,
    root,
    api,
    props: { appsFilter: (a: { id: string }) => a.id === "github" },
  });

  assert.deepEqual(readConnectedAppIds(container), ["github"]);
  await act(async () => root.unmount());
});

test("legacy fallback: no listAppsByIds ⇒ the ORIGINAL full-catalog + zeroCredential path, unchanged", async () => {
  const api = {
    listConnections: async () => [{ id: "c1", appId: "slack" }],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listApps: async () => [
      { id: "slack", displayName: "Slack" },
      { id: "sendgrid", displayName: "SendGrid", zeroCredential: true },
      { id: "unconnected", displayName: "Unconnected" },
    ],
  };
  const { container, root } = mount(api);
  await render({ container, root, api, props: {} });

  assert.deepEqual(readConnectedAppIds(container).sort(), ["sendgrid", "slack"]);
  assert.equal(
    findLoadMore(container),
    undefined,
    "the legacy path never shows a Load more affordance",
  );
  await act(async () => root.unmount());
});
