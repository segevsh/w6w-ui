// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/DataTableGrid.test.ts
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

const { DataTableGrid } = await import("../DataTableGrid.tsx");

type Calls = Record<string, unknown[][]>;
function mount(props: Record<string, unknown>, calls: Calls = {}) {
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls[name] = [...(calls[name] ?? []), args];
    };
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  act(() =>
    root.render(
      React.createElement(DataTableGrid, {
        columns: [
          { name: "sku", type: "string", required: true },
          { name: "qty", type: "integer", required: false },
        ],
        keyColumn: "sku",
        rows: [],
        onCellChange: rec("cell"),
        onSave: rec("save"),
        onDelete: rec("delete"),
        onReload: rec("reload"),
        onAddRow: rec("add"),
        onLoadMore: rec("more"),
        onSearch: rec("search"),
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
const cell = (c: Element, row: string, column: string) =>
  c.querySelector(`input[data-row="${row}"][data-column="${column}"]`) as HTMLInputElement;

const existing = { id: "a-1", cells: { sku: "a-1", qty: "4" }, version: 2, dirty: false };
const newRow = { id: "tmp", isNew: true, cells: { sku: "", qty: "" }, version: null, dirty: true };

test("key input readOnly on an existing row, editable on the new row (data-row new)", () => {
  const c = mount({ rows: [existing, newRow] });
  assert.equal(cell(c, "a-1", "sku").readOnly, true, "key readOnly on existing");
  assert.equal(cell(c, "a-1", "qty").readOnly, false);
  assert.equal(cell(c, "new", "sku").readOnly, false, "key editable on new row");
  assert.equal(cell(c, "a-1", "qty").value, "4");
});

test("onCellChange fires with row id, column and text", () => {
  const calls: Calls = {};
  const c = mount({ rows: [existing, newRow] }, calls);
  type(cell(c, "a-1", "qty"), "9");
  type(cell(c, "new", "sku"), "z");
  assert.deepEqual(calls.cell, [
    ["a-1", "qty", "9"],
    ["tmp", "sku", "z"],
  ]);
});

test("cell error renders under its own cell, never in grid-error", () => {
  const c = mount({
    rows: [{ ...existing, dirty: true, cellErrors: { qty: "Expected an integer." } }],
  });
  const err = c.querySelector('.w6w-data-cell-error[data-row="a-1"][data-column="qty"]');
  assert.ok(err, "cell error placed at its cell");
  assert.equal(err?.textContent, "Expected an integer.");
  assert.equal(err?.closest("td"), cell(c, "a-1", "qty").closest("td"), "same cell");
  assert.equal(tid(c, "grid-error"), null, "not in grid-error");
  assert.equal(c.querySelector('.w6w-data-cell-error[data-column="sku"]'), null);
});

test("grid-error renders only the grid-level error", () => {
  const c = mount({ rows: [existing], error: "boom" });
  assert.equal(tid(c, "grid-error").textContent, "boom");
  assert.equal(c.querySelectorAll(".w6w-data-cell-error").length, 0);
});

test("row-save disabled when existing and clean, or conflict; enabled when dirty; new row enabled", () => {
  const clean = mount({ rows: [existing] });
  assert.equal((tid(clean, "row-save") as HTMLButtonElement).disabled, true, "clean save disabled");
  const dirty = mount({ rows: [{ ...existing, dirty: true }] });
  assert.equal((tid(dirty, "row-save") as HTMLButtonElement).disabled, false);
  const conflict = mount({ rows: [{ ...existing, dirty: true, conflict: true }] });
  assert.equal(
    (tid(conflict, "row-save") as HTMLButtonElement).disabled,
    true,
    "conflict save disabled",
  );
  const fresh = mount({ rows: [{ ...newRow, dirty: false }] });
  assert.equal((tid(fresh, "row-save") as HTMLButtonElement).disabled, false, "new row saveable");
});

test("conflict row shows copy and Reload; Save/Delete/Reload fire with the row id", () => {
  const calls: Calls = {};
  const c = mount(
    {
      rows: [
        { ...existing, dirty: true, conflict: true },
        { ...existing, id: "b-2", cells: { sku: "b-2", qty: "" }, dirty: true },
      ],
    },
    calls,
  );
  const conflict = c.querySelectorAll('[data-testid="row-conflict"]');
  assert.equal(conflict.length, 1);
  assert.equal(conflict[0].getAttribute("data-row"), "a-1");
  assert.match(conflict[0].textContent ?? "", /Changed by someone else since you loaded it\./);
  click(tid(c, "row-reload"));
  assert.deepEqual(calls.reload, [["a-1"]]);
  const saves = c.querySelectorAll('[data-testid="row-save"]');
  click(saves[1]);
  assert.deepEqual(calls.save, [["b-2"]]);
  click(c.querySelectorAll('button[aria-label="Delete entry"]')[1]);
  assert.deepEqual(calls.delete, [["b-2"]]);
  assert.match(c.textContent ?? "", /v2/);
});

test("search is submit-only; Add row and Load more fire; load-more only with hasMore", () => {
  const calls: Calls = {};
  const c = mount({ rows: [existing] }, calls);
  type(tid(c, "entry-prefix") as HTMLInputElement, "a-");
  assert.equal(calls.search, undefined, "no search per keystroke");
  act(() => {
    tid(c, "entry-search").dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  assert.deepEqual(calls.search, [["a-"]]);
  click(tid(c, "grid-add-row"));
  assert.equal(calls.add?.length, 1);
  assert.equal(tid(c, "entries-load-more"), null);
  const m = mount({ rows: [existing], hasMore: true }, calls);
  click(tid(m, "entries-load-more"));
  assert.equal(calls.more?.length, 1);
  assert.ok(tid(m, "data-grid-scroll"));
});

test("new row: row-save carries data-row new; Save/Delete/Reload fire with the row id", () => {
  const calls: Calls = {};
  const c = mount(
    {
      rows: [
        { ...newRow, conflict: true },
        { ...existing, id: "c-3", cells: { sku: "c-3", qty: "" }, dirty: true },
      ],
    },
    calls,
  );
  const save = c.querySelector('[data-testid="row-save"][data-row="new"]');
  assert.ok(save, "row-save[data-row=new]");
  assert.ok(c.querySelector('[data-testid="row-save"][data-row="c-3"]'), "row-save[data-row=c-3]");
  click(c.querySelectorAll('button[aria-label="Delete entry"]')[0]);
  assert.deepEqual(calls.delete, [["tmp"]]);
  click(tid(c, "row-reload"));
  assert.deepEqual(calls.reload, [["tmp"]]);
  const f = mount({ rows: [{ ...newRow, conflict: false }] }, calls);
  click(f.querySelector('[data-testid="row-save"][data-row="new"]') as Element);
  assert.deepEqual(calls.save, [["tmp"]]);
});
