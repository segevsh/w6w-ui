// Run (from the ui package root): node --import ./src/test-jsx-loader.mjs --test src/components/__tests__/Combobox.test.ts  (Node 24)
//
// Mirrors IconButton.test.ts:1-46's JSDOM/`act` setup (which in turn mirrors Copyable.test.ts:1-46).
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";

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
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { Combobox, filterOptions, shouldUseCombobox } = await import("../Combobox.tsx");

const OPTIONS = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
];

const PLAIN = { options: OPTIONS, value: "apple", onChange: () => {} };

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

async function render(el: ReactElement) {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(el);
  });
  return { container, root };
}

async function unmount(root: { unmount: () => void }) {
  await act(async () => {
    root.unmount();
  });
}

/** Point the viewport at a known height so `auto` mode is deterministic. */
function setViewportHeight(height: number) {
  Object.defineProperty(dom.window, "innerHeight", { value: height, configurable: true });
}

async function typeInto(input: HTMLInputElement, text: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  );
  await act(async () => {
    descriptor?.set?.call(input, text);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function press(el: Element, key: string) {
  await act(async () => {
    el.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

async function blur(el: Element) {
  await act(async () => {
    el.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
}

async function chooseSelectValue(select: HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    dom.window.HTMLSelectElement.prototype,
    "value",
  );
  await act(async () => {
    descriptor?.set?.call(select, value);
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

function optionLabels(container: Element) {
  return Array.from(container.querySelectorAll('[role="option"]'), (o) => o.textContent);
}

function optionValues(container: Element) {
  return Array.from(container.querySelectorAll("option"), (o) => o.getAttribute("value"));
}

test("U1 — shouldUseCombobox is true only when the estimated list exceeds 60% of the viewport", () => {
  assert.equal(shouldUseCombobox(3, 32, 768), false);
  assert.equal(shouldUseCombobox(1, 32, 800), false);
  assert.equal(shouldUseCombobox(15, 32, 800), false); // 480 == 60% of 800: not *more* than
  assert.equal(shouldUseCombobox(16, 32, 800), true); // 512 > 480
  assert.equal(shouldUseCombobox(19, 32, 1000), true); // 608 > 600
});

test("U2 — filterOptions matches label and value, case-insensitively, ignoring surrounding space", () => {
  assert.deepEqual(filterOptions(OPTIONS, ""), OPTIONS);
  assert.deepEqual(filterOptions(OPTIONS, "   "), OPTIONS);
  assert.deepEqual(filterOptions(OPTIONS, "app"), [OPTIONS[0]]); // label
  assert.deepEqual(filterOptions(OPTIONS, "cher"), [OPTIONS[2]]); // value and label
  assert.deepEqual(filterOptions(OPTIONS, "BaN"), [OPTIONS[1]]); // case-insensitive
  assert.deepEqual(filterOptions(OPTIONS, "zzz"), []);
  assert.equal(OPTIONS.length, 3); // the input array is not mutated
});

test("R1 — mode=select renders a native <select> and reports a pick exactly once", async () => {
  const calls: string[] = [];
  const { container, root } = await render(
    React.createElement(Combobox, {
      ...PLAIN,
      mode: "select",
      "aria-label": "Fruit",
      onChange: (v: string) => calls.push(v),
    }),
  );
  const select = container.querySelector("select");
  assert.ok(select instanceof dom.window.HTMLSelectElement);
  assert.equal(container.querySelector('[role="combobox"]'), null);
  assert.equal(select.getAttribute("aria-label"), "Fruit");
  assert.deepEqual(optionValues(container), ["apple", "banana", "cherry"]);
  await chooseSelectValue(select, "cherry");
  assert.deepEqual(calls, ["cherry"]);
  await unmount(root);
});

test("R2 — mode=auto picks <select> for a short list and the combobox for a long one", async () => {
  setViewportHeight(800);
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));

  const short = await render(React.createElement(Combobox, { ...PLAIN, options: make(15) }));
  assert.ok(short.container.querySelector("select"), "15 options must render a <select>");
  assert.equal(short.container.querySelector('[role="combobox"]'), null);
  await unmount(short.root);

  const long = await render(React.createElement(Combobox, { ...PLAIN, options: make(16) }));
  assert.ok(long.container.querySelector('[role="combobox"]'), "16 options must render a combobox");
  assert.equal(long.container.querySelector("select"), null);
  await unmount(long.root);
});

test("R3 — mode=combobox renders an ARIA combobox whose listbox opens on focus", async () => {
  const { container, root } = await render(
    React.createElement(Combobox, { ...PLAIN, mode: "combobox", "aria-label": "Fruit" }),
  );
  const input = container.querySelector("input");
  assert.ok(input);
  assert.equal(input.getAttribute("role"), "combobox");
  assert.equal(input.getAttribute("aria-label"), "Fruit");
  assert.equal(input.getAttribute("aria-expanded"), "false");
  assert.equal(container.querySelector('[role="listbox"]'), null);

  await act(async () => {
    input.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
  });

  const list = container.querySelector('[role="listbox"]');
  assert.ok(list);
  assert.equal(input.getAttribute("aria-expanded"), "true");
  assert.equal(list.getAttribute("id"), input.getAttribute("aria-controls"));
  assert.deepEqual(optionLabels(container), ["Apple", "Banana", "Cherry"]);
  const opts = Array.from(container.querySelectorAll('[role="option"]'));
  assert.equal(opts[0].getAttribute("aria-selected"), "true");
  assert.equal(opts[1].getAttribute("aria-selected"), "false");
  assert.equal(input.getAttribute("aria-activedescendant"), opts[0].getAttribute("id"));
  await unmount(root);
});

test("R4 — typing filters the list case-insensitively on label and value", async () => {
  const { container, root } = await render(
    React.createElement(Combobox, { ...PLAIN, mode: "combobox" }),
  );
  const input = container.querySelector("input");
  assert.ok(input);

  await typeInto(input, "AN");
  assert.deepEqual(optionLabels(container), ["Banana"]);

  await typeInto(input, "zzz");
  assert.deepEqual(optionLabels(container), []);
  assert.ok(container.textContent?.includes("No matches"));
  await unmount(root);
});

test("R5 — ArrowDown/ArrowUp move the active option and Enter picks it", async () => {
  const calls: string[] = [];
  const { container, root } = await render(
    React.createElement(Combobox, {
      ...PLAIN,
      mode: "combobox",
      onChange: (v: string) => calls.push(v),
    }),
  );
  const input = container.querySelector("input");
  assert.ok(input);
  const activeId = () => input.getAttribute("aria-activedescendant");
  const opts = () => Array.from(container.querySelectorAll('[role="option"]'));

  await press(input, "ArrowDown"); // opens, active stays 0
  assert.equal(input.getAttribute("aria-expanded"), "true");
  assert.equal(activeId(), opts()[0].getAttribute("id"));

  await press(input, "ArrowUp"); // clamped at the first option
  assert.equal(activeId(), opts()[0].getAttribute("id"));

  await press(input, "ArrowDown");
  await press(input, "ArrowDown");
  await press(input, "ArrowDown"); // clamped at the last option
  assert.equal(activeId(), opts()[2].getAttribute("id"));

  await press(input, "Enter");
  assert.deepEqual(calls, ["cherry"]);
  assert.equal(input.value, "Cherry");
  assert.equal(input.getAttribute("aria-expanded"), "false");
  assert.equal(container.querySelector('[role="listbox"]'), null);
  await unmount(root);
});

test("R6 — Escape restores the selected label and closes without changing the value", async () => {
  const calls: string[] = [];
  const { container, root } = await render(
    React.createElement(Combobox, {
      ...PLAIN,
      value: "banana",
      mode: "combobox",
      onChange: (v: string) => calls.push(v),
    }),
  );
  const input = container.querySelector("input");
  assert.ok(input);
  assert.equal(input.value, "Banana");

  await typeInto(input, "che");
  assert.deepEqual(optionLabels(container), ["Cherry"]);

  await press(input, "Escape");
  assert.equal(input.value, "Banana");
  assert.equal(input.getAttribute("aria-expanded"), "false");
  assert.equal(container.querySelector('[role="listbox"]'), null);
  assert.deepEqual(calls, []);
  await unmount(root);
});

test("R7 — forceSelection (default) never commits typed text: blur restores the label", async () => {
  const calls: string[] = [];
  const { container, root } = await render(
    React.createElement(Combobox, {
      ...PLAIN,
      mode: "combobox",
      onChange: (v: string) => calls.push(v),
    }),
  );
  const input = container.querySelector("input");
  assert.ok(input);

  await typeInto(input, "Ban");
  assert.equal(input.value, "Ban");
  await blur(input);

  assert.equal(input.value, "Apple");
  assert.equal(container.querySelector('[role="listbox"]'), null);
  assert.deepEqual(calls, []);
  await unmount(root);
});

test("R8 — forceSelection=false commits free-typed text on Enter and on blur", async () => {
  const calls: string[] = [];
  const { container, root } = await render(
    React.createElement(Combobox, {
      options: OPTIONS,
      value: "",
      mode: "combobox",
      forceSelection: false,
      onChange: (v: string) => calls.push(v),
    }),
  );
  const input = container.querySelector("input");
  assert.ok(input);

  await typeInto(input, "Frobnicator"); // matches nothing, so Enter is a free-text commit
  assert.deepEqual(optionLabels(container), []);
  await press(input, "Enter");
  assert.deepEqual(calls, ["Frobnicator"]);
  assert.equal(input.value, "Frobnicator");
  assert.equal(container.querySelector('[role="listbox"]'), null);

  await typeInto(input, "Widget");
  await blur(input);
  assert.deepEqual(calls, ["Frobnicator", "Widget"]);
  assert.equal(input.value, "Widget");
  await unmount(root);
});

test("R9 — disabled and placeholder reach the combobox input", async () => {
  const { container, root } = await render(
    React.createElement(Combobox, {
      ...PLAIN,
      mode: "combobox",
      disabled: true,
      placeholder: "Pick a fruit",
    }),
  );
  const input = container.querySelector("input");
  assert.ok(input);
  assert.equal(input.disabled, true);
  assert.equal(input.getAttribute("placeholder"), "Pick a fruit");
  await unmount(root);
});
