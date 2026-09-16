// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/AppPicker.paged.test.ts  (Node 24)
//
// T2.1.1 C2 — `AppPicker`'s bounded PAGED loading mode (A2): mounts the real
// component against a fake `W6WApi.listAppsPage`, asserting the outgoing
// request shape, search debounce, load-more append/terminal/dedupe, the
// repeated-cursor guard, cancellation on query change/unmount, and a
// malformed-envelope safe error state — everything jsdom CAN observe about
// this component (no real layout/geometry; that is `test/picker-paging`'s
// job in real Chromium). jsdom bootstrap mirrors
// `StepBuilderModal.connection-only.test.ts`'s rig verbatim.
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { AppPicker } = await import("../AppPicker.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type AppSummaryLike = { id: string; displayName: string };
type ListAppsPageOptionsLike = {
  q?: string;
  category?: string;
  cursor?: string;
  limit?: number;
  compact?: boolean;
  signal?: AbortSignal;
};

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function waitDebounce() {
  // Longer than AppPicker's internal 300ms search debounce.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 350));
  });
}

/** A `listAppsPage` fake that records every call and resolves from a fixed lookup table keyed by `q|category|cursor`. */
function makeApi(
  table: Record<string, { apps: AppSummaryLike[]; nextCursor?: string } | "malformed">,
) {
  const calls: ListAppsPageOptionsLike[] = [];
  return {
    api: {
      listApps: async () => {
        throw new Error("listApps must not be called while listAppsPage is in play");
      },
      listAppsPage: (options?: ListAppsPageOptionsLike) => {
        calls.push(options ?? {});
        const key = `${options?.q ?? ""}|${options?.category ?? ""}|${options?.cursor ?? ""}`;
        const entry = table[key];
        if (options?.signal?.aborted) {
          const e = new Error("The operation was aborted.");
          e.name = "AbortError";
          return Promise.reject(e);
        }
        if (entry === "malformed") return Promise.resolve([]) as unknown as Promise<unknown>;
        return Promise.resolve(entry ?? { apps: [] });
      },
    },
    calls,
  };
}

function mount(el: React.ReactElement) {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  return { container: container as HTMLElement, root, el };
}

const cardIds = (container: Element) =>
  Array.from(container.querySelectorAll(".w6w-apppicker-card-id")).map((n) =>
    (n.textContent || "").trim(),
  );

test("mount fetches exactly ONE page, bounded, compact — no eager catalog drain", async () => {
  const { api, calls } = makeApi({
    "||": { apps: [{ id: "a", displayName: "A" }] },
  });
  const { container, root } = mount(React.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(AppPicker, {
          onSelectApp: () => {},
          pageLimit: 2,
        } as never),
      ),
    );
  });
  await flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].limit, 2);
  assert.equal(calls[0].compact, true);
  assert.equal(calls[0].cursor, undefined);
  assert.deepEqual(cardIds(container), ["a"]);
  await act(async () => root.unmount());
});

test("a debounced search sends the real q and finds a match beyond the initial (empty-query) page", async () => {
  const { api, calls } = makeApi({
    "||": { apps: [{ id: "a", displayName: "A" }] },
    "sendgrid||": { apps: [{ id: "sendgrid", displayName: "SendGrid" }] },
  });
  const { container, root } = mount(React.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(AppPicker, { onSelectApp: () => {}, pageLimit: 2 } as never),
      ),
    );
  });
  await flush();
  assert.deepEqual(cardIds(container), ["a"]);

  const input = container.querySelector(".w6w-stepbuilder-search") as HTMLInputElement;
  assert.ok(input);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "sendgrid");
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await waitDebounce();

  assert.deepEqual(cardIds(container), ["sendgrid"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].q, "sendgrid");
  await act(async () => root.unmount());
});

test("AI tab's category param reaches the server, not a client-side filter", async () => {
  const { api, calls } = makeApi({
    "|ai|": { apps: [{ id: "ai-app", displayName: "AI App" }] },
  });
  const { root } = mount(React.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(AppPicker, {
          onSelectApp: () => {},
          category: "ai",
          pageLimit: 2,
        } as never),
      ),
    );
  });
  await flush();
  assert.equal(calls[0].category, "ai");
  await act(async () => root.unmount());
});

test("load more appends and dedupes, then stops on a terminal cursor", async () => {
  const { api, calls } = makeApi({
    "||": { apps: [{ id: "a", displayName: "A" }], nextCursor: "c2" },
    "||c2": {
      apps: [
        { id: "a", displayName: "A" },
        { id: "b", displayName: "B" },
      ],
    },
  });
  const { container, root } = mount(React.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(AppPicker, { onSelectApp: () => {}, pageLimit: 2 } as never),
      ),
    );
  });
  await flush();
  assert.deepEqual(cardIds(container), ["a"]);

  const loadMore = () =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent || "").trim() === "Load more",
    ) as HTMLElement | undefined;
  assert.ok(loadMore(), "Load more button must be present while hasMore is true");

  await act(async () => {
    loadMore()?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });

  // "a" duplicated across pages is deduped; terminal page (no nextCursor)
  // removes the "Load more" affordance.
  assert.deepEqual(cardIds(container), ["a", "b"]);
  assert.equal(loadMore(), undefined);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].cursor, "c2");
  await act(async () => root.unmount());
});

