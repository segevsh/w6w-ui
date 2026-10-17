// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/CallableList.test.ts
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { CallableList } = await import("../CallableList.tsx");

const rows = [
  { id: "a", title: "Alpha", archived: false },
  { id: "b", title: "Beta", archived: true },
];

function mount(props: Record<string, unknown>) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  act(() => root.render(React.createElement(CallableList, { rows, title: "Things", ...props })));
  return container;
}

const text = (c: Element) => c.textContent ?? "";
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });

test("archived rows are hidden by default and shown after the uncontrolled toggle", () => {
  const c = mount({ testIds: { showArchived: "sa" } });
  assert.ok(text(c).includes("Alpha"));
  assert.ok(!text(c).includes("Beta"), "hidden-by-default");
  click(c.querySelector('[data-testid="sa"]') as Element);
  assert.ok(text(c).includes("Beta"));
});

test("controlled showArchived wins and the checkbox reports the change", () => {
  const seen: boolean[] = [];
  const c = mount({
    showArchived: false,
    onShowArchivedChange: (n: boolean) => seen.push(n),
    testIds: { showArchived: "sa" },
  });
  click(c.querySelector('[data-testid="sa"]') as Element);
  assert.deepEqual(seen, [true]);
  assert.ok(!text(c).includes("Beta"), "controlled: prop still false, row stays hidden");
  const c2 = mount({ showArchived: true });
  assert.ok(text(c2).includes("Beta"));
});

test("the archived badge carries the passed testid", () => {
  const c = mount({ showArchived: true, testIds: { archivedBadge: "ab" } });
  const badge = c.querySelector('[data-testid="ab"]');
  assert.ok(badge);
  assert.equal(badge.textContent, "archived");
});

test("with getHref rows are anchors and onOpen still fires, not prevented", () => {
  const seen: Array<[string, boolean]> = [];
  const c = mount({
    getHref: (id: string) => `/f/${id}`,
    onOpen: (id: string, e: { defaultPrevented: boolean }) => seen.push([id, e.defaultPrevented]),
  });
  const a = c.querySelector("a");
  assert.ok(a, "anchor");
  assert.equal(a.getAttribute("href"), "/f/a");
  click(a);
  assert.deepEqual(seen, [["a", false]]);
});

test("without getHref rows are buttons; with neither they are non-interactive", () => {
  const seen: string[] = [];
  const c = mount({ onOpen: (id: string) => seen.push(id) });
  assert.equal(c.querySelector("a"), null);
  click(c.querySelector("ul button") as Element);
  assert.deepEqual(seen, ["a"]);
  const c2 = mount({});
  assert.equal(c2.querySelector("ul button"), null);
  assert.equal(c2.querySelector("ul a"), null);
});

test("New/Import render only with their callbacks; empty copy shows when rows is empty", () => {
  const c = mount({ rows: [], emptyCopy: "Nothing here" });
  assert.equal(c.querySelectorAll("button").length, 0);
  assert.ok(text(c).includes("Nothing here"));
  const created: number[] = [];
  const c2 = mount({ onCreate: () => created.push(1), onImport: () => {}, newLabel: "New fn" });
  assert.ok(text(c2).includes("Import"));
  click([...c2.querySelectorAll("button")].find((b) => b.textContent === "New fn") as Element);
  assert.deepEqual(created, [1]);
  assert.ok(text(mount({ onCreate: () => {}, creating: true })).includes("Creating…"));
});

test("layout: no h1, root class, every static className token defined in styles.css", () => {
  const c = mount({ onCreate: () => {}, onImport: () => {}, description: "d", error: "e" });
  assert.equal(c.querySelector("h1"), null);
  assert.ok(c.querySelector("h2"));
  assert.equal(c.firstElementChild?.className, "w6w-callable-list");
  const src = readFileSync(fileURLToPath(new URL("../CallableList.tsx", import.meta.url)), "utf8");
  const css = readFileSync(fileURLToPath(new URL("../../styles.css", import.meta.url)), "utf8");
  const tokens = new Set<string>();
  for (const m of src.matchAll(/className="([^"]+)"/g)) {
    for (const t of (m[1] ?? "").split(/\s+/)) if (t) tokens.add(t);
  }
  assert.ok(tokens.size >= 8, `saw ${tokens.size} tokens`);
  for (const t of tokens) {
    assert.ok(t.startsWith("w6w-"), `${t} starts w6w-`);
    assert.ok(css.includes(`.${t}`), `${t} defined in styles.css`);
  }
});
