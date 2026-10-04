// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/RetryPolicyFields.test.ts  (Node 24)
//
// Mirrors `ParamsForm.script-language.test.ts`'s jsdom + react-dom/client +
// act rig (minus the CodeMirror shims — `RetryPolicyFields` mounts no editor).
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { RetryPolicyFields } = await import("../RetryPolicyFields.tsx");
type RetryPolicyValue = import("../RetryPolicyFields.tsx").RetryPolicyValue;
type RetryTarget = import("../RetryPolicyFields.tsx").RetryTarget;

const SET: RetryPolicyValue = { maxAttempts: 5, delayMs: 2000, backoff: "exponential" };

const HELPER_TEXT: Record<RetryTarget, string> = {
  step: "Re-run this step if it fails, up to N attempts.",
  function: "Re-run this function call if it fails, up to N attempts.",
  endpoint: "Re-run this endpoint call if it fails, up to N attempts.",
  workflow: "Re-run the whole workflow run if it fails, up to N attempts.",
};

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

function setInputValue(input: Element | null, value: string) {
  const el = input as HTMLInputElement;
  const descriptor = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  );
  const setter = descriptor?.set;
  setter?.call(el, value);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

async function render(
  container: HTMLElement,
  root: ReturnType<typeof createRoot>,
  props: {
    value: RetryPolicyValue | undefined;
    onChange: (next: RetryPolicyValue | undefined) => void;
    readOnly?: boolean;
    target?: RetryTarget;
  },
) {
  await act(async () => {
    root.render(React.createElement(RetryPolicyFields, props));
  });
  return container;
}

for (const target of ["step", "function", "endpoint", "workflow"] as const) {
  test(`RF-${target} — checked checkbox, "${target}" helper line, and the three labelled controls`, async () => {
    const { container, root } = mountRoot();
    const calls: (RetryPolicyValue | undefined)[] = [];
    await render(container, root, {
      value: SET,
      onChange: (next) => calls.push(next),
      target,
    });

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    assert.ok(checkbox, "the Retry on failure checkbox should render");
    assert.equal(checkbox.checked, true, "the checkbox is checked when value is set");
    assert.ok(
      container.textContent?.includes("Retry on failure"),
      "the checkbox label text is 'Retry on failure'",
    );
    const hint = container.querySelector(".w6w-hint");
    assert.equal(hint?.textContent, HELPER_TEXT[target], `the ${target} helper line is exact`);

    const fields = Array.from(container.querySelectorAll(".w6w-field-row .w6w-field"));
    const attemptsField = fields.find((f) => f.querySelector("span")?.textContent === "Attempts");
    const delayField = fields.find((f) => f.querySelector("span")?.textContent === "Delay (ms)");
    const backoffField = fields.find((f) => f.querySelector("span")?.textContent === "Backoff");
    assert.ok(attemptsField, "an Attempts field should render");
    assert.ok(delayField, "a Delay (ms) field should render");
    assert.ok(backoffField, "a Backoff field should render");

    const attemptsInput = attemptsField?.querySelector("input") as HTMLInputElement;
    const delayInput = delayField?.querySelector("input") as HTMLInputElement;
    const backoffSelect = backoffField?.querySelector("select") as HTMLSelectElement;
    assert.equal(attemptsInput.type, "number");
    assert.equal(attemptsInput.min, "1");
    assert.equal(attemptsInput.value, String(SET.maxAttempts));
    assert.equal(delayInput.type, "number");
    assert.equal(delayInput.min, "0");
    assert.equal(delayInput.value, String(SET.delayMs));
    assert.equal(backoffSelect.value, SET.backoff);
    assert.deepEqual(
      Array.from(backoffSelect.options).map((o) => o.textContent),
      ["Fixed", "Exponential"],
    );

    await act(async () => {
      root.unmount();
    });
  });
}

test("RF-toggle — unchecked when value is undefined, no number input/select; checking/unchecking calls onChange", async () => {
  const { container, root } = mountRoot();
  const calls: (RetryPolicyValue | undefined)[] = [];
  await render(container, root, { value: undefined, onChange: (next) => calls.push(next) });

  const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
  assert.equal(checkbox.checked, false, "unchecked when value is undefined");
  assert.equal(
    container.querySelector('input[type="number"]'),
    null,
    "no number input renders while unchecked",
  );
  assert.equal(container.querySelector("select"), null, "no select renders while unchecked");

  await act(async () => {
    checkbox.click();
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { maxAttempts: 3, delayMs: 1000, backoff: "fixed" });

  await act(async () => {
    root.unmount();
  });

  // A fresh mount with a set value, to pin the unchecking side independently
  // of whatever the (uncontrolled-in-this-test) checkbox's own DOM state did
  // after the click above.
  const { container: container2, root: root2 } = mountRoot();
  const calls2: (RetryPolicyValue | undefined)[] = [];
  await render(container2, root2, { value: SET, onChange: (next) => calls2.push(next) });
  const checkbox2 = container2.querySelector('input[type="checkbox"]') as HTMLInputElement;
  assert.equal(checkbox2.checked, true);
  await act(async () => {
    checkbox2.click();
  });
  assert.equal(calls2.length, 1);
  assert.equal(calls2[0], undefined, "unchecking a set value calls onChange(undefined)");

  await act(async () => {
    root2.unmount();
  });
});

test("RF-edit — typing 0 in Attempts calls onChange with maxAttempts: 1, other fields unchanged", async () => {
  const { container, root } = mountRoot();
  const calls: (RetryPolicyValue | undefined)[] = [];
  await render(container, root, { value: SET, onChange: (next) => calls.push(next) });

  const fields = Array.from(container.querySelectorAll(".w6w-field-row .w6w-field"));
  const attemptsField = fields.find((f) => f.querySelector("span")?.textContent === "Attempts");
  const attemptsInput = attemptsField?.querySelector("input") as HTMLInputElement;

  await act(async () => {
    setInputValue(attemptsInput, "0");
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { maxAttempts: 1, delayMs: SET.delayMs, backoff: SET.backoff });

  await act(async () => {
    root.unmount();
  });
});
