// Run (from packages/ui): NODE_OPTIONS=--experimental-strip-types node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/AuthFieldsForm.textarea.test.ts
//
// T5.2 - json/text auth fields are plain textareas (cases F1-F2).
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;
g.matchMedia = (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});
(dom.window as unknown as Record<string, unknown>).matchMedia = g.matchMedia;
class FakeMutationObserver {
  observe() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
g.MutationObserver = FakeMutationObserver;
(dom.window as unknown as Record<string, unknown>).MutationObserver = g.MutationObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;
const dialogProto = dom.window.HTMLDialogElement?.prototype as unknown as Record<string, unknown>;
if (dialogProto && typeof dialogProto.showModal !== "function") {
  dialogProto.showModal = function showModal(this: HTMLElement) {
    this.setAttribute("open", "");
  };
  dialogProto.close = function close(this: HTMLElement) {
    this.removeAttribute("open");
  };
}

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");

const field = (c: Element, name: string) =>
  c.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement;
const { AuthFieldsForm } = await import("../components/AuthFieldsForm.tsx");

function mountForm(fields: unknown[], mode?: "edit") {
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  act(() => {
    root.render(
      React.createElement(AuthFieldsForm, {
        fields,
        values: {},
        onChange: () => {},
        mode,
      } as never),
    );
  });
  return container;
}
const F = (key: string, type: string, extra: Record<string, unknown> = {}) => ({
  key,
  label: key,
  type,
  ...extra,
});

test("F1 json and text render textareas with every autofill opt-out; secret masking by type or flag", () => {
  const c = mountForm([
    F("j", "json"),
    F("t", "text"),
    F("js", "json", { secret: true }),
    F("s", "string"),
    F("p", "secret"),
  ]);
  for (const k of ["j", "t", "js"]) {
    const el = field(c, `w6w-cred-${k}`);
    assert.equal(el.tagName, "TEXTAREA");
    assert.equal(el.getAttribute("autocomplete"), "off");
    assert.equal(el.getAttribute("autocapitalize"), "off");
    assert.equal(el.getAttribute("autocorrect"), "off");
    assert.equal(el.getAttribute("spellcheck"), "false");
    for (const a of ["data-1p-ignore", "data-lpignore", "data-bwignore"]) {
      assert.equal(el.getAttribute(a), "true");
    }
    assert.equal(el.getAttribute("data-form-type"), "other");
  }
  assert.ok(field(c, "w6w-cred-js").classList.contains("w6w-secret-input"));
  assert.ok(!field(c, "w6w-cred-j").classList.contains("w6w-secret-input"));
  assert.equal(field(c, "w6w-cred-s").tagName, "INPUT");
  assert.equal(field(c, "w6w-cred-p").tagName, "INPUT");
  assert.ok(field(c, "w6w-cred-p").classList.contains("w6w-secret-input"));
});

test("F2 an edit-mode masked textarea has the unchanged placeholder; an unmasked one has none", () => {
  const c = mountForm([F("js", "json", { secret: true }), F("t", "text")], "edit");
  assert.equal(field(c, "w6w-cred-js").getAttribute("placeholder"), "•••••• (unchanged)");
  assert.equal(field(c, "w6w-cred-t").getAttribute("placeholder"), null);
});
