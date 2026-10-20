// Run: NODE_OPTIONS=--experimental-strip-types node --import ./src/test-jsx-loader.mjs --test src/__tests__/JsonEditor.empty-lint.test.ts
//
// Mirrors two existing rigs rather than inventing a third: the recording
// clipboard stub from `src/components/__tests__/Copyable.test.ts:54-60`, and
// the `Window`/`requestAnimationFrame`/`cancelAnimationFrame` trio a
// CodeMirror 6 mount needs, first added at
// `StepEditModal.setup-and-configure.test.ts:8,50-52`.
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

// CodeMirror 6 needs these three (verified necessary + jointly sufficient at
// `WorkflowFlowEditor.test-tab.test.ts:47-58`).
g.Window = dom.window.Window;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
(dom.window as unknown as Record<string, unknown>).requestAnimationFrame = raf;
(dom.window as unknown as Record<string, unknown>).cancelAnimationFrame = (id: number) =>
  clearTimeout(id as unknown as NodeJS.Timeout);

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { JsonEditor } = await import("../JsonEditor.tsx");
const { EditorView } = await import("@codemirror/view");
const { diagnosticCount, forceLinting } = await import("@codemirror/lint");

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** Mounts a JsonEditor and returns the number of lint diagnostics after a forced lint pass. */
async function diagnosticsFor(value: string): Promise<number> {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(JsonEditor, { value, onChange: () => {} }));
  });
  await settle();
  const content = container.querySelector(".cm-content");
  assert.ok(content, "editor content must render");
  const view = EditorView.findFromDOM(content as HTMLElement);
  assert.ok(view);
  forceLinting(view);
  await settle(300);
  const n = diagnosticCount(view.state);
  await act(async () => {
    root.unmount();
  });
  return n;
}

test("L1 — empty value produces no lint diagnostic", async () => {
  assert.equal(await diagnosticsFor(""), 0);
});

test("L2 — whitespace-only value produces no lint diagnostic", async () => {
  assert.equal(await diagnosticsFor("  \n"), 0);
});

test("L3 — malformed JSON still produces at least one diagnostic", async () => {
  assert.ok((await diagnosticsFor("{")) >= 1);
});