test("a repeated/non-advancing cursor from the server does not loop or duplicate a request", async () => {
  const { api, calls } = makeApi({
    "||": { apps: [{ id: "a", displayName: "A" }], nextCursor: "c1" },
    "||c1": { apps: [{ id: "b", displayName: "B" }], nextCursor: "c1" },
  });
  const { container, root } = mount(React.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(AppPicker, { onSelectApp: () => {}, pageLimit: 2 } as never),
      ),
    );
  });
  await flush();
  const loadMore = () =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent || "").trim() === "Load more",
    ) as HTMLElement | undefined;
  await act(async () => {
    loadMore()?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.deepEqual(cardIds(container), ["a", "b"]);
  // The server echoed the SAME cursor back — treated as terminal, so no
  // "Load more" button remains to trigger a third (identical) request.
  assert.equal(loadMore(), undefined);
  assert.equal(calls.length, 2);
  await act(async () => root.unmount());
});

test("a malformed FIRST page is a retryable safe error, never a permanent capability fallback — retry succeeds", async () => {
  // T2.1.1 ROUND 2: capability is `typeof listAppsPage === "function"`
  // ALONE — a wrong-shape response, first page or not, is always a visible,
  // retryable error (A6), never silent permanent reversion to the unbounded
  // `listApps()` (a host genuinely lacking the method must answer
  // `undefined` for it — see the fixed D-17 fixtures).
  let pageCalls = 0;
  const api = {
    listApps: async () => {
      throw new Error("listApps must never be called — listAppsPage exists and must be retried");
    },
    listAppsPage: () => {
      pageCalls += 1;
      if (pageCalls === 1)
        return Promise.resolve([]) as unknown as Promise<{ apps: AppSummaryLike[] }>;
      return Promise.resolve({ apps: [{ id: "recovered", displayName: "Recovered" }] });
    },
  };
  const { container, root } = mount(React.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(AppPicker, { onSelectApp: () => {}, pageLimit: 2 } as never),
      ),
    );
  });
  await flush();

  assert.equal(pageCalls, 1);
  assert.deepEqual(cardIds(container), []);
  assert.ok(
    container.querySelector(".w6w-error"),
    "a malformed first page must show a visible, safe error state",
  );
  const retry = () =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent || "").trim() === "Retry",
    ) as HTMLElement | undefined;
  assert.ok(retry(), "a Retry action must be offered, not a silent fallback");

  await act(async () => {
    retry()?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });

  assert.equal(pageCalls, 2);
  assert.deepEqual(cardIds(container), ["recovered"]);
  assert.equal(container.querySelector(".w6w-error"), null);
  await act(async () => root.unmount());
});

test("Apps→AI tab switch (the SAME mounted AppPicker instance) recovers cleanly from a malformed Apps response", async () => {
  // StepBuilderModal renders Apps and AI into the same <AppPicker> JSX slot
  // (same React instance across a tab switch) — a malformed response on one
  // tab must never taint the other, since capability is checked once, not
  // re-derived from whichever tab happened to respond first.
  let listAppsCalls = 0;
  let listTriggerAppsCalls = 0;
  const api = {
    listApps: async () => {
      listAppsCalls += 1;
      return [];
    },
    listTriggerApps: async () => {
      listTriggerAppsCalls += 1;
      return [];
    },
    listAppsPage: (options?: ListAppsPageOptionsLike) => {
      if (options?.category === "ai") {
        return Promise.resolve({ apps: [{ id: "ai-app", displayName: "AI App" }] });
      }
      return Promise.resolve([]) as unknown as Promise<{ apps: AppSummaryLike[] }>;
    },
  };
  const { container, root } = mount(React.createElement("div"));
  const renderWithCategory = (category: string | undefined) =>
    act(async () => {
      root.render(
        React.createElement(
          W6WUIProvider,
          { api, children: null } as never,
          React.createElement(AppPicker, {
            onSelectApp: () => {},
            pageLimit: 2,
            category,
          } as never),
        ),
      );
    });

  await renderWithCategory(undefined); // Apps tab: malformed response
  await flush();
  assert.ok(container.querySelector(".w6w-error"), "Apps tab shows the malformed-page error");

  await renderWithCategory("ai"); // AI tab, same mounted instance
  await flush();

  assert.deepEqual(cardIds(container), ["ai-app"], "the AI tab must recover on the same instance");
  assert.equal(container.querySelector(".w6w-error"), null);
  assert.equal(listAppsCalls, 0, "the legacy full-catalog fetch must never fire");
  assert.equal(listTriggerAppsCalls, 0, "the legacy trigger-catalog fetch must never fire");
  await act(async () => root.unmount());
});

