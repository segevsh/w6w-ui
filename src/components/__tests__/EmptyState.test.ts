// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/EmptyState.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const { EmptyState } = await import("../EmptyState.tsx");

test("renders title, body and action inside the inner block", () => {
  const container = document.getElementById("root") as HTMLElement;
  const root = createRoot(container);
  act(() => {
    root.render(
      React.createElement(
        EmptyState,
        {
          title: "Nothing here",
          action: React.createElement("button", { type: "button" }, "Create"),
          testId: "es",
        },
        "Add one to begin",
      ),
    );
  });
  const el = container.querySelector('[data-testid="es"]') as HTMLElement;
  assert.ok(el.classList.contains("w6w-empty-state"));
  const inner = el.querySelector(".w6w-empty-state-inner") as HTMLElement;
  assert.match(inner.textContent ?? "", /Nothing here/);
  assert.match(inner.textContent ?? "", /Add one to begin/);
  assert.ok(inner.querySelector("button"));
  act(() => root.unmount());
});

test("styling: min-height 10rem, white panel, inner absolutely centred", () => {
  const css = readFileSync(new URL("../../styles/_empty-state.scss", import.meta.url), "utf8");
  assert.match(css, /min-height:\s*10rem/);
  assert.match(css, /background:\s*var\(--w6w-panel\)/);
  assert.match(css, /position:\s*absolute/);
  assert.match(css, /top:\s*50%/);
  assert.match(css, /left:\s*50%/);
  assert.match(css, /translate\(-50%,\s*-50%\)/);
});
