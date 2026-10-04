// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/components/__tests__/Icon.test.ts  (Node 24)
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
const { Icon } = await import("../Icon.tsx");
const { iconNames, icons } = await import("../icons.tsx");

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

test("I1 — every iconName renders exactly one svg with a viewBox, and no throw", async () => {
  assert.ok(iconNames.length > 0);
  for (const name of iconNames) {
    const { container, root } = mountRoot();
    await act(async () => {
      root.render(React.createElement(Icon, { name }));
    });
    const svgs = container.querySelectorAll("svg");
    assert.equal(svgs.length, 1, `${name} should render exactly one <svg>`);
    const svg = svgs[0];
    assert.equal(svg.getAttribute("viewBox"), "0 0 24 24", `${name} viewBox`);
    // Every glyph draws SOMETHING: a path/polyline/line/rect/circle/polygon/group.
    assert.ok(svg.children.length > 0, `${name} should have drawing children`);
    await act(async () => {
      root.unmount();
    });
  }
});

test("I2 — iconNames covers the whole set, with no duplicates", async () => {
  assert.deepEqual([...iconNames].sort(), Object.keys(icons).sort());
  assert.equal(new Set(iconNames).size, iconNames.length);
  for (const name of iconNames) {
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${name} should be kebab-case`);
  }
});

test("I3 — no label is decorative: aria-hidden + focusable, no role, no aria-label", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(React.createElement(Icon, { name: "history" }));
  });
  const svg = container.querySelector("svg");
  assert.ok(svg);
  assert.equal(svg.getAttribute("aria-hidden"), "true");
  assert.equal(svg.getAttribute("focusable"), "false");
  assert.equal(svg.hasAttribute("role"), false);
  assert.equal(svg.hasAttribute("aria-label"), false);
  await act(async () => {
    root.unmount();
  });
});

test("I4 — a label makes it role=img with that name, and drops aria-hidden", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(React.createElement(Icon, { name: "history", label: "Execution history" }));
  });
  const svg = container.querySelector("svg");
  assert.ok(svg);
  assert.equal(svg.getAttribute("role"), "img");
  assert.equal(svg.getAttribute("aria-label"), "Execution history");
  assert.equal(svg.hasAttribute("aria-hidden"), false);
  await act(async () => {
    root.unmount();
  });
});

test("I5 — size sets width and height; default is 16", async () => {
  const a = mountRoot();
  await act(async () => {
    a.root.render(React.createElement(Icon, { name: "copy" }));
  });
  const dflt = a.container.querySelector("svg");
  assert.ok(dflt);
  assert.equal(dflt.getAttribute("width"), "16");
  assert.equal(dflt.getAttribute("height"), "16");
  await act(async () => {
    a.root.unmount();
  });

  const b = mountRoot();
  await act(async () => {
    b.root.render(React.createElement(Icon, { name: "copy", size: 24 }));
  });
  const sized = b.container.querySelector("svg");
  assert.ok(sized);
  assert.equal(sized.getAttribute("width"), "24");
  assert.equal(sized.getAttribute("height"), "24");
  await act(async () => {
    b.root.unmount();
  });
});

test("I6 — className is merged alongside w6w-icon", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(React.createElement(Icon, { name: "edit", className: "my-glyph" }));
  });
  const svg = container.querySelector("svg");
  assert.ok(svg);
  assert.ok(svg.classList.contains("w6w-icon"));
  assert.ok(svg.classList.contains("my-glyph"));
  await act(async () => {
    root.unmount();
  });
});

test("I7 — paint matches the entry's variant (fill vs stroke vs mixed)", async () => {
  const cases = [
    { name: "history", variant: "fill" },
    { name: "delete", variant: "stroke" },
    { name: "lang-curl", variant: "mixed" },
  ];
  for (const { name, variant } of cases) {
    const { container, root } = mountRoot();
    await act(async () => {
      root.render(React.createElement(Icon, { name }));
    });
    const svg = container.querySelector("svg");
    assert.ok(svg);
    if (variant === "fill") {
      assert.equal(svg.getAttribute("fill"), "currentColor");
      assert.equal(svg.hasAttribute("stroke"), false);
    } else if (variant === "stroke") {
      assert.equal(svg.getAttribute("fill"), "none");
      assert.equal(svg.getAttribute("stroke"), "currentColor");
      assert.equal(svg.getAttribute("stroke-linecap"), "round");
    } else {
      // `mixed`: the glyph paints its own elements, the root must add no paint.
      assert.equal(svg.hasAttribute("fill"), false);
      assert.equal(svg.hasAttribute("stroke"), false);
    }
    await act(async () => {
      root.unmount();
    });
  }
});
