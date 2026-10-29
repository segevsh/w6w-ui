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

// The bound field: one var chip (data-ref), its × (Clear) and the ƒx (Edit).
const chipRef = (c: Element) =>
  c.querySelector('[data-testid="json-binding-ref"] .w6w-expr-chip')?.getAttribute("data-ref");
const editBtns = () =>
  buttons().filter((b) => (b.getAttribute("aria-label") ?? "").startsWith("Edit expression for "));
const clearBtns = () =>
  buttons().filter((b) =>
    (b.getAttribute("aria-label") ?? "").startsWith("Remove the reference from "),
  );
const rowNamed = (name: string) => entireRows().find((r) => r.getAttribute("aria-label") === name);
/** Pick a source in the open picker and Save: what binding the field takes now. */
async function pick(row: Element | undefined) {
  await click(row);
  await settle(20);
  await click(byText("Save")[0]);
}

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
  for (const hidden of ["Secrets", "Documents", "Inputs"]) {
    assert.ok(!text.includes(hidden), `${hidden} group hidden`);
  }
  assert.ok(text.includes("Variables"), "Variables group shown");
  // The compose pane: a JSON editor and its Save — no chips editor, no plain-value exit.
  assert.equal(byText("Save").length, 1);
  assert.equal(byText("Save")[0].disabled, true, "nothing composed yet");
  assert.equal(byText("Use a plain value").length, 0);
  assert.ok(doc().querySelector('dialog [aria-label="Compose JSON"]'));
  assert.equal(doc().querySelectorAll('dialog [aria-label="Expression"]').length, 0);
  assert.equal(doc().querySelectorAll('[data-testid="expr-copy-to-editor"]').length, 0);

  // A click inserts — it writes nothing and keeps the picker open until Save.
  await click(rowNamed("Entire output of Step B"));
  assert.equal(box.calls, 0);
  assert.equal(draftOf(doc().body, "Compose"), '{ "$": "nodes.b.output" }');
  await click(byText("Save")[0]);
  assert.equal(box.calls, 1);
  const v = box.current.cfg as Record<string, unknown>;
  assert.deepEqual(v, { $: "nodes.b.output" });
  assert.deepEqual(Object.keys(v), ["$"]);
  await unmount(root);
  void container;
});

test("Acc1 - a field leaf binds nodes.<id>.output.<key>", async () => {
  const { root, box } = await render([JSON_PARAM]);
  await click(fxButtons()[0]);
  await click(doc().querySelector('[data-testid="expr-caret-fields"]') ?? undefined);
  await pick(buttons().find((b) => b.textContent?.includes("a.id")));
  assert.deepEqual(box.current.cfg, { $: "nodes.a.output.id" });
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
  await click(rowNamed("Entire output of Step A"));
  await click(byText("Cancel")[0]);
  assert.equal(box.calls, calls0);
  assert.equal(draftOf(container, "cfg"), before);

  await unmount(root);
  const r2 = await render([JSON_PARAM], { cfg: { $: "nodes.a.output" } });
  await click(editBtns()[0]);
  await click(byText("Cancel")[0]);
  assert.equal(r2.box.calls, 0);
  assert.deepEqual(r2.box.current.cfg, { $: "nodes.a.output" });
  await unmount(r2.root);
});

test("Acc3 - bound field: one chip, ƒx and ×, no preview box; Edit rebinds; × restores the draft", async () => {
  const { container, root, box } = await render([JSON_PARAM]);
  await typeDraft(container, "cfg", '{"keep": [1, 2]}');
  await click(fxButtons()[0]);
  await pick(entireRows()[0]);
  assert.deepEqual(box.current.cfg, { $: "nodes.a.output" });
  assert.equal(chipRef(container), "nodes.a.output");
  assert.equal(editBtns().length, 1);
  assert.equal(clearBtns().length, 1);
  assert.equal(fxButtons().length, 0, "the chip row's ƒx replaces the literal field's");
  assert.equal(hasEditor(container, "cfg"), false);
  assert.equal(container.querySelector("pre"), null, "no resolved-JSON preview");
  assert.equal(byText("Edit").length + byText("Clear").length, 0, "no text buttons");

  // Edit opens on the bound ref; an untouched draft is replaced by the next pick.
  await click(editBtns()[0]);
  assert.equal(draftOf(doc().body, "Compose").replace(/\s/g, ""), '{"$":"nodes.a.output"}');
  await pick(rowNamed("Entire output of Step B"));
  assert.deepEqual(box.current.cfg, { $: "nodes.b.output" });
  assert.equal(chipRef(container), "nodes.b.output");

  const callsBefore = box.calls;
  await click(clearBtns()[0]);
  assert.equal(box.calls, callsBefore + 1, "× fires onChange exactly once");
  assert.deepEqual(box.current.cfg, { keep: [1, 2] });
  assert.equal(draftOf(container, "cfg"), '{"keep": [1, 2]}', "draft byte-identical");
  await unmount(root);
});

