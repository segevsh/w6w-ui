// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/DataEntryList.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.MutationObserver = dom.window.MutationObserver;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
(dom.window as unknown as Record<string, unknown>).matchMedia = (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");

const { DataEntryList } = await import("../DataEntryList.tsx");

function mount(props: Record<string, unknown>) {
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  const noop = () => {};
  act(() =>
    root.render(
      React.createElement(DataEntryList, {
        rows: [],
        onOpen: noop,
        onDelete: noop,
        onSearch: noop,
        onNew: noop,
        onLoadMore: noop,
        ...props,
      } as never),
    ),
  );
  return container;
}

const tid = (c: Element, id: string) => c.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
function type(el: HTMLInputElement, text: string) {
  act(() => {
    const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")
      ?.set as (v: string) => void;
    set.call(el, text);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

const rows = [
  { key: "alpha", version: 2, preview: "first" },
  { key: "beta", version: 5, preview: "second" },
];

test("rows render key, v<n>, preview; key opens and Delete deletes with that key", () => {
  const opened: string[] = [];
  const deleted: string[] = [];
  const c = mount({
    rows,
    onOpen: (k: string) => opened.push(k),
    onDelete: (k: string) => deleted.push(k),
  });
  const keys = c.querySelectorAll('[data-testid="entry-key"]');
  assert.equal(keys.length, 2);
  assert.equal(c.querySelectorAll('[data-testid="entry-version"]')[1].textContent, "v5");
  assert.match(c.textContent ?? "", /second/);
  click(keys[1]);
  assert.deepEqual(opened, ["beta"], "open fires with key");
  const dels = c.querySelectorAll('button[aria-label="Delete entry"]');
  assert.equal(dels.length, 2);
  click(dels[0]);
  assert.deepEqual(deleted, ["alpha"], "delete fires with key");
});

test("search fires only on submit, with the text; no search per keystroke", () => {
  const searched: string[] = [];
  const c = mount({ rows, onSearch: (t: string) => searched.push(t) });
  type(tid(c, "entry-prefix") as HTMLInputElement, "al");
  type(tid(c, "entry-prefix") as HTMLInputElement, "alp");
  assert.deepEqual(searched, [], "no search per keystroke");
  act(() => {
    tid(c, "entry-search").dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  assert.deepEqual(searched, ["alp"]);
});

test("New entry fires onNew; Load more only when hasMore and fires onLoadMore", () => {
  let news = 0;
  let more = 0;
  const c = mount({ rows, onNew: () => news++, onLoadMore: () => more++ });
  assert.equal(tid(c, "entries-load-more"), null, "no load-more without hasMore");
  click(tid(c, "entry-new"));
  assert.equal(news, 1);
  const c2 = mount({ rows, hasMore: true, onLoadMore: () => more++ });
  click(tid(c2, "entries-load-more"));
  assert.equal(more, 1);
});

test("no rows: loading text, else the empty text", () => {
  assert.match(mount({ loading: true }).textContent ?? "", /Loading/);
  assert.match(mount({ empty: "Nothing here" }).textContent ?? "", /Nothing here/);
});

test("an empty <p> from the caller is not nested in another <p> (invalid HTML, hydration error)", () => {
  const c = mount({ empty: React.createElement("p", null, "Nothing here") });
  assert.match(c.textContent ?? "", /Nothing here/);
  assert.equal(c.querySelector("p p"), null);
});
