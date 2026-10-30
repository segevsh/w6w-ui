// Run (from packages/ui): node --max-old-space-size=2048 --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/store-param.test.ts
//
// A `data-store` param renders a Combobox of listDataStores() names (labelled `name (kind)`)
// when the provider supplies the member; otherwise a plain text input, and never calls it.
// Mirrors `model-route-param.test.ts`'s JSDOM + react-dom/client rig.
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
const { ParamsForm } = await import("../ParamsForm.tsx");
const { ExpressionOptionsProvider } = await import("../components/ExpressionOptions.tsx");
const { W6WUIProvider, WorkflowProjectProvider } = await import("../provider.tsx");
type ActionParam = import("../types.ts").ActionParam;

const PARAM: ActionParam = { key: "store", label: "Store", type: "data-store" };

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function render(
  api: unknown | null,
  initial: Record<string, unknown> = {},
  project?: string,
) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const box = { current: initial };
  function Harness() {
    const [values, setValues] = React.useState(initial);
    const form = React.createElement(
      ExpressionOptionsProvider,
      { value: { steps: [], sampleValues: {} }, children: null },
      React.createElement(ParamsForm, {
        params: [PARAM],
        values,
        onChange: (next: Record<string, unknown>) => {
          box.current = next;
          setValues(next);
        },
      }),
    );
    const scoped = project
      ? React.createElement(WorkflowProjectProvider, { project, children: form })
      : form;
    return api
      ? React.createElement(W6WUIProvider, { api: api as never, children: scoped })
      : scoped;
  }
  await act(async () => {
    root.render(React.createElement(Harness));
  });
  await settle(5);
  return { container, box, root };
}

const STORES = [
  { name: "orders", kind: "table" },
  { name: "cache", kind: "kv" },
];

async function open(input: HTMLInputElement) {
  await act(async () => {
    input.focus();
    input.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    input.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
}

const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;

test("member present: called once, picking `orders (table)` sets the store NAME", async () => {
  let calls = 0;
  const { container, box, root } = await render({
    listDataStores: async () => {
      calls++;
      return STORES;
    },
  });
  assert.equal(calls, 1);
  const input = container.querySelector("input[role=combobox]") as HTMLInputElement | null;
  assert.ok(input, "combobox renders");
  await open(input);
  const labels = Array.from(document.querySelectorAll("[role=option]")).map((o) => o.textContent);
  assert.deepEqual(labels, ["orders (table)", "cache (kv)"]);
  const opt = Array.from(document.querySelectorAll("[role=option]")).find(
    (o) => o.textContent === "orders (table)",
  ) as HTMLElement | undefined;
  assert.ok(opt, "orders option exists");
  await act(async () => {
    opt.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    opt.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(box.current.store, "orders");
  await act(async () => root.unmount());
});

test("free text typed and blurred is a value (forceSelection off)", async () => {
  const { container, box, root } = await render({ listDataStores: async () => STORES });
  const input = container.querySelector("input[role=combobox]") as HTMLInputElement | null;
  assert.ok(input, "combobox renders");
  await act(async () => {
    input.focus();
    setter?.call(input, "unlisted");
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.blur();
    input.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
  assert.equal(box.current.store, "unlisted");
  await act(async () => root.unmount());
});

test("member absent (provider without it, and no provider): text input, no throw", async () => {
  for (const api of [{}, null]) {
    const { container, box, root } = await render(api);
    assert.equal(container.querySelector("[role=combobox]"), null);
    const input = container.querySelector("input[type=text]") as HTMLInputElement | null;
    assert.ok(input, "plain text input");
    await act(async () => {
      setter?.call(input, "my-store");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(box.current.store, "my-store");
    await act(async () => root.unmount());
  }
});

test("a saved expression value still renders without throwing (member present)", async () => {
  const { container, root } = await render(
    { listDataStores: async () => STORES },
    { store: { $: "steps.a.output.store" } },
  );
  assert.ok(container.querySelector("input, button"));
  await act(async () => root.unmount());
});

test("the editor's project is handed to listDataStores, and its stores are what the picker lists", async () => {
  const seen: (string | undefined)[] = [];
  const byProject: Record<string, typeof STORES> = {
    p1: [{ name: "p1-store", kind: "kv" }],
    p2: [{ name: "p2-store", kind: "table" }],
  };
  const api = {
    listDataStores: async (project?: string) => {
      seen.push(project);
      return byProject[project ?? ""] ?? [];
    },
  };
  const { container, root } = await render(api, {}, "p2");
  const input = container.querySelector("input[role=combobox]") as HTMLInputElement | null;
  assert.ok(input, "combobox renders inside the editor's project scope");
  await open(input);
  assert.deepEqual(seen, ["p2"]);
  const options = Array.from(document.querySelectorAll("[role=option]")).map((o) => o.textContent);
  assert.deepEqual(options, ["p2-store (table)"]);
  await act(async () => root.unmount());
});
