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

test("K6 — icon renders one decorative Icon svg, at iconSize", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(IconButton, {
        label: "Execution history",
        onClick: () => {},
        icon: "history",
      }),
    );
  });
  const svg = container.querySelector("button > svg");
  assert.ok(svg);
  assert.ok(svg.classList.contains("w6w-icon"));
  assert.equal(svg.getAttribute("width"), "16");
  assert.equal(svg.getAttribute("aria-hidden"), "true");
  await act(async () => {
    root.unmount();
  });

  const sized = mountRoot();
  await act(async () => {
    sized.root.render(
      React.createElement(IconButton, {
        label: "Execution history",
        onClick: () => {},
        icon: "history",
        iconSize: 20,
      }),
    );
  });
  const bigger = sized.container.querySelector("button > svg");
  assert.ok(bigger);
  assert.equal(bigger.getAttribute("width"), "20");
  assert.equal(bigger.getAttribute("height"), "20");
  await act(async () => {
    sized.root.unmount();
  });
});

test("K7 — children win over icon when both are given", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(IconButton, {
        label: "Frob",
        onClick: () => {},
        icon: "history",
        children: React.createElement("span", { "data-testid": "own-glyph" }, "*"),
      }),
    );
  });
  assert.ok(container.querySelector('[data-testid="own-glyph"]'));
  assert.equal(container.querySelector("svg"), null);
  await act(async () => {
    root.unmount();
  });
});

test("K8 — title overrides the tooltip only; aria-label stays label", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(IconButton, {
        label: "Execution history",
        title: "No executions yet",
        onClick: () => {},
        icon: "history",
      }),
    );
  });
  const button = container.querySelector("button");
  assert.ok(button);
  assert.equal(button.getAttribute("title"), "No executions yet");
  assert.equal(button.getAttribute("aria-label"), "Execution history");
  await act(async () => {
    root.unmount();
  });
});

test("K9 — ref reaches the HTMLButtonElement", async () => {
  const { container, root } = mountRoot();
  const ref = React.createRef<HTMLButtonElement>();
  await act(async () => {
    root.render(
      React.createElement(IconButton, { label: "Frob", onClick: () => {}, ref, icon: "edit" }),
    );
  });
  const button = container.querySelector("button");
  assert.ok(button);
  assert.ok(ref.current instanceof dom.window.HTMLButtonElement);
  assert.equal(ref.current, button);
  await act(async () => {
    root.unmount();
  });
});

test("K10 — aria-pressed / aria-expanded pass through, and are absent by default", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(IconButton, {
        label: "Frob",
        onClick: () => {},
        icon: "json",
        "aria-pressed": true,
        "aria-expanded": false,
      }),
    );
  });
  const button = container.querySelector("button");
  assert.ok(button);
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(button.getAttribute("aria-expanded"), "false");
  await act(async () => {
    root.unmount();
  });

  const plain = mountRoot();
  await act(async () => {
    plain.root.render(React.createElement(IconButton, { label: "Frob", onClick: () => {} }));
  });
  const bare = plain.container.querySelector("button");
  assert.ok(bare);
  assert.equal(bare.hasAttribute("aria-pressed"), false);
  assert.equal(bare.hasAttribute("aria-expanded"), false);
  await act(async () => {
    plain.root.unmount();
  });
});
