// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/use-enter-submit.test.ts  (Node 24)
//
// Mirrors components/__tests__/RepoSyncIndicator.test.ts:1-46's JSDOM/`act` setup — no JSX (this
// is a `.test.ts` file, not `.tsx`), so the harness component is built with `React.createElement`.
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
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { useEnterSubmit } = await import("../use-enter-submit.ts");

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

/**
 * Mounts one instance of the hook (via a real `<input>`/`<textarea>`/
 * contenteditable `<div>`/checkbox) per test-id, so every guard is exercised
 * against a real DOM target rather than a hand-built mock.
 */
function Harness({
  onSubmit,
  enabled,
  omitOpts,
}: {
  onSubmit: () => void;
  enabled?: boolean;
  omitOpts?: boolean;
}) {
  const enterSubmit = omitOpts ? useEnterSubmit(onSubmit) : useEnterSubmit(onSubmit, { enabled });
  return React.createElement(
    "div",
    null,
    React.createElement("input", { type: "text", "data-testid": "text-input", ...enterSubmit }),
    React.createElement("input", {
      type: "checkbox",
      "data-testid": "checkbox-input",
      ...enterSubmit,
    }),
    React.createElement("textarea", { "data-testid": "textarea", ...enterSubmit }),
    React.createElement("div", {
      contentEditable: true,
      suppressContentEditableWarning: true,
      "data-testid": "content-editable",
      ...enterSubmit,
    }),
  );
}

function dispatchKeyDown(
  el: Element,
  init: {
    key?: string;
    shiftKey?: boolean;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    isComposing?: boolean;
  } = {},
): KeyboardEvent {
  const ev = new dom.window.KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
    ...init,
  }) as unknown as KeyboardEvent;
  el.dispatchEvent(ev as unknown as Event);
  return ev;
}

test("fires on a bare Enter in a single-line text input", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(React.createElement(Harness, { onSubmit: () => calls++ }));
  });
  const input = container.querySelector('[data-testid="text-input"]');
  assert.ok(input);
  let ev: KeyboardEvent | undefined;
  await act(async () => {
    ev = dispatchKeyDown(input);
  });
  assert.equal(calls, 1);
  assert.equal(ev?.defaultPrevented, true);
  await act(async () => {
    root.unmount();
  });
});

test("does not fire for a non-Enter key", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(React.createElement(Harness, { onSubmit: () => calls++ }));
  });
  const input = container.querySelector('[data-testid="text-input"]');
  assert.ok(input);
  await act(async () => {
    dispatchKeyDown(input, { key: "a" });
  });
  assert.equal(calls, 0);
  await act(async () => {
    root.unmount();
  });
});

test("does not fire for a textarea target", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(React.createElement(Harness, { onSubmit: () => calls++ }));
  });
  const textarea = container.querySelector('[data-testid="textarea"]');
  assert.ok(textarea);
  await act(async () => {
    dispatchKeyDown(textarea);
  });
  assert.equal(calls, 0);
  await act(async () => {
    root.unmount();
  });
});

test("does not fire for a contenteditable target", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(React.createElement(Harness, { onSubmit: () => calls++ }));
  });
  const ce = container.querySelector('[data-testid="content-editable"]');
  assert.ok(ce);
  await act(async () => {
    dispatchKeyDown(ce);
  });
  assert.equal(calls, 0);
  await act(async () => {
    root.unmount();
  });
});

test("does not fire for a non-text input type (checkbox)", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(React.createElement(Harness, { onSubmit: () => calls++ }));
  });
  const checkbox = container.querySelector('[data-testid="checkbox-input"]');
  assert.ok(checkbox);
  await act(async () => {
    dispatchKeyDown(checkbox);
  });
  assert.equal(calls, 0);
  await act(async () => {
    root.unmount();
  });
});

test("does not fire when shiftKey is set", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(React.createElement(Harness, { onSubmit: () => calls++ }));
  });
  const input = container.querySelector('[data-testid="text-input"]');
  assert.ok(input);
  await act(async () => {
    dispatchKeyDown(input, { shiftKey: true });
  });
  assert.equal(calls, 0);
  await act(async () => {
    root.unmount();
  });
});

test("does not fire when altKey, ctrlKey, metaKey, or isComposing is set", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(React.createElement(Harness, { onSubmit: () => calls++ }));
  });
  const input = container.querySelector('[data-testid="text-input"]');
  assert.ok(input);
  for (const init of [
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { isComposing: true },
  ]) {
    await act(async () => {
      dispatchKeyDown(input, init);
    });
  }
  assert.equal(calls, 0);
  await act(async () => {
    root.unmount();
  });
});

test("enabled:false calls neither onSubmit nor preventDefault", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(React.createElement(Harness, { onSubmit: () => calls++, enabled: false }));
  });
  const input = container.querySelector('[data-testid="text-input"]');
  assert.ok(input);
  let ev: KeyboardEvent | undefined;
  await act(async () => {
    ev = dispatchKeyDown(input);
  });
  assert.equal(calls, 0);
  assert.equal(ev?.defaultPrevented, false);
  await act(async () => {
    root.unmount();
  });
});

test("omitting opts means enabled", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(React.createElement(Harness, { onSubmit: () => calls++, omitOpts: true }));
  });
  const input = container.querySelector('[data-testid="text-input"]');
  assert.ok(input);
  await act(async () => {
    dispatchKeyDown(input);
  });
  assert.equal(calls, 1);
  await act(async () => {
    root.unmount();
  });
});

test("calls preventDefault before onSubmit", async () => {
  const { container, root } = mountRoot();
  const order: string[] = [];
  await act(async () => {
    root.render(React.createElement(Harness, { onSubmit: () => order.push("onSubmit") }));
  });
  const input = container.querySelector('[data-testid="text-input"]');
  assert.ok(input);
  const ev = new dom.window.KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  const origPreventDefault = ev.preventDefault.bind(ev);
  ev.preventDefault = () => {
    order.push("preventDefault");
    origPreventDefault();
  };
  await act(async () => {
    input.dispatchEvent(ev);
  });
  assert.deepEqual(order, ["preventDefault", "onSubmit"]);
  await act(async () => {
    root.unmount();
  });
});

test("no state and no side effect beyond invoking onSubmit — a second Enter after unmount does nothing", async () => {
  const { container, root } = mountRoot();
  let calls = 0;
  await act(async () => {
    root.render(React.createElement(Harness, { onSubmit: () => calls++ }));
  });
  const input = container.querySelector('[data-testid="text-input"]');
  assert.ok(input);
  await act(async () => {
    dispatchKeyDown(input);
  });
  assert.equal(calls, 1);
  await act(async () => {
    root.unmount();
  });
  // The detached input still exists; dispatching on it after unmount must not
  // throw and must not invoke onSubmit again (no lingering subscription/state).
  await act(async () => {
    dispatchKeyDown(input);
  });
  assert.equal(calls, 1);
});
