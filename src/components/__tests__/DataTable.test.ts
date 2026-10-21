// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/DataTable.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
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

test("T3 the frame wraps the table and is its only child", () => {
  const c = mount({});
  const frames = c.querySelectorAll(".w6w-data-table-frame");
  assert.equal(frames.length, 1, "exactly one frame owns the outer border");
  const table = frames[0].querySelector("table.w6w-data-table");
  assert.ok(table, "the table lives inside the frame");
  assert.equal(frames[0].children.length, 1, "the frame holds nothing but the table");
  assert.equal(table.parentElement, frames[0]);
  // the outer border/radius belong to the frame alone — the table keeps no own class
  assert.deepEqual([...table.classList], ["w6w-data-table"]);
  assert.equal(c.querySelectorAll("table").length, 1);
});

test("T3 className and testId still land on the table, not the frame", () => {
  const c = mount({ className: "extra", testId: "tbl" });
  const table = c.querySelector("table") as HTMLElement;
  assert.equal(table.getAttribute("data-testid"), "tbl");
  assert.ok(table.classList.contains("extra"));
  assert.ok(table.classList.contains("w6w-data-table"));
  const frame = c.querySelector(".w6w-data-table-frame") as HTMLElement;
  assert.equal(frame.getAttribute("data-testid"), null);
  assert.equal(frame.className, "w6w-data-table-frame");
});

// --- T3, round 2: the header-only table must not paint the frame's bottom edge twice.
//
// With rows=[] + loading (a list still fetching — ConnectionList/CallableList),
// only <thead> renders. `tbody tr:last-child > td { border-bottom: 0 }` then has
// no match, so the `th` cells kept their 1px bottom border right on top of the
// frame's own 1px bottom border: two lines. The rule below pins the fix over the
// COMPILED artifact (src/styles.css, what consumers actually load), because a
// class-only assertion cannot see a border.

/** Top-level `selector { body }` pairs of a stylesheet, comments stripped, whitespace folded. */
function cssRules(css: string): { selector: string; body: string }[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? "").replace(/\s+/g, " ").trim(),
    body: (m[2] ?? "").replace(/\s+/g, " ").trim(),
  }));
}

test("T3 header-only table (loading, no rows): th paints no bottom border over the frame's", () => {
  const css = readFileSync(fileURLToPath(new URL("../../styles.css", import.meta.url)), "utf8");
  const rules = cssRules(css);

  // Precondition in the DOM: this is the shape the lists render while fetching.
  const c = mount({ rows: [], loading: true });
  const table = c.querySelector("table.w6w-data-table") as HTMLElement;
  assert.ok(table, "the loading table renders");
  assert.ok(table.querySelectorAll("thead th").length > 0, "header cells render");
  assert.equal(table.querySelectorAll("tbody tr").length, 0, "no body row — header only");

  // The base cell rule still draws the INNER separator (header/body boundary).
  const base = rules.find(
    (r) => r.selector.includes(".w6w-data-table th") && r.selector.includes(".w6w-data-table td"),
  );
  assert.ok(base, "no `.w6w-data-table th, .w6w-data-table td` rule in styles.css");
  assert.match(base.body, /(^|;)\s*border-bottom:\s*1px solid/);

  // The no-body-rows rule drops the th bottom border, so only the frame paints it.
  const headerOnly = rules.filter(
    (r) => /(^|[\s,])th(\s*,|\s*$)/.test(r.selector) && /:has\(\s*tbody\s+tr\s*\)/.test(r.selector),
  );
  assert.equal(headerOnly.length, 1, "expected exactly one scoped `:has(tbody tr)` th rule");
  assert.match(
    headerOnly[0].selector,
    /^\.w6w-data-table:not\(:has\(tbody tr\)\) th$/,
    "the rule applies to a header with no body row, not to every table",
  );
  assert.match(headerOnly[0].body, /(^|;)\s*border-bottom:\s*0/, "th keeps no bottom border");
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
