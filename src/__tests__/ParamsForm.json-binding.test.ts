// Run (from packages/ui): node --experimental-strip-types --import ./src/test-jsx-loader.mjs --test src/__tests__/ParamsForm.json-binding.test.ts
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
const GROUP_PARAM: ActionParam = { key: "grp", label: "Grp", type: "group" };

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
        value: opts.options ?? { steps: STEPS, sampleValues: { "steps.a.output": SAMPLE } },
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
const byText = (t: string) => buttons().filter((b) => b.textContent?.trim() === t);
const entireRows = () =>
  buttons().filter((b) => b.textContent?.includes("Entire output")) as HTMLButtonElement[];
const hasEditor = (c: Element, key: string) => !!c.querySelector(`[aria-label="${key} JSON"]`);

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

test("Acc1 - one fx on a json and on a childless group; Entire output per step; binds {$}", async () => {
  const { container, root, box } = await render([JSON_PARAM, GROUP_PARAM]);
  assert.equal(fxButtons().length, 2);
  for (const b of fxButtons()) {
    assert.equal(b.getAttribute("title"), "Use an expression");
    assert.match(b.getAttribute("aria-label") ?? "", /^Use an expression for (Cfg|Grp)$/);
  }
  await click(fxButtons()[0]);
  const rows = entireRows();
  assert.equal(rows.length, 3, "one Entire output per step (declared, none, needsTest)");
  const names = rows.map((r) => r.getAttribute("aria-label"));
  assert.equal(new Set(names).size, 3, "distinct accessible names");
  const text = doc().body.textContent ?? "";
  for (const hidden of ["Variables", "Secrets", "Documents", "Inputs"]) {
    assert.ok(!text.includes(hidden), `${hidden} group hidden`);
  }
  assert.equal(byText("Save").length, 0);
  assert.equal(byText("Use a plain value").length, 0);
  assert.equal(doc().querySelectorAll("dialog [contenteditable]").length, 0);
  assert.equal(doc().querySelectorAll('[data-testid="expr-copy-to-editor"]').length, 0);

  await click(rows.find((r) => r.getAttribute("aria-label") === "Entire output of Step B"));
  assert.equal(box.calls, 1);
  const v = box.current.cfg as Record<string, unknown>;
  assert.deepEqual(v, { $: "steps.b.output" });
  assert.deepEqual(Object.keys(v), ["$"]);
  assert.equal(typeof v.$, "string");
  assert.ok(!("type" in v) && !("parts" in v));
  await unmount(root);
  void container;
});

test("Acc1 - a field leaf binds steps.<id>.output.<key>", async () => {
  const { root, box } = await render([JSON_PARAM]);
  await click(fxButtons()[0]);
  await click(doc().querySelector('[data-testid="expr-caret-fields"]') ?? undefined);
  const leaf = buttons().find((b) => b.textContent?.includes("a.id"));
  await click(leaf);
  assert.deepEqual(box.current.cfg, { $: "steps.a.output.id" });
  await unmount(root);
});

test("Acc1 - no workflow state renders 'No upstream steps'", async () => {
  const { root } = await render([JSON_PARAM], {}, { options: {} });
  await click(fxButtons()[0]);
  assert.ok((doc().body.textContent ?? "").includes("No upstream steps"));
  await unmount(root);
});

test("Acc2 - Cancel from fx and from Edit writes nothing; invalid draft is byte-identical", async () => {
  const { container, root, box } = await render([JSON_PARAM]);
  await typeDraft(container, "cfg", '{"a": ');
  const before = draftOf(container, "cfg");
  assert.equal(before, '{"a": ');
  const calls0 = box.calls;
  await click(fxButtons()[0]);
  await click(byText("Cancel")[0]);
  assert.equal(box.calls, calls0);
  assert.equal(draftOf(container, "cfg"), before);

  // Edit -> Cancel on a bound value
  await unmount(root);
  const r2 = await render([JSON_PARAM], { cfg: { $: "steps.a.output" } });
  await click(byText("Edit")[0]);
  await click(byText("Cancel")[0]);
  assert.equal(r2.box.calls, 0);
  assert.deepEqual(r2.box.current.cfg, { $: "steps.a.output" });
  await unmount(r2.root);
});

test("Acc3 - bound row: ref, Edit, Clear, preview, no editor; Edit rebinds; Clear restores draft", async () => {
  const { container, root, box } = await render([JSON_PARAM]);
  await typeDraft(container, "cfg", '{"keep": [1, 2]}');
  await click(fxButtons()[0]);
  await click(entireRows()[0]);
  assert.deepEqual(box.current.cfg, { $: "steps.a.output" });
  assert.ok((container.textContent ?? "").includes("steps.a.output"));
  assert.equal(byText("Edit").length, 1);
  assert.equal(byText("Clear").length, 1);
  assert.equal(fxButtons().length, 0, "Edit replaces fx");
  assert.equal(hasEditor(container, "cfg"), false);
  const pre = container.querySelector('[data-testid="json-binding-preview"]');
  assert.equal(pre?.textContent, JSON.stringify(SAMPLE, null, 2));

  await click(byText("Edit")[0]);
  await click(entireRows().find((r) => r.getAttribute("aria-label") === "Entire output of Step B"));
  assert.deepEqual(box.current.cfg, { $: "steps.b.output" });
  assert.equal(
    container.querySelector('[data-testid="json-binding-preview"]')?.textContent,
    JSON.stringify("<unresolved: steps.b.output>"),
  );

  const callsBefore = box.calls;
  await click(byText("Clear")[0]);
  assert.equal(box.calls, callsBefore + 1, "Clear fires onChange exactly once");
  assert.deepEqual(box.current.cfg, { keep: [1, 2] });
  assert.equal(draftOf(container, "cfg"), '{"keep": [1, 2]}', "draft byte-identical");
  await unmount(root);
});

