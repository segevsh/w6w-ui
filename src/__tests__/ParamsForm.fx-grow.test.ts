// Run (from packages/ui): node --max-old-space-size=2048 --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/ParamsForm.fx-grow.test.ts
//
// T0.2.1 A2: the Combobox a dynamic-options param renders must hang off the ƒx
// wrap's flex item, so `_fx.scss` can grow it (`.w6w-fx-wrap > .w6w-fx-grow`) and
// `_fields.scss` can stretch the combobox inside it. jsdom does no layout, so this
// pins the DOM SHAPE the two stylesheets select on; the pixel proof is the real
// Chromium gate `test/combo-layout/combo-layout.test.ts`. Rig mirrors
// `ParamsForm.dynamic-options.test.ts` (same JSDOM shims, `render(` helper, mock api).
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

g.Window = dom.window.Window;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
(dom.window as unknown as Record<string, unknown>).requestAnimationFrame = raf;
(dom.window as unknown as Record<string, unknown>).cancelAnimationFrame = (id: number) =>
  clearTimeout(id as unknown as NodeJS.Timeout);

(
  dom.window as unknown as { HTMLDialogElement: { prototype: Record<string, unknown> } }
).HTMLDialogElement.prototype.showModal = function (this: { open: boolean }) {
  this.open = true;
};
(
  dom.window as unknown as { HTMLDialogElement: { prototype: Record<string, unknown> } }
).HTMLDialogElement.prototype.close = function (this: { open: boolean }) {
  this.open = false;
};

// CodeMirror measures selection layers through Range rects, which jsdom omits.
const rangeProto = dom.window.Range.prototype as unknown as Record<string, unknown>;
rangeProto.getClientRects = () => [];
rangeProto.getBoundingClientRect = () => ({
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
});

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { ParamsForm } = await import("../ParamsForm.tsx");
const { ExpressionOptionsProvider } = await import("../components/ExpressionOptions.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type ActionParam = import("../types.ts").ActionParam;

const DYN: ActionParam = {
  key: "model",
  label: "Model",
  type: "string",
  options: { source: "resolveFields" },
};
const CTX = { appId: "anthropic", actionKey: "messages", connectionId: "c1", appName: "Anthropic" };

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function render(
  api: unknown | null,
  params: ActionParam[],
  dynamic: Record<string, unknown>,
) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  function Harness() {
    const [values, setValues] = React.useState<Record<string, unknown>>({});
    const form = React.createElement(
      ExpressionOptionsProvider,
      { value: { steps: [], sampleValues: {} }, children: null },
      React.createElement(ParamsForm, {
        params,
        values,
        dynamic: dynamic as never,
        onChange: (next: Record<string, unknown>) => setValues(next),
      }),
    );
    return api ? React.createElement(W6WUIProvider, { api: api as never, children: form }) : form;
  }
  await act(async () => {
    root.render(React.createElement(Harness));
  });
  await settle(5);
  return { container, root };
}

test("A2: a dynamic-options Combobox renders as .w6w-fx-wrap > .w6w-fx-grow > .w6w-combobox > input", async () => {
  const calls: string[] = [];
  const api = {
    resolveActionFields: async (appId: string, actionKey: string) => {
      calls.push(`${appId}/${actionKey}`);
      return { fields: { model: { options: [{ value: "opus", label: "Opus" }] } } };
    },
  };
  const { container, root } = await render(api, [DYN], CTX);
  await settle(5);
  assert.equal(calls.length, 1);
  const input = container.querySelector(
    ".w6w-fx-wrap > .w6w-fx-grow > .w6w-combobox > input[role=combobox]",
  );
  assert.ok(input, "the combobox input hangs off the ƒx wrap's grow item");
  // The wrap itself is the field's box: the grow item is its child, not a second box.
  assert.equal(container.querySelectorAll(".w6w-fx-grow").length, 1);
  await act(async () => root.unmount());
});
