// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/ConnectionList.test.ts
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
// AppIcon reads the colour scheme through matchMedia, which jsdom lacks.
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
const { ConnectionList } = await import("../ConnectionList.tsx");

const stored = {
  id: "c1",
  appId: "acme",
  authKey: "apiKey",
  displayName: "Prod",
  state: "connected",
};
// Detection is the flag, not the id: an unprefixed builtIn and a prefixed stored row.
const builtIn = {
  id: "plain-built-in",
  appId: "acme",
  authKey: "zero",
  state: "connected",
  builtIn: true,
};
const prefixedStored = {
  id: "zerocred:acme",
  appId: "acme",
  authKey: "apiKey",
  state: "connected",
};
const invalid = { id: "c2", appId: "acme", authKey: "apiKey", state: "broken", lastTestOk: false };

function mount(props: Record<string, unknown>) {
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  act(() =>
    root.render(React.createElement(ConnectionList, { connections: [], ...props } as never)),
  );
  return container;
}

const tid = (c: Element, id: string) => c.querySelector(`[data-testid="${id}"]`);
const li = (c: Element, n: number) => c.querySelectorAll("tbody tr")[n];
const noop = () => {};

test("builtIn row: no anchor, no open, no Edit, no Delete (flag, not id prefix)", () => {
  const opened: string[] = [];
  const c = mount({
    connections: [builtIn],
    getHref: (id: string) => `#/${id}`,
    onOpen: (id: string) => opened.push(id),
    onEdit: noop,
    onDelete: noop,
  });
  const row = li(c, 0);
  assert.equal(row.querySelectorAll("a").length, 0, "builtIn-no-anchor");
  assert.equal(row.querySelectorAll("button").length, 0, "builtIn has no button at all");
  assert.equal(row.querySelectorAll("a").length, 0);
  assert.equal(tid(c, "connection-edit-plain-built-in"), null, "builtIn-no-Edit");
  assert.equal(tid(c, "connection-delete-plain-built-in"), null, "builtIn-no-Delete");
  act(() => {
    row.querySelector("td")?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(opened, []);
});

test("a stored row whose id starts zerocred: still offers anchor, open, Edit and Delete", () => {
  const opened: string[] = [];
  const c = mount({
    connections: [prefixedStored],
    getHref: (id: string) => `#/${id}`,
    onOpen: (id: string) => opened.push(id),
    onEdit: noop,
    onDelete: noop,
  });
  const row = li(c, 0);
  const a = row.querySelector("a");
  assert.ok(a, "anchor");
  assert.equal(a.getAttribute("href"), "#/zerocred:acme");
  act(() => {
    a.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.deepEqual(opened, ["zerocred:acme"]);
  assert.ok(tid(c, "connection-edit-zerocred:acme"));
  assert.ok(tid(c, "connection-delete-zerocred:acme"));
});

test("Edit and Delete are siblings of the row anchor inside the row, never inside it", () => {
  const c = mount({
    connections: [stored],
    getHref: (id: string) => `#/${id}`,
    onEdit: noop,
    onDelete: noop,
  });
  const row = li(c, 0);
  const a = row.querySelector("a") as Element;
  const edit = tid(c, "connection-edit-c1") as Element;
  const del = tid(c, "connection-delete-c1") as Element;
  assert.ok(row.contains(edit) && row.contains(del));
  assert.ok(!a.contains(edit) && !a.contains(del), "buttons inside the anchor");
  assert.equal(a.querySelectorAll("button").length, 0);
});

test("Edit and Delete render only with their callbacks; callbacks get the row; busy disables Delete", () => {
  const edited: string[] = [];
  const deleted: string[] = [];
  const opened: string[] = [];
  const opened2: string[] = [];
  const deleted2: string[] = [];
  const bare = mount({ connections: [stored] });
  assert.equal(tid(bare, "connection-edit-c1"), null);
  assert.equal(tid(bare, "connection-delete-c1"), null);
  const c = mount({
    connections: [stored],
    busy: true,
    onOpen: (id: string) => opened.push(id),
    onEdit: (x: { id: string }) => edited.push(x.id),
    onDelete: (x: { id: string }) => deleted.push(x.id),
  });
  assert.equal((tid(c, "connection-delete-c1") as HTMLButtonElement).disabled, true);
  assert.equal((tid(c, "connection-edit-c1") as HTMLButtonElement).disabled, false);
  act(() => {
    tid(c, "connection-edit-c1")?.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true }),
    );
  });
  assert.deepEqual(edited, ["c1"]);
  assert.deepEqual(deleted, []);
  assert.deepEqual(opened, [], "Edit must not trigger onOpen");
  const c2 = mount({
    connections: [stored],
    getHref: (id: string) => `#/${id}`,
    onOpen: (id: string) => opened2.push(id),
    onDelete: (x: { id: string }) => deleted2.push(x.id),
  });
  act(() => {
    tid(c2, "connection-delete-c1")?.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true }),
    );
  });
  assert.deepEqual(deleted2, ["c1"]);
  assert.deepEqual(opened2, [], "Delete must not trigger onOpen");
  assert.equal(c2.querySelector("td:last-child a"), null, "actions column is link:false");
});

test("row content: name, auth key, state, and an invalid tag only after a failed test", () => {
  const c = mount({ connections: [stored, invalid] });
  const first = li(c, 0);
  assert.equal(first.querySelector("strong")?.textContent, "Prod");
  assert.ok((first.textContent ?? "").includes("apiKey"));
  assert.ok((first.textContent ?? "").includes("connected"));
  assert.ok(!(first.textContent ?? "").includes("invalid"));
  assert.ok((li(c, 1).textContent ?? "").includes("invalid"));
  assert.equal(li(c, 1).querySelector("strong")?.textContent, "c2", "name falls back to id");
});

test("states: loading, error and empty (default and slot)", () => {
  assert.ok((mount({ loading: true }).textContent ?? "").includes("Loading"));
  assert.ok((mount({ error: "boom" }).textContent ?? "").includes("boom"));
  assert.ok((mount({}).textContent ?? "").includes("No connections yet."));
  const c = mount({ slots: { empty: "Nothing here", header: "H", actions: "A" } });
  assert.ok((c.textContent ?? "").includes("Nothing here"));
  assert.ok((c.textContent ?? "").includes("H") && (c.textContent ?? "").includes("A"));
});

test("no h1, and every static class token is w6w- prefixed", () => {
  const c = mount({ connections: [stored, builtIn, invalid], onEdit: noop, onDelete: noop });
  assert.equal(c.querySelectorAll("h1").length, 0);
  for (const el of c.querySelectorAll("[class]")) {
    for (const t of el.classList) assert.ok(t.startsWith("w6w-") || t === "active", `class ${t}`);
  }
});
