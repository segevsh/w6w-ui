// Run: node --experimental-strip-types --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/ExpressionEditorModal.starting-state.test.ts
//
// Starting-state mode: the editor behind the workflow toolbar's State button, which edits
// `Workflow.initialState` (evaluated once at run start). The rail has no Previous steps or State
// section (state is blank there) and no Secrets, but lists Documents; a click inserts the
// reference by default or, with "Value", the source's current value; the Result resolves refs;
// Save hands back the authored object. Same jsdom harness as `ExpressionEditorModal.state.test.ts`.
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

// CodeMirror 6 needs these three (verified necessary + jointly sufficient at
// `WorkflowFlowEditor.test-tab.test.ts:47-58`, reused verbatim by
// `params-form-groups.test.ts`/`ActionTestForm.overrides.test.ts`).
g.Window = dom.window.Window;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
(dom.window as unknown as Record<string, unknown>).requestAnimationFrame = raf;
(dom.window as unknown as Record<string, unknown>).cancelAnimationFrame = (id: number) =>
  clearTimeout(id as unknown as NodeJS.Timeout);

// CodeMirror measures selection layers through Range rects, which jsdom omits.
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
const { ExpressionEditorModal } = await import("../components/ExpressionEditorModal.tsx");

type Props = Parameters<typeof ExpressionEditorModal>[0];

async function mountModal(overrides: Partial<Props> = {}) {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  const onSaveCalls: unknown[] = [];
  const onCloseCalls: number[] = [];
  const props: Props = {
    value: undefined,
    options: {},
    onSave: (v) => onSaveCalls.push(v),
    onClose: () => onCloseCalls.push(1),
    ...overrides,
  };
  await act(async () => {
    root.render(React.createElement(ExpressionEditorModal, props));
  });
  return { container, root, onSaveCalls, onCloseCalls };
}

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
};

const labelsOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".w6w-exprmodal-group-label")).map((el) => el.textContent);

const openSection = async (container: HTMLElement, label: string) => {
  const group = Array.from(container.querySelectorAll(".w6w-exprmodal-group")).find(
    (g) => g.querySelector(".w6w-exprmodal-group-label")?.textContent === label,
  );
  if (group && !group.classList.contains("is-open")) {
    await click(group.querySelector('[data-testid="expr-section-toggle"]') as Element);
  }
};

test("starting state: no state sections, reference or value per click, Save writes the object", async () => {
  const saved: unknown[] = [];
  const { container, root } = await mountModal({
    mode: "json-binding",
    startingState: true,
    title: "Starting state",
    jsonValue: undefined,
    onSaveJson: (v) => saved.push(v),
    options: {
      vars: ["region"],
      secrets: ["api_key"],
      documents: [{ key: "welcome" }],
      // A flow host passes these; starting-state mode must not offer them.
      steps: [{ id: "fetch_order" }],
      hasTrigger: true,
      stateShape: { fields: [{ key: "order", paths: "all" }] },
      sampleValues: { "var.region": "us", "documents.welcome": "Hello {{ name }}" },
    },
  });
  assert.deepEqual(labelsOf(container), ["Variables", "Documents"]);
  assert.ok(!container.textContent?.includes("No upstream steps"));

  // Reference (the default): the template is referenced, and the Result shows it resolved.
  await openSection(container, "Documents");
  await click(container.querySelector('[title="Insert welcome"]') as Element);
  const result = () =>
    JSON.parse(container.querySelector('[data-testid="expr-json-result"]')?.textContent ?? "");
  assert.deepEqual(result(), { welcome: "Hello {{ name }}" });

  // Value: the variable's current value is copied in.
  await click(container.querySelector('[data-testid="expr-insert-as-value"]') as Element);
  await openSection(container, "Variables");
  await click(container.querySelector('[title="Insert region"]') as Element);
  assert.deepEqual(result(), { welcome: "Hello {{ name }}", region: "us" });

  await click(container.querySelector('[data-testid="expr-json-save"]') as Element);
  assert.deepEqual(saved, [{ welcome: "{{ documents.welcome }}", region: "us" }]);
  await act(async () => root.unmount());
});
