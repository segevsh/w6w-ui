// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/AuthFieldsForm.edit-mode.test.ts
//
// `mode="edit"`: never seeds `field.default`, secret placeholder, an emptied number reports "".
// `mode` omitted ("create") keeps today's output.
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { AuthFieldsForm } = await import("../components/AuthFieldsForm.tsx");

const fields = [
  { key: "apiKey", label: "API key", type: "secret" as const, default: "DEFAULT-KEY" },
  { key: "domain", label: "Domain", type: "string" as const, default: "acme" },
  { key: "port", label: "Port", type: "number" as const, default: 8080 },
];

function mount(props: Record<string, unknown>) {
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  const seen: Record<string, unknown>[] = [];
  act(() =>
    root.render(
      React.createElement(AuthFieldsForm, {
        fields,
        values: {},
        onChange: (v: Record<string, unknown>) => seen.push(v),
        ...props,
      } as never),
    ),
  );
  return { container, seen };
}

const input = (c: Element, key: string) =>
  c.querySelector(`input[name="w6w-cred-${key}"]`) as HTMLInputElement;

function type(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
  assert.ok(set);
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

test("edit mode: default is never seeded into any input", () => {
  const { container } = mount({ mode: "edit" });
  assert.equal(input(container, "apiKey").value, "");
  assert.equal(input(container, "domain").value, "");
  assert.equal(input(container, "port").value, "");
});

test("edit mode: secret placeholder, still a masked text input (never password)", () => {
  const { container } = mount({ mode: "edit" });
  const secret = input(container, "apiKey");
  assert.equal(secret.getAttribute("placeholder"), "•••••• (unchanged)");
  assert.equal(secret.getAttribute("type"), "text");
  assert.ok(secret.classList.contains("w6w-secret-input"));
  assert.equal(container.querySelectorAll('input[type="password"]').length, 0);
  assert.equal(input(container, "domain").getAttribute("placeholder"), null);
});

test("edit mode: an emptied number input reports an empty string, not 0", () => {
  const { container, seen } = mount({ mode: "edit", values: { port: 9 } });
  type(input(container, "port"), "");
  assert.deepEqual(seen.at(-1), { port: "" });
  type(input(container, "port"), "5");
  assert.deepEqual(seen.at(-1), { port: 5 });
});

test("create mode (default) is unchanged: seeds defaults, no placeholder, empty number is 0", () => {
  const { container, seen } = mount({});
  assert.equal(input(container, "apiKey").value, "DEFAULT-KEY");
  assert.equal(input(container, "domain").value, "acme");
  assert.equal(input(container, "port").value, "8080");
  assert.equal(input(container, "apiKey").getAttribute("placeholder"), null);
  type(input(container, "port"), "");
  assert.deepEqual(seen.at(-1), { port: 0 });
});
