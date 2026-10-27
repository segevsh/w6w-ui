// Run (from packages/ui): NODE_OPTIONS=--experimental-strip-types node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/credential-picker.test.ts
//
// T5.2 - CredentialPicker (cases C1-C2) and the binding helpers.
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

const { CredentialPicker, bindingFieldsFor, buildBinding } = await import(
  "../CredentialPicker.tsx"
);

const cred = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Cred ${id}`,
  contract: "google-service-account.v1",
  status: "active",
  revision: 1,
  display: { email: `${id}@sa.iam` },
  private: false,
  connectionCount: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

function mountPicker(credentials: unknown[], mode: "existing" | "new", canUseExisting?: boolean) {
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  act(() => {
    root.render(
      React.createElement(CredentialPicker, {
        credentials,
        mode,
        onModeChange: () => {},
        selectedId: "",
        onSelect: () => {},
        canUseExisting,
      } as never),
    );
  });
  return container;
}

test("C1 picker renders one option per credential given, showing name and a display value", () => {
  const c = mountPicker([cred("a")], "existing");
  const opts = [...c.querySelectorAll("option")];
  assert.equal(opts.length, 1);
  assert.ok(opts[0].textContent?.includes("Cred a"));
  assert.ok(opts[0].textContent?.includes("a@sa.iam"));
});

test("C2 no usable credentials: no Use existing choice and no select", () => {
  const c = mountPicker([], "new", false);
  assert.equal(c.querySelectorAll("select").length, 0);
  assert.equal(c.querySelectorAll('input[type="radio"]').length, 0);
});

test("bindingFieldsFor / buildBinding: delegatedUser top-level, others in settings, blanks omitted", () => {
  const sa = (impersonation: "none" | "optional" | "required", bindingFields: never[] = []) => ({
    accepts: ["c"],
    scopes: [],
    impersonation,
    bindingFields,
  });
  const f = bindingFieldsFor({
    ...sa("required"),
    bindingFields: [{ key: "projectId", label: "Project", type: "string" }] as never,
  });
  assert.deepEqual(
    f.map((x) => [x.key, x.label, x.required]),
    [
      ["delegatedUser", "Impersonated user", true],
      ["projectId", "Project", undefined],
    ],
  );
  assert.deepEqual(bindingFieldsFor(sa("none")), []);
  assert.deepEqual(buildBinding(f, { delegatedUser: "", projectId: "" }), undefined);
  assert.deepEqual(buildBinding(f, { delegatedUser: "u@x", projectId: "p" }), {
    delegatedUser: "u@x",
    settings: { projectId: "p" },
  });
});
