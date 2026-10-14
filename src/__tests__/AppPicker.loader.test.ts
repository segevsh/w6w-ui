// Run (from packages/ui): NODE_OPTIONS=--experimental-strip-types node --import ./src/test-jsx-loader.mjs --test src/__tests__/AppPicker.loader.test.ts
//
// T3.1.1 — `AppPicker`'s optional `loadPage` loader (plan W4): precedence over
// `api.listAppsPage`, the exact request shape, reuse of the paged machinery
// (debounce, stale guard, Load more, Retry, abort) and its state copy. jsdom
// rig mirrors `AppPicker.paged.test.ts`.
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
// (StepBuilderModal's wrapper, mounted by the no-listApps StepBuilderModal
// case below) calls `showModal()` in a mount effect.
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
const { AppPicker } = await import("../AppPicker.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type A = { id: string; displayName: string };
type Page = { apps: A[]; nextCursor?: string };
type Req = { q?: string; cursor?: string; limit: number; signal: AbortSignal };
type Loader = (o: Req) => Promise<Page>;

const sleep = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const flush = () => sleep(0);
const debounce = () => sleep(350);

function render(
  loadPage: Loader | undefined,
  props: Record<string, unknown> = {},
  api: Record<string, unknown> = { listApps: async () => [] },
) {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  const tree = (lp: Loader | undefined, p: Record<string, unknown>) =>
    React.createElement(
      W6WUIProvider,
      { api, children: null } as never,
      React.createElement(AppPicker, { onSelectApp: () => {}, loadPage: lp, ...p } as never),
    );
  return {
    container: container as HTMLElement,
    root,
    mount: () => act(async () => root.render(tree(loadPage, props))),
    rerender: (lp: Loader) => act(async () => root.render(tree(lp, props))),
  };
}

const cards = (c: Element) =>
  Array.from(c.querySelectorAll(".w6w-apppicker-card-id")).map((n) => (n.textContent || "").trim());
const btn = (c: Element, label: string) =>
  Array.from(c.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === label) as
    | HTMLButtonElement
    | undefined;
const click = (el: HTMLElement | undefined) =>
  act(async () => {
    el?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
const type = (c: Element, value: string) =>
  act(async () => {
    const input = c.querySelector("input") as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )?.set;
    set?.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
const a = (id: string): A => ({ id, displayName: id.toUpperCase() });
const text = (c: Element) => c.textContent || "";

test("first request has EXACTLY q,cursor,limit,signal; provider without listAppsPage", async () => {
  const reqs: Req[] = [];
  const h = render((o) => {
    reqs.push(o);
    return Promise.resolve({ apps: [a("x")] });
  });
  await h.mount();
  await flush();
  assert.equal(reqs.length, 1);
  assert.deepEqual(Object.keys(reqs[0] as object).sort(), ["cursor", "limit", "q", "signal"]);
  assert.equal(reqs[0]?.q, undefined);
  assert.equal(reqs[0]?.cursor, undefined);
  assert.equal(reqs[0]?.limit, 60);
  assert.ok(reqs[0]?.signal instanceof AbortSignal);
  assert.deepEqual(cards(h.container), ["x"]);
  await act(async () => h.root.unmount());
});

test("loadPage wins over api.listAppsPage (called 0 times); category/compact never sent", async () => {
  let providerCalls = 0;
  const reqs: Req[] = [];
  const h = render(
    (o) => {
      reqs.push(o);
      return Promise.resolve({ apps: [a("x")] });
    },
    { category: "ai" },
    {
      listApps: async () => [],
      listAppsPage: () => {
        providerCalls++;
        return Promise.resolve({ apps: [] });
      },
    },
  );
  await h.mount();
  await flush();
  assert.equal(providerCalls, 0);
  assert.equal(reqs.length, 1);
  assert.deepEqual(Object.keys(reqs[0] as object).sort(), ["cursor", "limit", "q", "signal"]);
  await act(async () => h.root.unmount());
});

test("supplied apps + loadPage => loadPage called 0 times", async () => {
  let n = 0;
  const h = render(
    () => {
      n++;
      return Promise.resolve({ apps: [] });
    },
    { apps: [a("p")] },
  );
  await h.mount();
  await debounce();
  assert.equal(n, 0);
  assert.deepEqual(cards(h.container), ["p"]);
  await act(async () => h.root.unmount());
});

test("re-rendering with a new loadPage identity issues no request", async () => {
  let n = 0;
  const mk = (): Loader => () => {
    n++;
    return Promise.resolve({ apps: [a("x")] });
  };
  const h = render(mk());
  await h.mount();
  await flush();
  await h.rerender(mk());
  await h.rerender(mk());
  await debounce();
  assert.equal(n, 1);
  await act(async () => h.root.unmount());
});

test("typing '  eve ' sends q:'eve' once after the debounce; clearing REPLACES the list", async () => {
  const reqs: Req[] = [];
  const loader: Loader = (o) => {
    reqs.push(o);
    return Promise.resolve(
      o.q === "eve" ? { apps: [a("eve1")] } : { apps: [a("all1"), a("all2")], nextCursor: "n" },
    );
  };
  const h = render(loader);
  await h.mount();
  await flush();
  await type(h.container, "  e");
  await type(h.container, "  ev");
  await type(h.container, "  eve ");
  assert.equal(reqs.length, 1, "no request per keystroke");
  await debounce();
  assert.equal(reqs.length, 2);
  assert.equal(reqs[1]?.q, "eve");
  assert.deepEqual(cards(h.container), ["eve1"]);
  await type(h.container, "");
  await debounce();
  assert.equal(reqs.length, 3);
  assert.equal(reqs[2]?.q, undefined);
  assert.equal(reqs[2]?.cursor, undefined);
  assert.deepEqual(cards(h.container), ["all1", "all2"]);
  await act(async () => h.root.unmount());
});

test("an older query's response resolving after a newer one never renders", async () => {
  const pending: Record<string, (p: Page) => void> = {};
  const loader: Loader = (o) =>
    o.q === undefined
      ? Promise.resolve({ apps: [a("base")] })
      : new Promise((r) => {
          pending[o.q as string] = r;
        });
  const h = render(loader);
  await h.mount();
  await flush();
  await type(h.container, "old");
  await debounce();
  await type(h.container, "new");
  await debounce();
  await act(async () => pending.new?.({ apps: [a("newer")] }));
  await act(async () => pending.old?.({ apps: [a("older")] }));
  await flush();
  assert.deepEqual(cards(h.container), ["newer"]);
  await act(async () => h.root.unmount());
});

test("two Load more clicks issue ONE request and append once; unmount aborts the in-flight signal", async () => {
  const reqs: Req[] = [];
  let release: ((p: Page) => void) | undefined;
  const loader: Loader = (o) => {
    reqs.push(o);
    if (!o.cursor) return Promise.resolve({ apps: [a("a")], nextCursor: "c2" });
    return new Promise((r) => {
      release = r;
    });
  };
  const h = render(loader);
  await h.mount();
  await flush();
  const lm = btn(h.container, "Load more");
  await click(lm);
  await click(lm);
  assert.equal(reqs.length, 2);
  assert.equal(reqs[1]?.cursor, "c2");
  await act(async () => release?.({ apps: [a("b")] }));
  await flush();
  assert.deepEqual(cards(h.container), ["a", "b"]);
  assert.equal(btn(h.container, "Load more"), undefined, "no Load more without nextCursor");

  // unmount aborts
  const sigs: AbortSignal[] = [];
  const h2 = render((o) => {
    sigs.push(o.signal);
    return new Promise(() => {});
  });
  await act(async () => h2.root.unmount());
  const h3 = render((o) => {
    sigs.push(o.signal);
    return new Promise(() => {});
  });
  await h3.mount();
  await flush();
  assert.equal(sigs[0]?.aborted, false);
  await act(async () => h3.root.unmount());
  assert.equal(sigs[0]?.aborted, true);
});

test("failed next page keeps the list; Retry resends the SAME cursor, pending shown, two clicks => ONE request", async () => {
  const reqs: Req[] = [];
  let release: ((p: Page) => void) | undefined;
  const loader: Loader = (o) => {
    reqs.push(o);
    if (!o.cursor) return Promise.resolve({ apps: [a("a")], nextCursor: "c2" });
    if (reqs.length === 2) return Promise.reject(new Error("net down"));
    return new Promise((r) => {
      release = r;
    });
  };
  const h = render(loader);
  await h.mount();
  await flush();
  await click(btn(h.container, "Load more"));
  assert.deepEqual(cards(h.container), ["a"]);
  const retry = btn(h.container, "Retry");
  assert.ok(retry);
  await click(retry);
  await click(retry);
  assert.equal(reqs.length, 3);
  assert.equal(reqs[2]?.cursor, "c2");
  assert.equal(btn(h.container, "Retry"), undefined);
  assert.ok(btn(h.container, "Loading more…")?.disabled);
  await act(async () => release?.({ apps: [a("b")] }));
  await flush();
  assert.deepEqual(cards(h.container), ["a", "b"]);
  await act(async () => h.root.unmount());
});

test("states: Loading apps…, initial failure => error + Retry (no empty text) then recovery", async () => {
  let n = 0;
  let release: ((p: Page) => void) | undefined;
  let fail: ((e: Error) => void) | undefined;
  const loader: Loader = () => {
    n++;
    return new Promise((r, rej) => {
      release = r;
      if (n === 1) fail = rej;
    });
  };
  const h = render(loader, { emptyMessage: "Nothing here" });
  await h.mount();
  assert.match(text(h.container), /Loading apps…/);
  await act(async () => fail?.(new Error("first failed")));
  await flush();
  assert.match(text(h.container), /first failed/);
  assert.ok(btn(h.container, "Retry"));
  assert.doesNotMatch(text(h.container), /Nothing here|No apps match/);
  await click(btn(h.container, "Retry"));
  assert.match(text(h.container), /Loading apps…/);
  assert.equal(btn(h.container, "Retry"), undefined);
  await act(async () => release?.({ apps: [a("ok")] }));
  assert.deepEqual(cards(h.container), ["ok"]);
  await act(async () => h.root.unmount());
});

test("empty copy only once exhausted: No apps match “eve”. / emptyMessage", async () => {
  const loader: Loader = (o) => Promise.resolve(o.q === "eve" ? { apps: [] } : { apps: [] });
  const h = render(loader, { emptyMessage: "Nothing here" });
  await h.mount();
  await flush();
  assert.match(text(h.container), /Nothing here/);
  await type(h.container, "eve");
  await debounce();
  assert.match(text(h.container), /No apps match “eve”\./);
  assert.doesNotMatch(text(h.container), /Nothing here/);
  await act(async () => h.root.unmount());

  // not exhausted (nextCursor present, nothing yet): neither empty text claims exhaustion
  const h2 = render(() => Promise.resolve({ apps: [], nextCursor: "more" }), {
    emptyMessage: "Nothing here",
  });
  await h2.mount();
  await flush();
  assert.doesNotMatch(text(h2.container), /Nothing here/);
  assert.ok(btn(h2.container, "Load more"));
  await act(async () => h2.root.unmount());
});

test("a synchronously throwing loadPage lands in error + Retry (first page), then recovers", async () => {
  let ok = false;
  const loader: Loader = () => {
    if (!ok) throw new Error("boom");
    return Promise.resolve({ apps: [a("ok")] });
  };
  const h = render(loader);
  await h.mount();
  await flush();
  assert.match(text(h.container), /boom/);
  assert.ok(btn(h.container, "Retry"));
  ok = true;
  await click(btn(h.container, "Retry"));
  await flush();
  assert.deepEqual(cards(h.container), ["ok"]);
  await act(async () => h.root.unmount());
});

test("a synchronously throwing loadPage on Load more keeps the list, shows Retry, recovers", async () => {
  let ok = false;
  const loader: Loader = (o) => {
    if (!o.cursor) return Promise.resolve({ apps: [a("a")], nextCursor: "c2" });
    if (!ok) throw new Error("boom2");
    return Promise.resolve({ apps: [a("b")] });
  };
  const h = render(loader);
  await h.mount();
  await flush();
  await click(btn(h.container, "Load more"));
  await flush();
  assert.deepEqual(cards(h.container), ["a"]);
  assert.ok(btn(h.container, "Retry"));
  ok = true;
  await click(btn(h.container, "Retry"));
  await flush();
  assert.deepEqual(cards(h.container), ["a", "b"]);
  await act(async () => h.root.unmount());
});
