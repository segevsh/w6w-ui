// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/components/__tests__/IconButton.test.ts  (Node 24)
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
const { IconButton } = await import("../IconButton.tsx");

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

test("K1 — onClick fires exactly once on click", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(
      React.createElement(IconButton, {
        label: "Frob",
        onClick: () => calls++,
        children: React.createElement("span", null, "*"),
      }),
    );
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

test("K2 — title and aria-label both equal label", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(IconButton, {
        label: "Frob it",
        onClick: () => {},
        children: React.createElement("span", null, "*"),
      }),
    );
  });
  const button = container.querySelector("button");
  assert.ok(button);
  assert.equal(button.getAttribute("title"), "Frob it");
  assert.equal(button.getAttribute("aria-label"), "Frob it");
  await act(async () => {
    root.unmount();
  });
});

test("K3 — disabled suppresses onClick", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(
      React.createElement(IconButton, {
        label: "Frob",
        onClick: () => calls++,
        disabled: true,
        children: React.createElement("span", null, "*"),
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

test("K4 — data-testid reaches the DOM node", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(IconButton, {
        label: "Frob",
        onClick: () => {},
        "data-testid": "frob-btn",
        children: React.createElement("span", null, "*"),
      }),
    );
  });
  const button = container.querySelector("button");
  assert.ok(button);
  assert.equal(button.getAttribute("data-testid"), "frob-btn");
  await act(async () => {
    root.unmount();
  });
});

test("K5 — caller className is merged alongside w6w-icon-button", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(IconButton, {
        label: "Frob",
        onClick: () => {},
        className: "my-extra-class",
        children: React.createElement("span", null, "*"),
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
