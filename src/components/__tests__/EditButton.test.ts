// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/components/__tests__/EditButton.test.ts  (Node 24)
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
const { EditButton } = await import("../EditButton.tsx");

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

test("E1 — onClick fires exactly once on click", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(React.createElement(EditButton, { label: "Edit", onClick: () => calls++ }));
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

test("E2 — title and aria-label both equal label", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(React.createElement(EditButton, { label: "Edit item", onClick: () => {} }));
  });
  const button = container.querySelector("button");
  assert.ok(button);
  assert.equal(button.getAttribute("title"), "Edit item");
  assert.equal(button.getAttribute("aria-label"), "Edit item");
  await act(async () => {
    root.unmount();
  });
});

test("E3 — disabled suppresses onClick", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(
      React.createElement(EditButton, { label: "Edit", onClick: () => calls++, disabled: true }),
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

test("E4 — data-testid reaches the DOM node", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(EditButton, {
        label: "Edit",
        onClick: () => {},
        "data-testid": "edit-btn",
      }),
    );
  });
  const button = container.querySelector("button");
  assert.ok(button);
  assert.equal(button.getAttribute("data-testid"), "edit-btn");
  await act(async () => {
    root.unmount();
  });
});

test("E5 — caller className is merged alongside w6w-icon-button", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(EditButton, {
        label: "Edit",
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

test("E6 — renders the pinned two-path pencil glyph", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(React.createElement(EditButton, { label: "Edit", onClick: () => {} }));
  });
  const paths = Array.from(container.querySelectorAll("svg path")).map((p) => p.getAttribute("d"));
  assert.deepEqual(paths, ["M12 20h9", "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"]);
  await act(async () => {
    root.unmount();
  });
});
