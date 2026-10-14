// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.poll-minutes.test.ts  (Node 24)
//
// T-4: the poll trigger's "Check every N minutes" input keeps raw text while
// editing and clamps to the trigger minimum only on blur / confirm.
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

// jsdom implements <dialog> as an element but not its imperative API — `Modal`
// (StepBuilderModal's wrapper) calls `showModal()` in a mount effect.
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
const { StepBuilderModal } = await import("../StepBuilderModal.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;

/** The minimum `useReadyToUse` needs to settle, PLUS whatever `overrides`
 *  adds — `listTriggerApps`/`getAppTriggers`/`createSubscription` are NOT
 *  included here, so a test that never passes them in `overrides` gets an
 *  object that genuinely OMITS the key (case (c) — a `Proxy`-style
 *  answer-everything stub would defeat that assertion). */
function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    listApps: async () => [],
    listConnections: async () => [],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    ...overrides,
  } as unknown as W6WApi;
}

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

async function openTriggersTab(container: Element) {
  // Flush the useReadyToUse effect (Promise.all-ish, several api calls).
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  const triggersTab = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === "Triggers",
  );
  assert.ok(triggersTab, "the Triggers tab button must render");
  await act(async () => {
    triggersTab.click();
  });
}

async function openPicker(create: (...a: unknown[]) => Promise<unknown>) {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api: fakeApi({
          listTriggerApps: async () => [{ id: "slack", displayName: "Slack" }],
          getAppTriggers: async () => [
            { key: "p", title: "Poller", type: "poll", minIntervalMs: 600000 },
          ],
          createSubscription: create,
        }),
        children: React.createElement(StepBuilderModal, {
          onClose: () => {},
          onAdd: () => "step_1",
          workflowId: "wf_1",
        }),
      }),
    );
  });
  await openTriggersTab(container);
  const flush = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  await flush();
  await act(async () => (container.querySelector(".w6w-apppicker-card") as HTMLElement).click());
  await flush();
  const row = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Poller"),
  ) as HTMLButtonElement;
  assert.ok(row);
  await act(async () => row.click());
  await flush();
  const input = () => container.querySelector('input[type="number"]') as HTMLInputElement;
  const addButton = () =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Add trigger",
    ) as HTMLButtonElement;
  const setValue = async (v: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setter?.call(input(), v);
      input().dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  };
  const blur = () =>
    act(async () => {
      input().dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
    });
  return { root, input, addButton, setValue, blur, flush };
}

test("clampMinutes: blank / non-numeric / below-min yield min; else an integer", async () => {
  const { clampMinutes } = await import("../StepBuilderModal.tsx");
  assert.equal(clampMinutes("", 5), 5);
  assert.equal(clampMinutes("   ", 5), 5);
  assert.equal(clampMinutes("abc", 5), 5);
  assert.equal(clampMinutes("2", 5), 5);
  assert.equal(clampMinutes("12", 5), 12);
  assert.equal(clampMinutes("7.6", 5), 8, "fractions round to nearest");
  assert.equal(clampMinutes("5.2", 5), 5);
  assert.equal(clampMinutes("-3", 5), 5);
});

test("clearing the field leaves it empty; blur clamps it to the minimum", async () => {
  const h = await openPicker(async () => ({ id: "s" }));
  assert.equal(h.input().value, "10");
  await h.setValue("");
  assert.equal(h.input().value, "", "not snapped back while editing");
  await h.setValue("3");
  assert.equal(h.input().value, "3", "below-minimum raw text is kept while editing");
  await h.blur();
  assert.equal(h.input().value, "10", "blur sets the minimum");
  await act(async () => h.root.unmount());
});

test("typing below the minimum and clicking Add without blur sends minimum x 60000", async () => {
  const calls: unknown[][] = [];
  const h = await openPicker(async (...a) => {
    calls.push(a);
    return { id: "s" };
  });
  await h.setValue("3");
  await act(async () => h.addButton().click());
  await h.flush();
  assert.equal(calls.length, 1);
  assert.equal((calls[0][2] as { intervalMs: number }).intervalMs, 600000);
  await act(async () => h.root.unmount());
});