test("Acc3 - × with an empty draft -> undefined", async () => {
  const { root, box } = await render([JSON_PARAM]);
  await click(fxButtons()[0]);
  await pick(rowNamed("Entire output of Step C"));
  assert.deepEqual(box.current.cfg, { $: "nodes.c.output" });
  await click(clearBtns()[0]);
  assert.equal(box.current.cfg, undefined);
  await unmount(root);
});

test("Acc4 - saved + reloaded bound value renders bound, fires nothing, × -> undefined", async () => {
  const saved = { cfg: { $: "nodes.a.output" } };
  for (const clone of [
    JSON.parse(JSON.stringify(saved)) as Record<string, unknown>,
    structuredClone(saved),
  ]) {
    const { container, root, box } = await render([JSON_PARAM], clone);
    assert.equal(box.calls, 0);
    assert.equal(chipRef(container), "nodes.a.output");
    assert.equal(hasEditor(container, "cfg"), false);
    await click(clearBtns()[0]);
    assert.equal(box.current.cfg, undefined);
    await unmount(root);
  }
});

test("Acc5 - readOnly: no ƒx/×; the bound chip still renders", async () => {
  const a = await render([JSON_PARAM], {}, { readOnly: true });
  assert.equal(fxButtons().length, 0);
  await unmount(a.root);
  const b = await render([JSON_PARAM], { cfg: { $: "nodes.a.output" } }, { readOnly: true });
  assert.equal(fxButtons().length + editBtns().length + clearBtns().length, 0);
  assert.equal(chipRef(b.container), "nodes.a.output");
  await unmount(b.root);
});

test("Acc5 - literal edit still pushes the parsed object; nested {$} stays in the editor", async () => {
  const { container, root, box } = await render([JSON_PARAM]);
  await typeDraft(container, "cfg", '{"x": 1}');
  assert.deepEqual(box.current.cfg, { x: 1 });
  await unmount(root);
  const nested = await render([JSON_PARAM], { cfg: { outer: { $: "nodes.a.output" } } });
  assert.equal(hasEditor(nested.container, "cfg"), true, "editor stays mounted");
  assert.equal(clearBtns().length, 0);
  assert.equal(fxButtons().length, 1);
  await unmount(nested.root);
});

test("C2 - a bound nested path renders as its chip", async () => {
  const { container, root } = await render([JSON_PARAM], { cfg: { $: "nodes.a.output.id" } });
  assert.equal(chipRef(container), "nodes.a.output.id");
  await unmount(root);
});

test("C3 - a non-string `$` is a literal object, not a binding", async () => {
  const { container, root } = await render([JSON_PARAM], { cfg: { $: 5 } });
  assert.equal(hasEditor(container, "cfg"), true, "editor stays mounted");
  assert.equal(chipRef(container), undefined, "no bound chip");
  await unmount(root);
});

test("C4 - a childless group binds, shows the chip, and × returns to the literal editor", async () => {
  const { container, root, box } = await render([GROUP_PARAM]);
  await click(fxButtons()[0]);
  await pick(entireRows()[0]);
  assert.deepEqual(box.current.grp, { $: "nodes.a.output" });
  assert.equal(clearBtns().length, 1, "bound chip renders");
  assert.equal(hasEditor(container, "grp"), false);
  await click(clearBtns()[0]);
  assert.equal(clearBtns().length, 0, "back to literal");
  assert.equal(hasEditor(container, "grp"), true, "editor remounted");
  await unmount(root);
});

const hintShown = (c: Element) => (c.textContent ?? "").includes("Invalid JSON");

test("I-1 - invalid draft: hint hides while bound, returns after ×, draft byte-identical", async () => {
  const { container, root } = await render([JSON_PARAM]);
  await typeDraft(container, "cfg", '{"a": ');
  assert.equal(hintShown(container), true, "hint present for the invalid draft");
  await click(fxButtons()[0]);
  await pick(entireRows()[0]);
  assert.equal(hintShown(container), false, "hint absent while bound");
  await click(clearBtns()[0]);
  assert.equal(hintShown(container), true, "hint present again after ×");
  assert.equal(draftOf(container, "cfg"), '{"a": ', "draft byte-identical");
  await unmount(root);
});

test("I-1 - valid draft: bind then × shows no hint", async () => {
  const { container, root } = await render([JSON_PARAM]);
  await typeDraft(container, "cfg", '{"a": 1}');
  assert.equal(hintShown(container), false);
  await click(fxButtons()[0]);
  await pick(entireRows()[0]);
  assert.equal(hintShown(container), false);
  await click(clearBtns()[0]);
  assert.equal(hintShown(container), false);
  await unmount(root);
});

