// Run (from ui): node --experimental-strip-types --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/ColumnsEditor.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.Node = dom.window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.MutationObserver = dom.window.MutationObserver;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { ColumnsEditor } = await import("../ColumnsEditor.tsx");

type Col = { name: string; type: string; required: boolean; default?: unknown };
const seen = { columns: [] as Col[], key: "" as string, keyCalls: [] as string[] };

/** A host: owns the columns and key like Studio's modal does. */
function Host(props: { initial: Col[]; key0?: string; errors?: Record<string, string> }) {
  const [columns, setColumns] = React.useState(props.initial);
  const [key, setKey] = React.useState(props.key0 ?? "");
  seen.columns = columns;
  seen.key = key;
  return React.createElement(ColumnsEditor as never, {
    columns,
    onChange: setColumns,
    keyColumn: key,
    onKeyColumnChange: (k: string) => {
      seen.keyCalls.push(k);
      setKey(k);
    },
    columnErrors: props.errors ?? {},
  });
}

function mount(props: Parameters<typeof Host>[0]) {
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  seen.keyCalls = [];
  const root = createRoot(container);
  act(() => root.render(React.createElement(Host, props)));
  return container;
}
const byLabel = (c: Element, label: string) =>
  [...c.querySelectorAll(`[aria-label="${label}"]`)] as HTMLInputElement[];
const tid = (c: Element, id: string) => c.querySelector(`[data-testid="${id}"]`);

function typeInto(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto =
    el instanceof dom.window.HTMLSelectElement
      ? dom.window.HTMLSelectElement.prototype
      : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(
      new dom.window.Event(el instanceof dom.window.HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}

const INT: Col = { name: "age", type: "integer", required: false };

test("empty default input: the column has no default key", () => {
  const c = mount({ initial: [{ ...INT, default: 3 }] });
  typeInto(byLabel(c, "Column default")[0], "");
  assert.equal("default" in seen.columns[0], false);
});

test("integer '7' stores the number 7, not the text", () => {
  const c = mount({ initial: [INT] });
  typeInto(byLabel(c, "Column default")[0], "7");
  assert.strictEqual(seen.columns[0].default, 7);
});

test("boolean 'true' stores the boolean true", () => {
  const c = mount({ initial: [{ name: "on", type: "boolean", required: false }] });
  typeInto(byLabel(c, "Column default")[0], "true");
  assert.strictEqual(seen.columns[0].default, true);
});

test("number 'abc': no default key and the message shows under that row", () => {
  const c = mount({
    initial: [
      { name: "x", type: "integer", required: false },
      { name: "p", type: "number", required: false },
    ],
  });
  typeInto(byLabel(c, "Column default")[1], "abc");
  assert.equal("default" in seen.columns[1], false);
  assert.equal(tid(c, "data-store-column-default-error-0"), null);
  const err = tid(c, "data-store-column-default-error-1");
  assert.ok(err);
  assert.ok((err?.textContent ?? "").length > 0);
  assert.equal(byLabel(c, "Column default")[1].value, "abc", "the refused text stays visible");
});

test("a type change with text 'abc' leaves no default key", () => {
  const c = mount({ initial: [{ name: "x", type: "string", required: false, default: "abc" }] });
  assert.equal(byLabel(c, "Column default")[0].value, "abc");
  typeInto(byLabel(c, "Column type")[0] as never, "integer");
  assert.equal("default" in seen.columns[0], false);
  assert.equal(seen.columns[0].type, "integer");
  assert.ok(tid(c, "data-store-column-default-error-0"));
});

test("a type change reuses the text: '7' string becomes 7 integer", () => {
  const c = mount({ initial: [{ name: "x", type: "string", required: false, default: "7" }] });
  typeInto(byLabel(c, "Column type")[0] as never, "integer");
  assert.strictEqual(seen.columns[0].default, 7);
});

test("an incoming default of 3 shows as '3'", () => {
  const c = mount({ initial: [{ ...INT, default: 3 }] });
  assert.equal(byLabel(c, "Column default")[0].value, "3");
});

test("the key-column reset still fires when the key column is un-required", () => {
  const c = mount({ initial: [{ name: "id", type: "string", required: true }], key0: "id" });
  assert.equal(seen.key, "id");
  const req = byLabel(c, "Required")[0];
  act(() => {
    req.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(seen.columns[0].required, false);
  assert.equal(seen.key, "");
  assert.ok(seen.keyCalls.includes(""));
});

test("studio names survive: add, remove label, columnErrors by name", () => {
  const c = mount({
    initial: [{ name: "id", type: "string", required: true }],
    errors: { id: "bad id" },
  });
  assert.ok(tid(c, "data-columns"));
  assert.equal(tid(c, "data-store-column-error-id")?.textContent, "bad id");
  assert.ok(c.querySelector('[aria-label="Remove column id"]'));
  const add = [...c.querySelectorAll("button")].find((b) => b.textContent === "+ Add column");
  assert.ok(add);
  act(() => {
    add?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(seen.columns.length, 2);
  assert.ok(c.querySelector('[aria-label="Remove column 2"]'));
});
