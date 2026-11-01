// Run (from packages/ui): node --experimental-strip-types --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/WorkflowFlowEditor.state-control.test.ts
// T4.1.1: the "Write to state" control in Configure › Node settings. Rig mirrors
// `StepEditModal.setup-and-configure.test.ts` (jsdom, showModal shim, providers).
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

const { validateStateConfig } = await import("@w6w/expr");

function fakeApi() {
  return {
    listApps: async () => [{ id: "acme", displayName: "Acme" }],
    getAppAuth: async () => [],
    listConnectionsForApp: async () => [],
    listConnections: async () => [],
    getAppActions: async () => [{ key: "run", title: "Run", params: [] }],
    invokeAction: async () => ({ value: {} }),
    listStepTests: async () => [],
    saveStepTest: async () => ({ id: "t1" }),
    recordStepTestRun: async () => {},
  } as unknown as W6WApi;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const ACME: FlowStep = { id: "fetch_1", uses: { app: "acme", action: "run" } };

async function mount(
  step: FlowStep,
  extra: { readOnly?: boolean; loop?: unknown; stateOutputFields?: string[] } = {},
) {
  const container = document.getElementById("root");
  assert.ok(container);
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
            step,
            upstreamSteps: [],
            onChange: (next: FlowStep) => changes.push(next),
            onClose: () => {},
            ...extra,
          } as Parameters<typeof StepEditModal>[0]),
        }),
      }),
    );
  });
  await flush();
  const btn = container.querySelector(
    '.w6w-view-toggle button[aria-label="Node settings"]',
  ) as HTMLButtonElement | null;
  assert.ok(btn, "the Node settings view toggle button should be present");
  await act(async () => {
    btn.click();
  });
  await flush();
  const last = () => changes[changes.length - 1];
  const unmount = async () => {
    await act(async () => {
      root.unmount();
    });
  };
  return { container, changes, last, unmount };
}

const q = <T extends Element>(c: Element, sel: string) => c.querySelector(sel) as T | null;
const modeSelect = (c: Element) => q<HTMLSelectElement>(c, 'select[aria-label="Write to state"]');

