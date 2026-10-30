// Run (from packages/ui): node --experimental-strip-types --import ./src/test-jsx-loader.mjs --test src/__tests__/ParamsForm.whole-hidden.test.ts
//
// T2.2.1 - Items whole-value binding, hidden params, fresh foreach validity. Rig copied from
// ParamsForm.json-binding.test.ts / StepBuilderModal.commit.test.ts (not imported).
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
const { ControlStepConfig, requiredParamsFilled } = await import("../StepBuilderModal.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
const { CONTROL_APP, internalNodeDef, internalNodeDefaults } = await import("../flow-types.ts");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;
const { ExpressionOptionsProvider } = await import("../components/ExpressionOptions.tsx");
type ActionParam = import("../types.ts").ActionParam;
type ExpressionOptions = import("../components/ExpressionOptions.tsx").ExpressionOptions;

const STEPS: ExpressionOptions["steps"] = [
  {
    id: "a",
    label: "Step A",
    outputs: [{ key: "id" }, { key: "name" }],
    outputsFrom: "declared",
  },
  { id: "b", label: "Step B" },
  { id: "c", label: "Step C", needsTest: true },
];
const SAMPLE = { id: "123", n: { x: [1, null, true, 0, ""] } };

const JSON_PARAM: ActionParam = { key: "cfg", label: "Cfg", type: "json" };

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function render(
  params: ActionParam[],
  initial: Record<string, unknown> = {},
  opts: { readOnly?: boolean; options?: ExpressionOptions } = {},
) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const box: { current: Record<string, unknown>; calls: number } = { current: initial, calls: 0 };
  function Harness() {
    const [values, setValues] = React.useState(initial);
    return React.createElement(
      ExpressionOptionsProvider,
      {
        value: opts.options ?? {
          steps: STEPS,
          sampleValues: { "steps.a.output": SAMPLE, "nodes.a.output": SAMPLE },
        },
        children: null,
      },
      React.createElement(ParamsForm, {
        params,
        values,
        readOnly: opts.readOnly,
        onChange: (next: Record<string, unknown>) => {
          box.current = next;
          box.calls++;
          setValues(next);
        },
      }),
    );
  }
  await act(async () => {
    root.render(React.createElement(Harness));
  });
  await settle();
  return { container, root, box };
}

const doc = () => dom.window.document;
const buttons = () => Array.from(doc().querySelectorAll("button")) as HTMLButtonElement[];
const fxButtons = () => buttons().filter((b) => b.classList.contains("w6w-expr-fx"));
const entireRows = () =>
  buttons().filter((b) => b.textContent?.includes("Entire output")) as HTMLButtonElement[];

async function click(el: Element | undefined) {
  assert.ok(el, "element to click must exist");
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

function viewFor(container: Element, key: string) {
  const content = container.querySelector(`[aria-label="${key} JSON"] .cm-content`);
  assert.ok(content, `editor for ${key}`);
  const view = EditorView.findFromDOM(content as HTMLElement);
  assert.ok(view);
  return view;
}

async function typeDraft(container: Element, key: string, text: string) {
  const view = viewFor(container, key);
  await act(async () => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    await new Promise((r) => setTimeout(r, 250));
  });
}

const draftOf = (container: Element, key: string) => viewFor(container, key).state.doc.toString();
const unmount = async (root: { unmount(): void }) => {
  await act(async () => root.unmount());
};

const rowNamed = (name: string) => entireRows().find((r) => r.getAttribute("aria-label") === name);
const FOREACH = internalNodeDef(CONTROL_APP, "foreach");
assert.ok(FOREACH, "foreach def");
const FE_PARAMS = FOREACH.params;
const REF = "{{ nodes.a.output }}";

function fakeApi() {
  return {
    listApps: async () => [],
    getAppAuth: async () => [],
    listConnectionsForApp: async () => [],
    listConnections: async () => [],
    getAppActions: async () => [],
    listSavedTests: async () => [],
    listStepTests: async () => [],
  } as unknown as W6WApi;
}

/** Open the picker on `items` and click "Entire output of Step A". */
async function pickEntire(params: ActionParam[], key: string, initial: Record<string, unknown>) {
  const r = await render(params, initial);
  await click(fxButtons()[0]);
  await click(rowNamed("Entire output of Step A"));
  await settle(20);
  void key;
  return r;
}
const dialogOpen = () => doc().querySelector('dialog [aria-label="Compose JSON"]') !== null;