test("C5 - compose: a click into a blank draft is a $ ref; Result previews it; Save binds", async () => {
  const { root, box } = await render([JSON_PARAM]);
  await click(fxButtons()[0]);
  await click(rowNamed("Entire output of Step A"));
  await settle(50);
  assert.equal(draftOf(doc().body, "Compose"), '{ "$": "nodes.a.output" }');
  const result = doc().querySelector('[data-testid="expr-json-result"]')?.textContent ?? "";
  assert.deepEqual(JSON.parse(result), SAMPLE);
  assert.equal(box.calls, 0, "inserting writes nothing until Save");
  await click(byText("Save")[0]);
  assert.deepEqual(box.current.cfg, { $: "nodes.a.output" });
  await unmount(root);
});

test("C6 - compose: Save stores an object mixing literals, $ refs and {{ }} strings", async () => {
  const { root, box } = await render([JSON_PARAM], { cfg: { companyId: "c1" } });
  await click(fxButtons()[0]);
  assert.deepEqual(JSON.parse(draftOf(doc().body, "Compose")), { companyId: "c1" });
  const composed = {
    companyId: "c1",
    app: { $: "nodes.a.meta.app" },
    label: "event {{ nodes.a.output.id }}",
  };
  await typeDraft(doc().body, "Compose", JSON.stringify(composed));
  const result = JSON.parse(
    doc().querySelector('[data-testid="expr-json-result"]')?.textContent ?? "",
  );
  assert.equal(result.companyId, "c1");
  assert.equal(result.label, "event 123");
  await click(byText("Save")[0]);
  assert.deepEqual(box.current.cfg, composed);
  await unmount(root);
});

/** Put the caret at `pos` of the compose pane the way an author does: focus it, then move. */
async function caretAt(pos: number) {
  const view = viewFor(doc().body, "Compose");
  await act(async () => {
    view.contentDOM.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
    view.dispatch({ selection: { anchor: pos } });
  });
}

test("C7 - once the author has worked in the draft, a click inserts at the caret", async () => {
  const { root } = await render([JSON_PARAM]);
  await click(fxButtons()[0]);
  await typeDraft(doc().body, "Compose", '{ "label": "id: ", "connectionId":  }');
  const text = draftOf(doc().body, "Compose");
  // Inside a string: interpolate.
  await caretAt(text.indexOf('", "connectionId"'));
  await click(rowNamed("Entire output of Step A"));
  let now = draftOf(doc().body, "Compose");
  assert.equal(now, '{ "label": "id: {{ nodes.a.output }}", "connectionId":  }');
  // Where a value goes: a $ object, and the rest of the draft is kept.
  await caretAt(now.lastIndexOf(":") + 2);
  await click(rowNamed("Entire output of Step B"));
  now = draftOf(doc().body, "Compose");
  assert.deepEqual(JSON.parse(now), {
    label: "id: {{ nodes.a.output }}",
    connectionId: { $: "nodes.b.output" },
  });
  await unmount(root);
});

test("C8 - an app step's Metadata leaves are offered and insert like any source", async () => {
  const { root, box } = await render(
    [JSON_PARAM],
    {},
    {
      options: { steps: [{ id: "ev", label: "Get event", hasMeta: true }] },
    },
  );
  await click(fxButtons()[0]);
  await click(doc().querySelector('[data-testid="expr-meta-toggle"]') as Element);
  const leafLabels = Array.from(
    doc().querySelectorAll('[data-testid="expr-meta-fields"] .w6w-exprmodal-source-label'),
  ).map((b) => b.textContent?.trim());
  assert.deepEqual(leafLabels, ["All metadata", "App", "App version", "Action", "Connection ID"]);
  const app = Array.from(
    doc().querySelectorAll('[data-testid="expr-meta-fields"] .w6w-exprmodal-source'),
  ).find((b) => b.querySelector(".w6w-exprmodal-source-label")?.textContent?.trim() === "App");
  await pick(app);
  assert.deepEqual(box.current.cfg, { $: "nodes.ev.meta.app" });
  await unmount(root);
});

test("C9 - a field typed as one bare {{ ref }} becomes that binding when it loses focus", async () => {
  const { container, root, box } = await render([JSON_PARAM]);
  await typeDraft(container, "cfg", "{{ nodes.a.output }}");
  assert.equal(box.calls, 0, "no binding while typing");
  const content = container.querySelector('[aria-label="cfg JSON"] .cm-content') as HTMLElement;
  await act(async () => {
    content.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
  await settle();
  assert.deepEqual(box.current.cfg, { $: "nodes.a.output" });
  await unmount(root);
});
