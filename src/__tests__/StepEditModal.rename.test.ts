// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepEditModal.rename.test.ts  (Node 24)
//
// Mirrors `WorkflowFlowEditor.test-tab.test.ts`'s jsdom + react-dom/client +
// act rig verbatim (same file it itself mirrors, `StepBuilderModal.commit.test.ts`)
// rather than inventing a second one. See that file's header for why each shim
// exists (`<dialog>.showModal`, `@xyflow/react`'s own stylesheet import, and —
// belt-and-suspenders here, since neither Setup nor the Configure props view
// mounts `JsonEditor`/CodeMirror — the requestAnimationFrame trio).
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

g.Window = dom.window.Window;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
(dom.window as unknown as Record<string, unknown>).requestAnimationFrame = raf;
(dom.window as unknown as Record<string, unknown>).cancelAnimationFrame = (id: number) =>
  clearTimeout(id as unknown as NodeJS.Timeout);

// jsdom@30 doesn't implement <dialog>'s imperative API — `Modal.tsx` calls
// `el.showModal()` in a mount effect, which would otherwise throw.
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { StepEditModal } = await import("../WorkflowFlowEditor.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
const { ExpressionOptionsProvider } = await import("../components/ExpressionOptions.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;
type FlowStep = import("../flow-types.ts").FlowStep;

const STEP: FlowStep = {
  id: "mail_1",
  uses: { app: "sendgrid", action: "send", connection: "conn_1" },
  with: { subject: "Hello" },
};
const P2 = "A step id can't contain a dot (.).";

function fakeApi() {
  return {
    listApps: async () => [],
    getAppAuth: async () => [],
    listConnectionsForApp: async () => [],
    listConnections: async () => [],
    getAppActions: async () => [],
    invokeAction: async () => ({ value: {} }),
    listStepTests: async () => [],
    saveStepTest: async () => ({ id: "t1" }),
    recordStepTestRun: async () => {},
    startAppOAuthFlow: async () => ({ authorizationUrl: "" }),
  } as unknown as W6WApi;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function mount() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const changes: FlowStep[] = [];
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api: fakeApi(),
        children: React.createElement(ExpressionOptionsProvider, {
          value: { sampleValues: {} },
          children: React.createElement(StepEditModal, {
            workflowId: "wf_1",
            step: STEP,
            upstreamSteps: [],
            onChange: (next: FlowStep) => changes.push(next),
            onClose: () => {},
          }),
        }),
      }),
    );
  });
  await flush();
  return { container, root, changes };
}

const renameInput = (c: Element) =>
  c.querySelector(".w6w-step-rename input") as HTMLInputElement | null;
const alerts = (c: Element) => Array.from(c.querySelectorAll('[role="alert"]'));

async function openRename(c: Element) {
  const btn = c.querySelector('button[aria-label="Rename step"]') as HTMLButtonElement | null;
  assert.ok(btn, "rename button");
  await act(async () => {
    btn.click();
  });
  assert.ok(renameInput(c), "rename input open");
}

async function type(c: Element, text: string) {
  const input = renameInput(c);
  assert.ok(input);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, text);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function key(c: Element, k: string) {
  const input = renameInput(c);
  assert.ok(input);
  await act(async () => {
    input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
}

async function blur(c: Element) {
  const input = renameInput(c);
  assert.ok(input);
  await act(async () => {
    input.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
}

test("rename - a dotted id + Enter is refused inline: no commit, input stays, one P-2 alert", async () => {
  const { container, root, changes } = await mount();
  await openRename(container);
  await type(container, "my.step");
  await key(container, "Enter");
  assert.equal(changes.filter((c) => c.id === "my.step").length, 0);
  assert.ok(renameInput(container), "input stays mounted");
  const a = alerts(container);
  assert.equal(a.length, 1);
  assert.equal(a[0].textContent, P2);
  await type(container, "my_step2");
  assert.equal(alerts(container).length, 0, "editing clears the alert");
  await act(async () => root.unmount());
});

test("rename - a dotted id + blur is refused the same way", async () => {
  const { container, root, changes } = await mount();
  await openRename(container);
  await type(container, "my.step");
  await blur(container);
  assert.equal(changes.filter((c) => c.id === "my.step").length, 0);
  assert.ok(renameInput(container), "input stays mounted");
  const a = alerts(container);
  assert.equal(a.length, 1);
  assert.equal(a[0].textContent, P2);
  await act(async () => root.unmount());
});

test("rename - Escape clears the alert, closes the input and shows the original id", async () => {
  const { container, root, changes } = await mount();
  await openRename(container);
  await type(container, "my.step");
  await key(container, "Enter");
  assert.equal(alerts(container).length, 1);
  await key(container, "Escape");
  assert.equal(alerts(container).length, 0);
  assert.equal(renameInput(container), null);
  assert.equal(container.querySelector(".w6w-step-rename code")?.textContent, "mail_1");
  assert.equal(changes.length, 0);
  await act(async () => root.unmount());
});

test("rename - a clean id + Enter commits once with no alert", async () => {
  const { container, root, changes } = await mount();
  await openRename(container);
  await type(container, "my_step");
  await key(container, "Enter");
  assert.equal(changes.filter((c) => c.id === "my_step").length, 1);
  assert.equal(alerts(container).length, 0);
  await act(async () => root.unmount());
});
