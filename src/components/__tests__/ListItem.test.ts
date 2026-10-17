// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/ListItem.test.ts
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { ListItem } = await import("../ListItem.tsx");

function mount(el: React.ReactElement) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  act(() => root.render(el));
  return container;
}

test("ListItem without href or onClick is a plain div", () => {
  const c = mount(React.createElement(ListItem, { title: "a" }));
  assert.equal(c.querySelector("a"), null);
  assert.equal(c.querySelector("button"), null);
  assert.ok(c.querySelector("div.w6w-list-item"));
});

test("ListItem with onClick only is a button with aria-pressed, as before", () => {
  const c = mount(React.createElement(ListItem, { title: "a", active: true, onClick: () => {} }));
  const b = c.querySelector("button.w6w-list-item");
  assert.ok(b);
  assert.equal(b.getAttribute("aria-pressed"), "true");
  assert.equal(c.querySelector("a"), null);
});

test("ListItem with href renders an anchor and forwards the click event, not prevented", () => {
  const seen: Array<{ prevented: boolean }> = [];
  const c = mount(
    React.createElement(ListItem, {
      title: "a",
      href: "/x/1",
      onClick: (e: { defaultPrevented: boolean }) => {
        seen.push({ prevented: e.defaultPrevented });
      },
    }),
  );
  const a = c.querySelector("a.w6w-list-item");
  assert.ok(a);
  assert.equal(a.getAttribute("href"), "/x/1");
  assert.equal(c.querySelector("button"), null);
  act(() => {
    a.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.prevented, false);
});

test("ListItem anchor leaves navigation to the host: not default-prevented after the click", () => {
  const c = mount(React.createElement(ListItem, { title: "a", href: "#h", onClick: () => {} }));
  const a = c.querySelector("a");
  assert.ok(a);
  const ev = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
  act(() => {
    a.dispatchEvent(ev);
  });
  assert.equal(ev.defaultPrevented, false);
});
