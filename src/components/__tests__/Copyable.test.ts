// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/components/__tests__/Copyable.test.ts  (Node 24)
//
// Mirrors ../../__tests__/StepBuilderModal.commit.test.ts:11-54 — including its
// `Object.defineProperty(globalThis, "navigator", …)` block, which is how a
// stub `clipboard` gets installed. jsdom implements no Clipboard API at all,
// so this tier proves the STATE MACHINE (icon swap, `.is-copied`, the revert
// timer, the read-only/editable click split, the rejection path) — never that
// bytes actually reached a system clipboard. That claim is the real-browser
// rig's job (`test/copyable/`).
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
const { Copyable } = await import("../Copyable.tsx");

/** Installs a stub clipboard `writeText`, recording every call.
 *  `behavior` lets J4 install a rejecting stub. */
function stubClipboard(behavior: (text: string) => Promise<void> = async () => {}) {
  const calls: string[] = [];
  Object.defineProperty(dom.window.navigator, "clipboard", {
    value: {
      writeText: async (text: string) => {
        calls.push(text);
        await behavior(text);
      },
    },
    configurable: true,
  });
  return calls;
}

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

test("J1 — icon click writes `value` exactly and the button gains .is-copied", async () => {
  const calls = stubClipboard();
  const { container, root } = mountRoot();

  await act(async () => {
    root.render(
      React.createElement(Copyable, {
        value: "hello-world",
        children: React.createElement("input", { readOnly: true, value: "hello-world" }),
      }),
    );
  });

  const button = container.querySelector("button");
  assert.ok(button, "the copy button must render");
  assert.equal(button.getAttribute("aria-label"), "Copy");

  await act(async () => {
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0)); // flush the async writeText
  });

  assert.deepEqual(calls, ["hello-world"], "writeText must receive value exactly, once");
  assert.ok(button.classList.contains("is-copied"), "button must gain .is-copied on success");

  await act(async () => {
    root.unmount();
  });
});

test("J2 — the copied state reverts after COPIED_MS", async () => {
  stubClipboard();
  const { container, root } = mountRoot();

  await act(async () => {
    root.render(
      React.createElement(Copyable, {
        value: "abc",
        children: React.createElement("input", { readOnly: true, value: "abc" }),
      }),
    );
  });

  const button = container.querySelector("button");
  assert.ok(button);

  await act(async () => {
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.ok(button.classList.contains("is-copied"), "must be copied right after the click");

  // COPIED_MS is 1500 (module-private); wait past it plus slack.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 1650));
  });
  assert.ok(!button.classList.contains("is-copied"), "must revert to idle after COPIED_MS");

  await act(async () => {
    root.unmount();
  });
});

test("J3 — readOnly box click copies; default (editable) box click does not", async () => {
  // Arm 1: readOnly — a click on the wrapped input (not the button) copies.
  {
    const calls = stubClipboard();
    const { container, root } = mountRoot();
    await act(async () => {
      root.render(
        React.createElement(Copyable, {
          value: "ro-value",
          readOnly: true,
          children: React.createElement("input", { readOnly: true, value: "ro-value" }),
        }),
      );
    });
    const input = container.querySelector("input");
    assert.ok(input);
    await act(async () => {
      input.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    assert.deepEqual(calls, ["ro-value"], "readOnly: a box click must copy");
    await act(async () => {
      root.unmount();
    });
  }

  // Arm 2: default (editable) — a click on the input must NOT copy.
  {
    const calls = stubClipboard();
    const { container, root } = mountRoot();
    await act(async () => {
      root.render(
        React.createElement(Copyable, {
          value: "editable-value",
          children: React.createElement("input", { value: "editable-value", onChange: () => {} }),
        }),
      );
    });
    const input = container.querySelector("input");
    assert.ok(input);
    await act(async () => {
      input.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    assert.deepEqual(calls, [], "default (editable): a box click must NOT copy");
    await act(async () => {
      root.unmount();
    });
  }
});

test("J4 — a rejecting writeText leaves the button idle and raises nothing", async () => {
  const calls = stubClipboard(async () => {
    throw new Error("denied");
  });
  const { container, root } = mountRoot();

  await act(async () => {
    root.render(
      React.createElement(Copyable, {
        value: "will-fail",
        children: React.createElement("input", { readOnly: true, value: "will-fail" }),
      }),
    );
  });

  const button = container.querySelector("button");
  assert.ok(button);

  await assert.doesNotReject(async () => {
    await act(async () => {
      button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  assert.deepEqual(calls, ["will-fail"], "writeText must still have been attempted");
  assert.ok(!button.classList.contains("is-copied"), "a rejecting clipboard must stay idle");

  await act(async () => {
    root.unmount();
  });
});
