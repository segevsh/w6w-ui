// Run (from ui): node --experimental-strip-types --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/DataStoreList.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.Node = dom.window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.MutationObserver = dom.window.MutationObserver;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { DataStoreList } = await import("../DataStoreList.tsx");

const base = { description: "", project: "p1", createdBy: "u1", createdAt: "2026-01-01T00:00:00Z" };
const kv = {
  ...base,
  id: "a",
  name: "flags",
  kind: "kv",
  schema: {},
  entryCount: 12,
  sizeBytes: 2048,
  updatedAt: "2026-10-01T09:30:00Z",
};
const tbl = {
  ...base,
  id: "b",
  name: "people",
  kind: "table",
  schema: {},
  entryCount: 3,
  sizeBytes: 10,
  updatedAt: "2026-10-02T09:30:00Z",
};

function mount(props: Record<string, unknown>) {
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  act(() => root.render(React.createElement(DataStoreList, { stores: [], ...props } as never)));
  return container;
}
const tid = (c: Element, id: string) => c.querySelector(`[data-testid="${id}"]`);
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
const noop = () => {};

test("rows show kind label, entry count and the formatSize output", () => {
  const c = mount({ stores: [kv, tbl], formatSize: (n: number) => `${n} bytes` });
  const rows = c.querySelectorAll("tbody tr");
  assert.equal(rows.length, 2);
  const cells = [...rows[0].querySelectorAll("td")].map((td) => td.textContent);
  assert.equal(cells[0], "flags");
  assert.equal(cells[1], "Key-value");
  assert.equal(cells[2], "12");
  assert.equal(cells[3], "2048 bytes");
  assert.equal(rows[1].querySelectorAll("td")[1].textContent, "Table");
  assert.ok(rows[0].querySelector("strong"));
});

test("default size formatting is the package formatBytes", () => {
  const c = mount({ stores: [kv] });
  assert.equal(c.querySelectorAll("tbody td")[3].textContent, "2.0 KiB");
});

test("a row click calls onOpen with the id", () => {
  const opened: string[] = [];
  const c = mount({ stores: [kv, tbl], onOpen: (id: string) => opened.push(id) });
  click(c.querySelectorAll("tbody tr")[1].querySelector("td") as Element);
  assert.deepEqual(opened, ["b"]);
});

test("Edit and Archive fire with their own store and never call onOpen", () => {
  const opened: string[] = [];
  const edited: string[] = [];
  const archived: string[] = [];
  const c = mount({
    stores: [kv, tbl],
    onOpen: (id: string) => opened.push(id),
    onEdit: (s: { id: string }) => edited.push(s.id),
    onArchive: (s: { id: string }) => archived.push(s.id),
  });
  click(tid(c, "data-store-archive-b") as Element);
  click(tid(c, "data-store-edit-a") as Element);
  assert.deepEqual(archived, ["b"]);
  assert.deepEqual(edited, ["a"]);
  assert.deepEqual(opened, []);
});

test("busy disables Archive", () => {
  const c = mount({ stores: [kv], onArchive: noop, busy: true });
  assert.equal((tid(c, "data-store-archive-a") as HTMLButtonElement).disabled, true);
});

test("no actions column when neither callback is set", () => {
  const c = mount({ stores: [kv], onOpen: noop });
  assert.equal(c.querySelectorAll("thead th").length, 5);
  assert.equal(c.querySelectorAll("button").length, 0);
});

test("an empty list shows EmptyState", () => {
  const c = mount({ stores: [] });
  assert.ok(tid(c, "w6w-data-store-list-empty"));
  assert.equal(c.querySelectorAll("table").length, 0);
});