async function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto =
    el instanceof dom.window.HTMLSelectElement
      ? dom.window.HTMLSelectElement.prototype
      : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(
      new dom.window.Event(el instanceof dom.window.HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
  await flush();
}
/** Type into a free-text Combobox: it commits on blur, like a user tabbing out. */
async function typePath(el: HTMLInputElement, value: string) {
  await act(async () => {
    el.focus();
  });
  await setValue(el, value);
  await act(async () => {
    el.blur();
  });
  await flush();
}
const all = (c: Element, label: string) =>
  Array.from(c.querySelectorAll(`input[aria-label="${label}"]`)) as HTMLInputElement[];
async function click(c: Element, label: string, index = 0) {
  const b = Array.from(c.querySelectorAll(`button[aria-label="${label}"]`))[index] as
    | HTMLButtonElement
    | undefined;
  assert.ok(b, label);
  await act(async () => {
    b.click();
  });
  await flush();
}

test("mode Off - from a key writer, picking Off removes the state key", async () => {
  const m = await mount({ ...ACME, state: { mode: "key", key: "x" } });
  const sel = modeSelect(m.container);
  assert.ok(sel);
  assert.equal(sel.value, "key");
  await setValue(sel, "off");
  assert.equal("state" in m.last(), false);
  await m.unmount();
});

test("mode Merge at root - records {mode:root}", async () => {
  const m = await mount(ACME);
  const sel = modeSelect(m.container);
  assert.ok(sel);
  assert.equal(sel.value, "off");
  assert.deepEqual(
    Array.from(sel.options).map((o) => o.textContent),
    ["Off", "Merge at root", "Under a key", "Pick fields", "Append"],
  );
  await setValue(sel, "root");
  assert.deepEqual(m.last().state, { mode: "root" });
  await m.unmount();
});

test("mode Under a key - typing order gives {mode:key,key:order}", async () => {
  const m = await mount(ACME);
  await setValue(modeSelect(m.container) as HTMLSelectElement, "key");
  const key = q<HTMLInputElement>(m.container, 'input[aria-label="State key"]');
  assert.ok(key);
  await setValue(key, "order");
  assert.deepEqual(m.last().state, { mode: "key", key: "order" });
  assert.equal(key.closest("label")?.querySelector("span")?.textContent, "To state key");
  assert.ok(m.container.textContent?.includes("Copies the whole step output into state.<key>."));
  await m.unmount();
});

test("mode Pick fields - two rows id→order.id, total→order.total in that order", async () => {
  const m = await mount(ACME, { stateOutputFields: ["id", "total"] });
  await setValue(modeSelect(m.container) as HTMLSelectElement, "pick");
  assert.equal(all(m.container, "From output field").length, 1);
  await typePath(all(m.container, "From output field")[0], "id");
  await setValue(all(m.container, "To state path")[0], "order.id");
  await click(m.container, "Add field");
  await typePath(all(m.container, "From output field")[1], "total");
  await setValue(all(m.container, "To state path")[1], "order.total");
  assert.deepEqual(m.last().state, {
    mode: "pick",
    map: [
      { from: "id", to: "order.id" },
      { from: "total", to: "order.total" },
    ],
  });
  await click(m.container, "Remove field", 0);
  assert.deepEqual(m.last().state, { mode: "pick", map: [{ from: "total", to: "order.total" }] });
  await m.unmount();
});

test("Pick fields - labelled columns, an arrow, the hint, a trash remove and + Add field", async () => {
  const m = await mount({ ...ACME, state: { mode: "pick", map: [{ from: "order", to: "o" }] } });
  const head = q<HTMLElement>(m.container, ".w6w-state-map-head");
  assert.ok(head);
  const cols = Array.from(head.children).map((c) => c.textContent);
  assert.deepEqual(cols, ["From this step output", "", "To state key"]);
  const row = q<HTMLElement>(m.container, ".w6w-datavar-row.w6w-state-map-row");
  assert.ok(row);
  assert.equal(row.querySelector(".w6w-state-map-arrow")?.textContent, "→");
  assert.ok(row.querySelector('button.w6w-icon-button-danger[aria-label="Remove field"] svg'));
  const add = q<HTMLButtonElement>(m.container, 'button[aria-label="Add field"]');
  assert.equal(add?.textContent, "+ Add field");
  assert.ok(add?.classList.contains("w6w-btn"));
  assert.ok(m.container.textContent?.includes("Copies output.<path> into state.<key>."));
  await m.unmount();
});

test("Pick fields - the From field lists this step's output fields and keeps free text", async () => {
  const m = await mount(ACME, { stateOutputFields: ["id", "total"] });
  await setValue(modeSelect(m.container) as HTMLSelectElement, "pick");
  const from = all(m.container, "From output field")[0];
  assert.equal(from.getAttribute("role"), "combobox");
  await act(async () => {
    from.focus();
  });
  await flush();
  const opts = Array.from(m.container.querySelectorAll('[role="option"]')).map(
    (o) => o.textContent,
  );
  assert.deepEqual(opts, ["id", "total"]);
  await act(async () => {
    from.blur();
  });
  await typePath(all(m.container, "From output field")[0], "lines.0.sku");
  assert.deepEqual(m.last().state, { mode: "pick", map: [{ from: "lines.0.sku", to: "fetch_1" }] });
  await m.unmount();
});

test("mode Append - blank output field omits from; a field sets it", async () => {
  const m = await mount(ACME);
  await setValue(modeSelect(m.container) as HTMLSelectElement, "append");
  const path = q<HTMLInputElement>(m.container, 'input[aria-label="Append to state path"]');
  assert.ok(path);
  await setValue(path, "items");
  assert.deepEqual(m.last().state, { mode: "append", path: "items" });
  const from = q<HTMLInputElement>(m.container, 'input[aria-label="Output field to append"]');
  assert.ok(from);
  await typePath(from, "line");
  assert.deepEqual(m.last().state, { mode: "append", path: "items", from: "line" });
  const head = q<HTMLElement>(m.container, ".w6w-state-map-head");
  assert.deepEqual(
    Array.from(head?.children ?? []).map((c) => c.textContent),
    ["From this step output", "", "Append to state list"],
  );
  await typePath(from, "");
  assert.deepEqual(m.last().state, { mode: "append", path: "items" });
  await m.unmount();
});

test("Set data with no state shows Merge at root; picking Off records {mode:off}", async () => {
  const m = await mount({ id: "set_1", uses: { app: "@w6w/data", action: "set" } });
  const sel = modeSelect(m.container);
  assert.ok(sel);
  assert.equal(sel.value, "root");
  await setValue(sel, "off");
  assert.deepEqual(m.last().state, { mode: "off" });
  await m.unmount();
});

test("control If and For each show no Write to state; their other settings still render", async () => {
  const ifm = await mount({ id: "if_1", uses: { app: "@w6w/control", action: "if" } });
  assert.equal(modeSelect(ifm.container), null);
  assert.ok(ifm.container.textContent?.includes("On error"));
  await ifm.unmount();
  const fe = await mount({ id: "fe_1", uses: { app: "@w6w/control", action: "foreach" } });
  assert.equal(modeSelect(fe.container), null);
  assert.ok(fe.container.textContent?.includes("Run next nodes"));
  await fe.unmount();
});

test("a manual trigger shows the control, directly after Run next nodes", async () => {
  const m = await mount({
    id: "trigger_1",
    uses: { app: "@w6w/trigger", action: "manual", trigger: true },
  });
  const sel = modeSelect(m.container);
  assert.ok(sel);
  const selects = Array.from(m.container.querySelectorAll("select")).map((s) =>
    s.getAttribute("aria-label"),
  );
  assert.equal(selects[selects.indexOf("Run next nodes") + 1], "Write to state");
  await m.unmount();
});

test("an invalid key a..b renders the validateStateConfig message in role=alert", async () => {
  const m = await mount({ ...ACME, state: { mode: "key", key: "x" } });
  const key = q<HTMLInputElement>(m.container, 'input[aria-label="State key"]');
  assert.ok(key);
  await setValue(key, "a..b");
  const alerts = Array.from(m.container.querySelectorAll('[role="alert"]')).map(
    (a) => a.textContent ?? "",
  );
  const messages = validateStateConfig({ mode: "key", key: "a..b" }).map((i) => i.message);
  assert.ok(messages.length >= 1);
  assert.ok(
    alerts.some((t) => messages.some((msg) => t.includes(msg))),
    alerts.join("|"),
  );
  await m.unmount();
});

test("readOnly disables the select", async () => {
  const m = await mount({ ...ACME, state: { mode: "key", key: "x" } }, { readOnly: true });
  assert.equal(modeSelect(m.container)?.disabled, true);
  assert.equal(q<HTMLInputElement>(m.container, 'input[aria-label="State key"]')?.disabled, true);
  await m.unmount();
});

test("in a For each body the per item hint shows; Off is still the default", async () => {
  const m = await mount(ACME, { loop: { id: "fe_1", label: "Each" } });
  assert.ok(m.container.textContent?.includes("per item"));
  assert.equal(modeSelect(m.container)?.value, "off");
  await m.unmount();
});
