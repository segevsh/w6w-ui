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

// ── T1.1.3 (I-0 / R-B1′): inline `ConnectionSummary.app` first ──────────────
const readItemNames = (container: Element) =>
  Array.from(container.querySelectorAll(".w6w-readytouse .w6w-stepbuilder-item strong")).map((el) =>
    (el.textContent || "").trim(),
  );
const readItemIconSrcs = (container: Element) =>
  Array.from(container.querySelectorAll(".w6w-readytouse .w6w-stepbuilder-item img")).map(
    (el) => el.getAttribute("src") ?? "",
  );

test("T1.1.3 I1 — every connection carries inline app meta ⇒ ZERO app-lookup calls, cards render the inline meta", async () => {
  let byIdsCalls = 0;
  let listAppsCalls = 0;
  const api = {
    listConnections: async () => [
      {
        id: "c1",
        appId: "slack",
        app: { displayName: "Slack Inline", iconSvg: "data:image/svg+xml;base64,U0xBQ0s=" },
      },
      { id: "c2", appId: "github", app: { displayName: "GitHub Inline", brandColor: "#24292F" } },
    ],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listAppsByIds: async () => {
      byIdsCalls += 1;
      return [];
    },
    listApps: async () => {
      listAppsCalls += 1;
      return [];
    },
  };
  const { container, root } = mount(api);
  await render({ container, root, api, props: {} });

  assert.equal(byIdsCalls, 0, "inline app meta on every row ⇒ listAppsByIds is never called");
  assert.equal(listAppsCalls, 0, "inline app meta on every row ⇒ listApps is never called");
  assert.deepEqual(readConnectedAppIds(container).sort(), ["github", "slack"]);
  assert.deepEqual(readItemNames(container).sort(), ["GitHub Inline", "Slack Inline"]);
  assert.deepEqual(readItemIconSrcs(container), ["data:image/svg+xml;base64,U0xBQ0s="]);
  const tile = container.querySelector(
    ".w6w-readytouse .w6w-stepbuilder-item span[aria-hidden='true']",
  ) as HTMLElement | null;
  assert.equal(
    tile?.style.background,
    "rgb(36, 41, 47)",
    "inline brandColor paints the initials tile",
  );
  assert.equal(findLoadMore(container), undefined, "nothing unresolved ⇒ no Load more");
  await act(async () => root.unmount());
});

test("T1.1.3 I2 — a mix ⇒ exactly ONE listAppsByIds, carrying only the ids whose rows lack app meta (absent or null)", async () => {
  const byIdsCalls: string[][] = [];
  const api = {
    listConnections: async () => [
      { id: "c1", appId: "slack", app: { displayName: "Slack Inline" } },
      { id: "c2", appId: "github" },
      { id: "c3", appId: "notion", app: null },
    ],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listAppsByIds: async (ids: readonly string[]) => {
      byIdsCalls.push([...ids]);
      const table: Record<string, AppLike> = {
        github: { id: "github", displayName: "GitHub Catalog" },
        notion: { id: "notion", displayName: "Notion Catalog" },
      };
      return ids.map((id) => table[id]).filter((a): a is AppLike => Boolean(a));
    },
    listApps: async () => {
      throw new Error("listApps must not be called on the bounded path");
    },
  };
  const { container, root } = mount(api);
  await render({ container, root, api, props: {} });

  assert.equal(byIdsCalls.length, 1, "exactly one bounded lookup for the rows lacking app meta");
  assert.deepEqual([...byIdsCalls[0]].sort(), ["github", "notion"]);
  assert.deepEqual(readConnectedAppIds(container).sort(), ["github", "notion", "slack"]);
  assert.deepEqual(readItemNames(container).sort(), [
    "GitHub Catalog",
    "Notion Catalog",
    "Slack Inline",
  ]);
  await act(async () => root.unmount());
});

test("T1.1.3 I3 — appsFilter applies to inline-resolved apps exactly as to looked-up ones", async () => {
  let byIdsCalls = 0;
  const api = {
    listConnections: async () => [
      { id: "c1", appId: "slack", app: { displayName: "Slack Inline" } },
      { id: "c2", appId: "github", app: { displayName: "GitHub Inline" } },
    ],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listAppsByIds: async () => {
      byIdsCalls += 1;
      return [];
    },
  };
  const { container, root } = mount(api);
  await render({
    container,
    root,
    api,
    props: { appsFilter: (a: { id: string }) => a.id === "github" },
  });

  assert.equal(byIdsCalls, 0);
  assert.deepEqual(readConnectedAppIds(container), ["github"]);
  await act(async () => root.unmount());
});

test("T1.1.3 I4 — dark theme renders the inline iconSvgDark", async () => {
  const api = {
    listConnections: async () => [
      {
        id: "c1",
        appId: "slack",
        app: {
          displayName: "Slack Inline",
          iconSvg: "data:image/svg+xml;base64,TElHSFQ=",
          iconSvgDark: "data:image/svg+xml;base64,REFSSw==",
        },
      },
    ],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listAppsByIds: async () => {
      throw new Error("listAppsByIds must not be called when every row carries app meta");
    },
  };
  const { container, root } = mount(api);
  await render({ container, root, api, props: { theme: "dark" } });

  assert.deepEqual(readItemIconSrcs(container), ["data:image/svg+xml;base64,REFSSw=="]);
  await act(async () => root.unmount());
});