test("a malformed page on LOAD-MORE (host already proved it works) shows a safe, retryable inline error, preserving what was already shown", async () => {
  const { api, calls } = makeApi({
    "||": { apps: [{ id: "a", displayName: "A" }], nextCursor: "c2" },
    "||c2": "malformed",
  });
  const { container, root } = mount(React.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(AppPicker, { onSelectApp: () => {}, pageLimit: 2 } as never),
      ),
    );
  });
  await flush();
  const loadMore = () =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent || "").trim() === "Load more",
    ) as HTMLElement | undefined;
  await act(async () => {
    loadMore()?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });

  assert.deepEqual(
    cardIds(container),
    ["a"],
    "the already-loaded app must survive the failed load-more",
  );
  assert.ok(
    container.querySelector(".w6w-error"),
    "the malformed load-more must render a visible, inline error",
  );
  assert.equal(calls.length, 2);
  await act(async () => root.unmount());
});

test("changing the search query aborts the previous in-flight request's signal", async () => {
  // Mount resolves immediately (so the search box actually renders); the
  // SECOND request (triggered by typing "b") is left hanging so its signal
  // can be inspected once a THIRD request (typing "bc") supersedes it.
  let callCount = 0;
  let secondSignal: AbortSignal | undefined;
  const api = {
    listApps: async () => [],
    listAppsPage: (options?: ListAppsPageOptionsLike) => {
      callCount += 1;
      if (callCount === 1) return Promise.resolve({ apps: [{ id: "a", displayName: "A" }] });
      if (callCount === 2) {
        secondSignal = options?.signal;
        return new Promise<{ apps: AppSummaryLike[] }>(() => {}); // never resolves
      }
      return Promise.resolve({ apps: [{ id: "bc", displayName: "BC" }] });
    },
  };
  const { container, root } = mount(React.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(AppPicker, { onSelectApp: () => {}, pageLimit: 2 } as never),
      ),
    );
  });
  await flush();
  const setInput = async (value: string) => {
    const input = container.querySelector(".w6w-stepbuilder-search") as HTMLInputElement;
    assert.ok(input, "search input must be rendered");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, value);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  };

  await setInput("b");
  await waitDebounce();
  assert.equal(callCount, 2);
  assert.equal(secondSignal?.aborted, false);

  await setInput("bc");
  await waitDebounce();

  assert.equal(callCount, 3);
  assert.equal(
    secondSignal?.aborted,
    true,
    "the SECOND (now-obsolete) request's signal must be aborted",
  );
  assert.deepEqual(cardIds(container), ["bc"]);
  await act(async () => root.unmount());
});

test("unmounting the picker aborts whatever request was still pending", async () => {
  let signal: AbortSignal | undefined;
  const api = {
    listApps: async () => [],
    listAppsPage: (options?: ListAppsPageOptionsLike) => {
      signal = options?.signal;
      return new Promise<{ apps: AppSummaryLike[] }>(() => {});
    },
  };
  const { root } = mount(React.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(AppPicker, { onSelectApp: () => {}, pageLimit: 2 } as never),
      ),
    );
  });
  await flush();
  assert.equal(signal?.aborted, false);
  await act(async () => root.unmount());
  assert.equal(signal?.aborted, true);
});

test("a client-side filter narrowing a bounded page to nothing does NOT auto-drain the next page", async () => {
  let calls = 0;
  const api = {
    listApps: async () => [],
    listAppsPage: () => {
      calls += 1;
      // Every returned app is filtered out client-side below.
      return Promise.resolve({
        apps: [{ id: "rejected", displayName: "Rejected" }],
        nextCursor: "c2",
      });
    },
  };
  const { container, root } = mount(React.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(AppPicker, {
          onSelectApp: () => {},
          pageLimit: 2,
          filter: () => false,
        } as never),
      ),
    );
  });
  await flush();

  // Exactly one request was made — the empty-after-filter result did not
  // trigger an automatic second fetch — and "Load more" is still reachable.
  assert.equal(calls, 1);
  const loadMore = Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent || "").trim() === "Load more",
  );
  assert.ok(loadMore, "Load more must remain reachable even though the current page is empty");
  await act(async () => root.unmount());
});

test("legacy provider (listApps only, no listAppsPage) keeps the unchanged eager full-list path", async () => {
  let legacyCalls = 0;
  const api = {
    listApps: async () => {
      legacyCalls += 1;
      return [{ id: "legacy", displayName: "Legacy" }];
    },
  };
  const { container, root } = mount(React.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api, children: null } as never,
        React.createElement(AppPicker, { onSelectApp: () => {} } as never),
      ),
    );
  });
  await flush();
  assert.equal(legacyCalls, 1);
  assert.deepEqual(cardIds(container), ["legacy"]);
  // No "Load more" affordance exists on the legacy path — it is a whole-list
  // fetch, not a bounded page.
  assert.equal(
    Array.from(container.querySelectorAll("button")).some(
      (b) => (b.textContent || "").trim() === "Load more",
    ),
    false,
  );
  await act(async () => root.unmount());
});
