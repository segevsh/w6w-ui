// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/components/__tests__/DeleteButton.test.ts  (Node 24)
//
// Mirrors Copyable.test.ts:1-46's JSDOM/`act` setup.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
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
const { DeleteButton } = await import("../DeleteButton.tsx");

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

test("D1 — onClick fires exactly once on click", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(React.createElement(DeleteButton, { label: "Delete", onClick: () => calls++ }));
  });
  const button = container.querySelector("button");
  assert.ok(button);
  await act(async () => {
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(calls, 1);
  await act(async () => {
    root.unmount();
  });
});

test("D2 — title and aria-label both equal label", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(React.createElement(DeleteButton, { label: "Delete item", onClick: () => {} }));
  });
  const button = container.querySelector("button");
  assert.ok(button);
  assert.equal(button.getAttribute("title"), "Delete item");
  assert.equal(button.getAttribute("aria-label"), "Delete item");
  await act(async () => {
    root.unmount();
  });
});

test("D3 — disabled suppresses onClick", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(
      React.createElement(DeleteButton, {
        label: "Delete",
        onClick: () => calls++,
        disabled: true,
      }),
    );
  });
  const button = container.querySelector("button");
  assert.ok(button);
  await act(async () => {
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(calls, 0);
  await act(async () => {
    root.unmount();
  });
});

test("D4 — data-testid reaches the DOM node", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(DeleteButton, {
        label: "Delete",
        onClick: () => {},
        "data-testid": "delete-btn",
      }),
    );
  });
  const button = container.querySelector("button");
  assert.ok(button);
  assert.equal(button.getAttribute("data-testid"), "delete-btn");
  await act(async () => {
    root.unmount();
  });
});

test("D5 — caller className is merged alongside w6w-icon-button", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(DeleteButton, {
        label: "Delete",
        onClick: () => {},
        className: "my-extra-class",
      }),
    );
  });
  const button = container.querySelector("button");
  assert.ok(button);
  assert.ok(button.className.includes("w6w-icon-button"));
  assert.ok(button.className.includes("my-extra-class"));
  await act(async () => {
    root.unmount();
  });
});

test("D6 — renders the pinned 4-shape trash glyph", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(React.createElement(DeleteButton, { label: "Delete", onClick: () => {} }));
  });
  const svg = container.querySelector("svg");
  assert.ok(svg);
  const polylines = Array.from(svg.querySelectorAll("polyline")).map((p) =>
    p.getAttribute("points"),
  );
  const paths = Array.from(svg.querySelectorAll("path")).map((p) => p.getAttribute("d"));
  const lines = Array.from(svg.querySelectorAll("line")).map((l) => [
    l.getAttribute("x1"),
    l.getAttribute("y1"),
    l.getAttribute("x2"),
    l.getAttribute("y2"),
  ]);
  assert.deepEqual(polylines, ["3 6 5 6 21 6"]);
  assert.deepEqual(paths, [
    "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  ]);
  assert.deepEqual(lines, [
    ["10", "11", "10", "17"],
    ["14", "11", "14", "17"],
  ]);
  await act(async () => {
    root.unmount();
  });
});

test("D7 — rendered classes include w6w-icon-button-danger", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(React.createElement(DeleteButton, { label: "Delete", onClick: () => {} }));
  });
  const button = container.querySelector("button");
  assert.ok(button);
  assert.ok(button.className.includes("w6w-icon-button-danger"));
  await act(async () => {
    root.unmount();
  });
});
