// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/DataTable.test.ts
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { DataTable } = await import("../DataTable.tsx");

type Row = { id: string; name: string; kind: string };
const rows: Row[] = [
  { id: "a", name: "Alpha", kind: "fn" },
  { id: "b", name: "Beta", kind: "ep" },
];

function mount(props: Record<string, unknown>) {
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  const columns = [
    { key: "name", header: "Name" },
    {
      key: "act",
      header: "Action",
      link: false,
      render: (r: Row) => React.createElement("button", { type: "button" }, `go-${r.id}`),
    },
    { key: "kind", header: "Kind" },
  ];
  act(() =>
    root.render(
      React.createElement(DataTable, {
        columns,
        rows,
        rowKey: (r: Row) => r.id,
        ...props,
      } as never),
    ),
  );
  return container;
}

test("A2 headers in order, render node in cell, plain key shows row[key]", () => {
  const c = mount({});
  const heads = [...c.querySelectorAll("thead th")].map((t) => t.textContent);
  assert.deepEqual(heads, ["Name", "Action", "Kind"]);
  const cells = c.querySelectorAll("tbody tr")[0].querySelectorAll("td");
  assert.equal(cells[0].textContent, "Alpha");
  assert.equal(cells[1].querySelector("button")?.textContent, "go-a");
  assert.equal(cells[2].textContent, "fn");
  assert.equal(c.querySelectorAll("tbody tr").length, 2);
});

test("A3 getRowHref: anchors in link cells, none in link:false cell", () => {
  const c = mount({ getRowHref: (r: Row) => `#/${r.id}` });
  const cells = c.querySelectorAll("tbody tr")[1].querySelectorAll("td");
  assert.equal(cells[0].querySelector("a")?.getAttribute("href"), "#/b");
  assert.equal(cells[1].querySelector("a"), null);
  assert.equal(cells[2].querySelector("a")?.getAttribute("href"), "#/b");
});

test("A3 neither given: no anchors, no click handling class", () => {
  const c = mount({});
  assert.equal(c.querySelectorAll("a").length, 0);
  assert.equal(c.querySelectorAll(".w6w-data-table-row-clickable").length, 0);
});

test("A3 onRowClick fires with row and event", () => {
  const got: unknown[] = [];
  const c = mount({ onRowClick: (r: Row, e: unknown) => got.push(r, e) });
  const tr = c.querySelectorAll("tbody tr")[1] as HTMLElement;
  act(() => {
    tr.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal((got[0] as Row).id, "b");
  assert.ok(got[1], "event passed");
  assert.equal(c.querySelectorAll(".w6w-data-table-row-clickable").length, 2);
});

test("A4 empty rows + empty renders node, no tbody; loading suppresses it", () => {
  const empty = React.createElement("p", { id: "e" }, "Nothing");
  const c = mount({ rows: [], empty });
  assert.ok(c.querySelector("#e"));
  assert.equal(c.querySelectorAll("tbody tr").length, 0);
  const l = mount({ rows: [], empty, loading: true });
  assert.equal(l.querySelector("#e"), null);
  assert.ok(l.querySelector("table"));
  const filled = mount({ empty });
  assert.equal(filled.querySelector("#e"), null);
});
