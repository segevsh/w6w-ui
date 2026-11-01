// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/DataEntryEditor.test.ts
import assert from "node:assert/strict";
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
(dom.window as unknown as Record<string, unknown>).matchMedia = (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});

// A CodeMirror 6 mount (the doc kind's JsonEditor) needs these three, as in
// `src/__tests__/JsonEditor.copy.test.ts`.
g.Window = dom.window.Window;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
(dom.window as unknown as Record<string, unknown>).requestAnimationFrame = raf;
(dom.window as unknown as Record<string, unknown>).cancelAnimationFrame = (id: number) =>
  clearTimeout(id as unknown as NodeJS.Timeout);

// jsdom does not implement the native dialog API used by the shared modal.
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");

const { DataEntryEditor } = await import("../DataEntryEditor.tsx");

type Calls = Record<string, unknown[]>;
function mount(props: Record<string, unknown>, calls: Calls = {}) {
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls[name] = [...(calls[name] ?? []), args.length === 1 ? args[0] : args];
    };
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  act(() =>
    root.render(
      React.createElement(DataEntryEditor, {
        kind: "kv",
        isNew: false,
        entryKey: "k1",
        text: "hello",
        onTextChange: rec("text"),
        onKeyChange: rec("key"),
        onSave: rec("save"),
        onCancel: rec("cancel"),
        onReload: rec("reload"),
        ...props,
      } as never),
    ),
  );
  return container;
}

const tid = (c: Element, id: string) => c.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
function type(el: HTMLInputElement, text: string) {
  act(() => {
    const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")
      ?.set as (v: string) => void;
    set.call(el, text);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
const buttonNamed = (c: Element, name: string) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent === name) as HTMLElement;

test("kv: value input fires onTextChange per edit; doc renders the JSON editor instead", () => {
  const calls: Calls = {};
  const c = mount({}, calls);
  type(tid(c, "entry-value") as HTMLInputElement, "bye");
  assert.deepEqual(calls.text, ["bye"]);
  assert.equal(c.querySelector(".w6w-json-editor"), null);
  const d = mount({ kind: "doc", text: "{}" });
  assert.equal(tid(d, "entry-value"), null, "doc has no kv input");
  assert.ok(d.querySelector(".w6w-json-editor"), "doc renders JsonEditor");
  assert.ok(d.querySelector('dialog[open][aria-label="Edit document"] .w6w-json-editor'));
  assert.equal(d.querySelectorAll("h3").length, 1, "the modal owns the heading");
});

test("new mode: key input fires onKeyChange; existing mode shows version and expiry", () => {
  const calls: Calls = {};
  const n = mount({ isNew: true, newKey: "" }, calls);
  type(tid(n, "entry-new-key") as HTMLInputElement, "fresh");
  assert.deepEqual(calls.key, ["fresh"]);
  const e = mount({ version: 4, expiresAt: "2030-01-01T00:00:00Z" });
  assert.equal(tid(e, "entry-new-key"), null);
  assert.match(e.textContent ?? "", /v4/);
  assert.match(e.textContent ?? "", /Expires 2030-01-01/);
  assert.doesNotMatch(mount({ version: 4 }).textContent ?? "", /Expires/);
});

test("error renders entry-value-error; absent otherwise", () => {
  const c = mount({ error: "bad value" });
  assert.equal(tid(c, "entry-value-error").textContent, "bad value");
  assert.equal(tid(mount({}), "entry-value-error"), null);
});

test("conflict: prompt with copy, Reload fires, Save disabled", () => {
  const calls: Calls = {};
  const c = mount({ conflict: true }, calls);
  assert.match(
    tid(c, "entry-conflict").textContent ?? "",
    /Changed by someone else since you loaded it\./,
  );
  assert.equal(
    (tid(c, "entry-save") as HTMLButtonElement).disabled,
    true,
    "conflict save disabled",
  );
  click(tid(c, "entry-reload"));
  assert.equal(calls.reload?.length, 1);
  assert.equal(tid(mount({}), "entry-conflict"), null);
});

test("saving disables Save; otherwise Save and Cancel fire", () => {
  const calls: Calls = {};
  assert.equal((tid(mount({ saving: true }), "entry-save") as HTMLButtonElement).disabled, true);
  const c = mount({}, calls);
  assert.equal((tid(c, "entry-save") as HTMLButtonElement).disabled, false);
  click(tid(c, "entry-save"));
  click(buttonNamed(c, "Cancel"));
  assert.equal(calls.save?.length, 1);
  assert.equal(calls.cancel?.length, 1);
});

const { EditorView } = await import("@codemirror/view");
test("doc: editing the JSON editor fires onTextChange; entry-editor hook is present", () => {
  const calls: Calls = {};
  const c = mount({ kind: "doc", text: "{}" }, calls);
  assert.ok(tid(c, "entry-editor"), "entry-editor hook");
  const view = EditorView.findFromDOM(c.querySelector(".cm-content") as HTMLElement);
  assert.ok(view, "CodeMirror view mounted");
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '{"a":1}' } });
  });
  assert.deepEqual(calls.text, ['{"a":1}']);
});

test("doc modal gates Save as JSON becomes invalid and valid again", () => {
  let saves = 0;
  function Editor() {
    const [text, setText] = React.useState("");
    return React.createElement(DataEntryEditor, {
      kind: "doc",
      isNew: true,
      newKey: "config",
      text,
      onTextChange: setText,
      onKeyChange: () => {},
      onSave: () => {
        saves++;
      },
      onCancel: () => {},
      onReload: () => {},
    });
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() => root.render(React.createElement(Editor)));
    assert.ok(container.querySelector('dialog[open][aria-label="New document"]'));
    const save = tid(container, "entry-save") as HTMLButtonElement;
    assert.equal(save.disabled, true, "blank JSON starts disabled");
    const view = EditorView.findFromDOM(container.querySelector(".cm-content") as HTMLElement);
    assert.ok(view);
    for (const [text, valid] of [
      ["{", false],
      ['{"ok":true}', true],
      ['{"ok":}', false],
      ["null", false],
      ["42", false],
      ["[]", true],
    ] as const) {
      act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }));
      assert.equal(save.disabled, !valid, text);
      if (!valid) click(save);
    }
    assert.equal(saves, 0, "invalid content cannot submit");
    click(save);
    assert.equal(saves, 1);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
