// Run (from packages/ui): node --experimental-strip-types --import ./src/test-jsx-loader.mjs --test src/__tests__/ParamsForm.json-fx.test.ts
//
// T3.2.1 - the fx whole-output binding on `json` / childless `group` params.
// Mirrors `ParamsForm.script-language.test.ts`'s JSDOM + react-dom/client rig,
// plus the `<dialog>` shim `ExpressionEditorModal.*.test.ts` needs.
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
// `WorkflowFlowEditor.test-tab.test.ts:47-58`, reused verbatim by
// `params-form-groups.test.ts`/`ActionTestForm.overrides.test.ts`).
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
const { EditorView } = await import("@codemirror/view");
const { ParamsForm } = await import("../ParamsForm.tsx");
const { ExpressionOptionsProvider } = await import("../components/ExpressionOptions.tsx");
type ActionParam = import("../types.ts").ActionParam;

const JSON_PARAM: ActionParam = { key: "cfg", label: "Cfg", type: "json" };

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function render(opts: { readOnly?: boolean } = {}) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const calls: Array<Record<string, unknown>> = [];
  function Harness() {
    const [values, setValues] = React.useState<Record<string, unknown>>({});
    return React.createElement(
      ExpressionOptionsProvider,
      { value: { steps: [] }, children: null },
      React.createElement(ParamsForm, {
        params: [JSON_PARAM],
        values,
        readOnly: opts.readOnly,
        onChange: (next: Record<string, unknown>) => {
          calls.push(next);
          setValues(next);
        },
      }),
    );
  }
  await act(async () => {
    root.render(React.createElement(Harness));
  });
  await settle();
  return { container, root, calls };
}

function viewFor(container: Element) {
  const content = container.querySelector('[aria-label="cfg JSON"] .cm-content');
  assert.ok(content, "editor for cfg");
  const view = EditorView.findFromDOM(content as HTMLElement);
  assert.ok(view);
  return view;
}

async function type(container: Element, text: string) {
  const view = viewFor(container);
  await act(async () => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  });
  await settle();
}

const hintShown = (c: Element) => (c.textContent ?? "").includes("Invalid JSON");

test("F1 — typing valid JSON then clearing shows no hint and calls onChange(key, undefined)", async () => {
  const { container, root, calls } = await render();
  await type(container, '{"a":1}');
  assert.deepEqual(calls.at(-1), { cfg: { a: 1 } });
  await type(container, "");
  assert.equal(hintShown(container), false, "no Invalid JSON hint on empty");
  assert.ok(calls.length >= 2, "clearing must call onChange");
  const last = calls.at(-1);
  assert.ok(last && Object.hasOwn(last, "cfg") && last.cfg === undefined);
  await type(container, "{");
  assert.equal(hintShown(container), true, "malformed text still shows the hint");
  await act(async () => {
    root.unmount();
  });
});

test("F2 — the ƒx button lives inside the editor box, not the label row", async () => {
  const { container, root } = await render();
  const fx = container.querySelector('button[aria-label="Use an expression for Cfg"]');
  assert.ok(fx, "ƒx button renders when unbound and editable");
  assert.ok(fx.closest(".w6w-json-editor"), "descendant of the editor box wrapper");
  assert.equal(fx.closest(".w6w-field-labelrow"), null, "not in the label row");
  await act(async () => {
    root.unmount();
  });
});

test("F3 — read-only renders no ƒx", async () => {
  const { container, root } = await render({ readOnly: true });
  assert.equal(container.querySelector(".w6w-expr-fx"), null);
  await act(async () => {
    root.unmount();
  });
});

test("F4 — with copyable on, ƒx and the copy button are separate siblings with distinct offset rules", async () => {
  const { JsonEditor } = await import("../JsonEditor.tsx");
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(JsonEditor, {
        value: "{}",
        onChange: () => {},
        copyable: true,
        overlay: React.createElement("button", { className: "w6w-expr-fx", type: "button" }, "ƒx"),
      }),
    );
  });
  await settle();
  const fx = container.querySelector(".w6w-json-editor > .w6w-expr-fx");
  const copy = container.querySelector(".w6w-json-editor > .w6w-copyable-btn");
  assert.ok(fx && copy && fx !== copy, "both direct children of the editor box");
  // jsdom has no layout: pin the offset rule in the source stylesheet instead.
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../styles/_fx.scss", import.meta.url), "utf8");
  assert.match(
    css,
    /\.w6w-json-editor:has\(> \.w6w-copyable-btn\) > \.w6w-expr-fx\s*\{[^}]*right:/,
  );
  await act(async () => {
    root.unmount();
  });
});

test("F5 — clicking ƒx opens the expression editor", async () => {
  const { container, root } = await render();
  const fx = container.querySelector('button[aria-label="Use an expression for Cfg"]');
  assert.ok(fx);
  await act(async () => {
    fx.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  await settle();
  assert.ok(document.querySelector("dialog"), "expression modal mounts");
  await act(async () => {
    root.unmount();
  });
});