test("T-5 — mixed inline-seeded case: no Load more while the first batch is in flight; a forced loadMoreApps never sends a second lookup", async () => {
  const { useReadyToUse } = await import("../StepBuilderModal.tsx");
  const byIdsCalls: string[][] = [];
  let release: (apps: AppLike[]) => void = () => {};
  const conns = [
    { id: "c0", appId: "inline", app: { displayName: "Inline" } },
    ...Array.from({ length: 15 }, (_, i) => ({ id: `c${i + 1}`, appId: `app${i + 1}` })),
  ];
  const api = {
    listConnections: async () => conns,
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listAppsByIds: (ids: readonly string[]) => {
      byIdsCalls.push([...ids]);
      return new Promise<AppLike[]>((r) => {
        release = r;
      });
    },
  };
  let latest: ReturnType<typeof useReadyToUse> | undefined;
  const Probe = () => {
    latest = useReadyToUse([]);
    return null;
  };
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, { api, children: React.createElement(Probe) } as never),
    );
  });
  await flush();

  assert.equal(byIdsCalls.length, 1, "first batch started");
  assert.equal(latest?.moreApps, false, "no Load more while the batch is pending");
  assert.notEqual(latest?.state, "empty");
  await act(async () => {
    latest?.loadMoreApps();
    latest?.loadMoreApps();
  });
  assert.equal(byIdsCalls.length, 1, "forced loadMoreApps sends no duplicate lookup");

  await act(async () => {
    release(byIdsCalls[0].map((id) => ({ id, displayName: id })));
  });
  await flush();
  assert.equal(latest?.moreApps, true, "3 ids remain after the first 12");
  await act(async () => {
    latest?.loadMoreApps();
  });
  assert.equal(byIdsCalls.length, 2);
  assert.equal(byIdsCalls[1].length, 3);
  assert.equal(latest?.moreApps, false, "second batch in flight ⇒ no Load more");
  await act(async () => {
    release(byIdsCalls[1].map((id) => ({ id, displayName: id })));
  });
  await flush();
  assert.equal(latest?.moreApps, false, "nothing left");
  await act(async () => root.unmount());
});

test("T-5 — non-inline first batch pending ⇒ state is loading, never empty", async () => {
  const { useReadyToUse } = await import("../StepBuilderModal.tsx");
  const api = {
    listConnections: async () => [{ id: "c1", appId: "a" }],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listAppsByIds: () => new Promise<AppLike[]>(() => {}),
  };
  let latest: ReturnType<typeof useReadyToUse> | undefined;
  const Probe = () => {
    latest = useReadyToUse([]);
    return null;
  };
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, { api, children: React.createElement(Probe) } as never),
    );
  });
  await flush();
  assert.equal(latest?.state, "loading");
  assert.equal(latest?.moreApps, false);
  await act(async () => root.unmount());
});

test("bounded: appsIds excludes connected apps outside the provider id set", async () => {
  const api = {
    listConnections: async () => [
      { id: "c1", appId: "slack" },
      { id: "c2", appId: "openai" },
    ],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listAppsByIds: async (ids: readonly string[]) =>
      ids.map((id) => ({ id, displayName: id.toUpperCase() })),
  };
  const { container, root } = mount(api);
  await render({ container, root, api, props: { appsIds: ["openai"] } });
  assert.deepEqual(readConnectedAppIds(container), ["openai"]);
  await act(async () => root.unmount());
});

test("AI tab: fetch carries ids + paged, 70-app mock, footer equals card count", async () => {
  const catalog = Array.from({ length: 70 }, (_, i) => ({
    id: `app-${i}`,
    displayName: `App ${i}`,
    categories: i < 9 ? [] : ["ai"], // providers carry no "ai" category: client filter must not hide them
  }));
  const wanted = catalog.slice(0, 9).map((a) => a.id);
  const calls: Array<Record<string, unknown>> = [];
  const api = {
    listConnections: async () => [],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    listAppsByIds: async () => [],
    listAppsPage: (o?: { ids?: string[]; category?: string }) => {
      calls.push((o ?? {}) as Record<string, unknown>);
      const apps = o?.ids ? catalog.filter((a) => o.ids?.includes(a.id)) : catalog;
      return Promise.resolve({ apps, total: apps.length });
    },
  };
  const { container, root } = mount(api);
  await render({ container, root, api, props: { appsIds: wanted } });
  const aiTab = Array.from(container.querySelectorAll(".w6w-stepbuilder-tab")).find(
    (el) => (el.textContent || "").trim() === "AI",
  ) as HTMLElement;
  assert.ok(aiTab);
  await act(async () => aiTab.click());
  await flush();
  const aiCall = calls.find((c) => Array.isArray(c.ids) && c.ids.length === wanted.length);
  assert.ok(aiCall, "AI tab fetched with the provider ids");
  assert.equal(aiCall.category, undefined, "category is not sent with ids (providers may lack it)");
  assert.deepEqual(aiCall.ids, wanted);
  const cards = container.querySelectorAll(".w6w-apppicker-card-id").length;
  assert.equal(cards, 9);
  assert.match(container.textContent ?? "", /9 of 9/);
  await act(async () => root.unmount());
});