test("Acc3 - no sample -> unresolved token; Clear with an empty draft -> undefined", async () => {
  const { container, root, box } = await render([JSON_PARAM]);
  await click(fxButtons()[0]);
  await click(entireRows().find((r) => r.getAttribute("aria-label") === "Entire output of Step C"));
  assert.ok(
    (container.querySelector('[data-testid="json-binding-preview"]')?.textContent ?? "").includes(
      "<unresolved: steps.c.output>",
    ),
  );
  await click(byText("Clear")[0]);
  assert.equal(box.current.cfg, undefined);
  await unmount(root);
});

test("Acc4 - saved + reloaded bound value renders bound, fires nothing, Clear -> undefined", async () => {
  const saved = { cfg: { $: "steps.a.output" } };
  for (const clone of [
    JSON.parse(JSON.stringify(saved)) as Record<string, unknown>,
    structuredClone(saved),
  ]) {
    const { container, root, box } = await render([JSON_PARAM], clone);
    assert.equal(box.calls, 0);
    assert.equal(byText("Clear").length, 1);
    assert.equal(hasEditor(container, "cfg"), false);
    await click(byText("Clear")[0]);
    assert.equal(box.current.cfg, undefined);
    await unmount(root);
  }
});

test("Acc5 - readOnly: no fx/Edit/Clear in either state; bound row and preview still render", async () => {
  const a = await render([JSON_PARAM], {}, { readOnly: true });
  assert.equal(fxButtons().length, 0);
  await unmount(a.root);
  const b = await render([JSON_PARAM], { cfg: { $: "steps.a.output" } }, { readOnly: true });
  assert.equal(fxButtons().length, 0);
  assert.equal(byText("Edit").length, 0);
  assert.equal(byText("Clear").length, 0);
  assert.ok((b.container.textContent ?? "").includes("steps.a.output"));
  assert.ok(b.container.querySelector('[data-testid="json-binding-preview"]'));
  await unmount(b.root);
});

test("Acc5 - literal edit still pushes the parsed object; nested {$} stays literal", async () => {
  const { container, root, box } = await render([JSON_PARAM]);
  await typeDraft(container, "cfg", '{"x": 1}');
  assert.deepEqual(box.current.cfg, { x: 1 });
  await unmount(root);
  const nested = await render([JSON_PARAM], { cfg: { outer: { $: "steps.a.output" } } });
  assert.equal(hasEditor(nested.container, "cfg"), true, "editor stays mounted");
  assert.equal(byText("Clear").length, 0);
  assert.equal(fxButtons().length, 1);
  await unmount(nested.root);
});

test("C2 - a bound NESTED path resolves from the whole-output sample", async () => {
  const { container, root } = await render([JSON_PARAM], { cfg: { $: "steps.a.output.id" } });
  assert.equal(byText("Clear").length, 1, "rendered as bound");
  assert.equal(
    container.querySelector('[data-testid="json-binding-preview"]')?.textContent,
    JSON.stringify("123"),
    "steps.a.output.id walks the sample of steps.a.output",
  );
  await unmount(root);
});

test("C3 - a non-string `$` is a literal object, not a binding", async () => {
  const { container, root } = await render([JSON_PARAM], { cfg: { $: 5 } });
  assert.equal(hasEditor(container, "cfg"), true, "editor stays mounted");
  assert.equal(byText("Clear").length, 0, "no bound row");
  assert.equal(container.querySelector('[data-testid="json-binding-preview"]') === null, true);
  await unmount(root);
});

test("C4 - a childless group binds, shows the bound row, and Clear returns to the literal editor", async () => {
  const { container, root, box } = await render([GROUP_PARAM]);
  await click(fxButtons()[0]);
  await click(entireRows()[0]);
  assert.deepEqual(box.current.grp, { $: "steps.a.output" });
  assert.equal(byText("Clear").length, 1, "bound row renders");
  assert.equal(hasEditor(container, "grp"), false);
  await click(byText("Clear")[0]);
  assert.equal(byText("Clear").length, 0, "back to literal");
  assert.equal(hasEditor(container, "grp"), true, "editor remounted");
  await unmount(root);
});

const hintShown = (c: Element) => (c.textContent ?? "").includes("Invalid JSON");

test("I-1 - invalid draft: hint hides while bound to fx, returns after Clear, draft byte-identical", async () => {
  const { container, root } = await render([JSON_PARAM]);
  await typeDraft(container, "cfg", '{"a": ');
  assert.equal(hintShown(container), true, "hint present for the invalid draft");
  await click(fxButtons()[0]);
  await click(entireRows()[0]);
  assert.equal(hintShown(container), false, "hint absent while bound");
  await click(byText("Clear")[0]);
  assert.equal(hintShown(container), true, "hint present again after Clear");
  assert.equal(draftOf(container, "cfg"), '{"a": ', "draft byte-identical");
  await unmount(root);
});

test("I-1 - valid draft: bind then Clear shows no hint", async () => {
  const { container, root } = await render([JSON_PARAM]);
  await typeDraft(container, "cfg", '{"a": 1}');
  assert.equal(hintShown(container), false);
  await click(fxButtons()[0]);
  await click(entireRows()[0]);
  assert.equal(hintShown(container), false);
  await click(byText("Clear")[0]);
  assert.equal(hintShown(container), false);
  await unmount(root);
});