for (const [name, initial] of [
  ["[]", { items: [] }],
  ["{}", { items: {} }],
  ["unset", {}],
] as Array<[string, Record<string, unknown>]>) {
  test(`Acc1 - whole Items ${name}: one click stores the bare ref and closes`, async () => {
    const { root, box } = await pickEntire(FE_PARAMS, "items", initial);
    assert.equal(box.calls, 1);
    assert.equal(box.current.items, REF);
    assert.equal(dialogOpen(), false, "dialog closed");
    await unmount(root);
  });
}

test("Acc1 - whole Items [1]: click composes into the draft, saves nothing", async () => {
  const { root, box } = await pickEntire(FE_PARAMS, "items", { items: [1] });
  assert.equal(box.calls, 0);
  assert.ok(dialogOpen());
  const draft = JSON.parse(
    draftOf(doc().body, "Compose").replace(/"\{\{ nodes\.a\.output \}\}"/, '"X"'),
  );
  assert.deepEqual(draft, [1, "X"]);
  assert.ok(draftOf(doc().body, "Compose").includes(REF));
  await unmount(root);
});

test("Acc1 - typing a literal [1,2] inline still stores [1,2]", async () => {
  const { container, root, box } = await render(FE_PARAMS, {});
  await typeDraft(container, "items", "[1,2]");
  assert.deepEqual(box.current.items, [1, 2]);
  await unmount(root);
});

test("Acc1 - regression: a NON-whole json param with [] still composes", async () => {
  const { root, box } = await pickEntire([JSON_PARAM], "cfg", { cfg: [] });
  assert.equal(box.calls, 0);
  assert.deepEqual(JSON.parse(draftOf(doc().body, "Compose")), [REF]);
  await unmount(root);
});

const SIBLING: ActionParam = { key: "vis", label: "Visible", type: "string" };
const HIDDEN: ActionParam = { key: "hid", label: "Hiddenfield", type: "string", hidden: true };

test("Acc2a - hidden param renders no field at top level or in a section", async () => {
  const section: ActionParam = {
    key: "sec",
    label: "Sec",
    type: "section",
    section: "collapsible",
    children: [SIBLING, { ...HIDDEN, key: "hidIn", label: "Hiddeninner" }],
  } as ActionParam;
  const { container, root } = await render([SIBLING, HIDDEN, section]);
  const text = container.textContent ?? "";
  assert.ok(text.includes("Visible"), "positive control: visible sibling");
  assert.ok(!text.includes("Hiddenfield"), "top-level hidden param not rendered");
  assert.ok(!text.includes("Hiddeninner"), "section hidden param not rendered");
  await unmount(root);
});

test("Acc2b - a hidden required param never gates requiredParamsFilled", () => {
  assert.equal(
    requiredParamsFilled([{ key: "x", type: "string", required: true, hidden: true }], {}),
    true,
  );
});

test("Acc2c/3 - ControlStepConfig with real foreach: Items only; mount-commit with is {}", async () => {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const adds: Array<{ with?: unknown }> = [];
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api: fakeApi(),
        children: React.createElement(ControlStepConfig, {
          node: FOREACH,
          onAdd: (s: { with?: unknown }) => {
            adds.push(s);
            return "fe_1";
          },
          onClose: () => {},
          onDraftChange: () => {},
        } as never),
      }),
    );
  });
  assert.ok(container.querySelector('[aria-label="items JSON"]'), "Items field rendered");
  assert.equal(container.querySelector('[aria-label="body JSON"]'), null);
  assert.equal(container.querySelector('[aria-label="parallelism JSON"]'), null);
  const text = container.textContent ?? "";
  assert.ok(!/\bBody\b/.test(text), "no Body label");
  assert.ok(!/\bParallelism\b/.test(text), "no Parallelism label");
  assert.equal(adds.length, 1);
  assert.deepEqual(adds[0]?.with, {});
  await act(async () => root.unmount());
});

test("Acc2d - an Items edit preserves hidden body/parallelism", async () => {
  const { container, root, box } = await render(FE_PARAMS, { body: ["s1"], parallelism: 1 });
  await typeDraft(container, "items", "[1]");
  assert.deepEqual(box.current.items, [1]);
  assert.deepEqual(box.current.body, ["s1"]);
  assert.equal(box.current.parallelism, 1);
  await unmount(root);
});

test("Acc3 - fresh foreach is invalid until Items is set", () => {
  assert.deepEqual(internalNodeDefaults(CONTROL_APP, "foreach"), {});
  assert.equal(requiredParamsFilled(FE_PARAMS, {}), false);
  assert.equal(requiredParamsFilled(FE_PARAMS, { items: "{{ nodes.a.output.tickets }}" }), true);
});
