// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/TriggerFillForm.remembered.test.ts  (Node 24)
//
// Remembered test inputs on the trigger's Test tab (`node_test_inputs`, 0160): a test run writes
// the values server-side; reopening the tab (a fresh mount over a fresh provider = a reload / another
// browser, reading only from the fake SERVER store) comes back PREFILLED with the "last used
// values" note; Clear empties the form, stores `{}` and stays cleared on the next open even though
// an older step-test fixture exists. JSDOM rig as ./WebhookListenPanel.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
g.HTMLInputElement = dom.window.HTMLInputElement;
g.Node = dom.window.Node;
g.Window = dom.window.Window;
g.matchMedia = () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});
(dom.window as unknown as Record<string, unknown>).matchMedia = g.matchMedia;
g.MutationObserver = (dom.window as unknown as Record<string, unknown>).MutationObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
(dom.window as unknown as Record<string, unknown>).requestAnimationFrame = raf;
(dom.window as unknown as Record<string, unknown>).cancelAnimationFrame = g.cancelAnimationFrame;
const rangeProto = dom.window.Range.prototype as unknown as Record<string, unknown>;
rangeProto.getClientRects = () => [];
rangeProto.getBoundingClientRect = () => ({
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
});

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { TriggerFillForm } = await import("../TriggerFillForm.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;

const ORDER = "5GIjY1redss2pXpti6vlj6";
const FIELDS = [{ key: "orderId", type: "string", required: true }];

/** The fake SERVER: what survives a reload is only what lives here. */
function fakeServer() {
  const store = new Map<string, Record<string, unknown>>();
  const puts: Record<string, unknown>[] = [];
  return {
    store,
    puts,
    api: {
      // An OLDER fixture exists — a cleared node must not fall back to it.
      listStepTests: async () => [{ id: "st_old", with: { orderId: "OLD-FIXTURE" }, input: {} }],
      loadTestInputs: async (wf: string) =>
        [...store.entries()]
          .filter(([k]) => k.startsWith(`${wf}/`))
          .map(([k, input]) => ({ nodeId: k.split("/")[1], input, updatedAt: "" })),
      saveTestInput: async (wf: string, node: string, input: Record<string, unknown>) => {
        puts.push(input);
        store.set(`${wf}/${node}`, input);
      },
      invokeAction: async (_a: string, _b: string, params: { input: unknown }) => ({
        value: params.input,
      }),
      saveStepTest: async () => ({ id: "st_1" }),
      recordStepTestRun: async () => ({}),
    },
  };
}

async function flush() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

/** A fresh mount over a fresh provider: what a reopen / reload / other browser sees. */
async function open(api: Record<string, unknown>) {
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api: api as unknown as W6WApi,
        children: React.createElement(TriggerFillForm, {
          app: "@w6w/trigger",
          action: "manual",
          fields: FIELDS,
          persist: { workflowId: "wf_1", stepId: "manual_trigger_1", input: {} },
        }),
      }),
    );
  });
  await flush();
  return { container, root };
}

const field = (c: HTMLElement) => c.querySelector("input:not([type=checkbox])") as HTMLInputElement;
const note = (c: HTMLElement) => c.querySelector('[data-testid="last-used-note"]');

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")
    ?.set as (v: string) => void;
  setter.call(input, value);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

function click(c: HTMLElement, label: string) {
  const btn = [...c.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  assert.ok(btn, `button "${label}" must render`);
  btn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
}

test("a test run is remembered server-side; reopen/reload prefills it; Clear sticks", async () => {
  const server = fakeServer();

  // First open: nothing remembered → the older fixture seeds (unchanged behavior), no note.
  let { container, root } = await open(server.api);
  assert.equal(field(container).value, "OLD-FIXTURE");
  assert.equal(note(container) === null, true);
  await act(async () => type(field(container), ORDER));
  await act(async () => click(container, "▶ Test run"));
  await flush();
  assert.deepEqual(server.store.get("wf_1/manual_trigger_1"), { orderId: ORDER });
  await act(async () => root.unmount());

  // Reopen after success = a fresh provider reading the SERVER store: prefilled + note.
  ({ container, root } = await open(server.api));
  assert.equal(field(container).value, ORDER);
  assert.ok(note(container)?.textContent?.includes("last used values"));

  // Clear: the form empties, `{}` is stored, the note goes.
  await act(async () => click(container, "Clear"));
  await flush();
  assert.equal(field(container).value, "");
  assert.deepEqual(server.store.get("wf_1/manual_trigger_1"), {});
  assert.equal(note(container) === null, true);
  await act(async () => root.unmount());

  // Reload after Clear: stays cleared — the older fixture is NOT resurrected.
  ({ container, root } = await open(server.api));
  assert.equal(field(container).value, "");
  assert.equal(note(container) === null, true);
  await act(async () => root.unmount());
});

test("a host without loadTestInputs keeps the fixture prefill and writes nothing", async () => {
  const server = fakeServer();
  const { loadTestInputs: _l, saveTestInput: _s, ...legacy } = server.api;
  const { container, root } = await open(legacy);
  assert.equal(field(container).value, "OLD-FIXTURE");
  assert.equal(note(container) === null, true);
  await act(async () => click(container, "▶ Test run"));
  await flush();
  assert.equal(server.puts.length, 0);
  await act(async () => root.unmount());
});

// The canvas Run node modal (`StepRunCollect`, the screenshot's surface) cannot be cheaply mounted
// (it needs the whole flow editor), so its wiring is pinned at the source: it reads the SAME
// remembered slot, remembers before it runs, and offers the note + Clear.
test("the Run node modal reads, writes and clears the same remembered slot", () => {
  const src = readFileSync(new URL("../WorkflowFlowEditor.tsx", import.meta.url), "utf8");
  const start = src.indexOf("function StepRunCollect(");
  const end = src.indexOf("\n// ── Node renderers", start);
  assert.ok(start > 0 && end > start, "StepRunCollect must exist");
  const body = src.slice(start, end);
  assert.ok(body.includes("useRememberedTestInput(workflowId, step.id)"));
  const save = body.indexOf("remembered.save(");
  const run = body.indexOf("onRun(isTrigger ? values", save);
  assert.ok(save > 0 && run > save, "remembers BEFORE it runs");
  assert.ok(body.includes("<LastUsedNote onClear={clearRemembered} />"));
  assert.ok(body.includes("remembered.clear()"));
});
