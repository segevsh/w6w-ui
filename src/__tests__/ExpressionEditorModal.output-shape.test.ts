// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/ExpressionEditorModal.output-shape.test.ts  (Node 24)
//
// Same jsdom + react-dom/client + act harness as `ExpressionEditorModal.rail.test.ts`.
// Covers app-action output shapes in the Workflow state rail: nested path fields,
// the "from the last test run" note, and the "run a test" hint.
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

const groupFor = (container: HTMLElement, labelText: string) => {
  const labels = Array.from(container.querySelectorAll(".w6w-exprmodal-group-label"));
  const label = labels.find((l) => l.textContent === labelText);
  return label?.closest(".w6w-exprmodal-group") ?? null;
};

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
};

const { isRefSafePath } = await import("../components/expression-dom.ts");

test("isRefSafePath — each dot segment is checked on its own", () => {
  assert.equal(isRefSafePath("start.utc"), true);
  assert.equal(isRefSafePath("id"), true);
  assert.equal(isRefSafePath("start..utc"), false);
  assert.equal(isRefSafePath("a.{b}"), false);
  assert.equal(isRefSafePath(" a.b"), false);
});

test("a declared nested path field inserts steps.<id>.output.<path>", async () => {
  const { container } = await mountModal({
    options: {
      steps: [
        {
          id: "ev",
          outputs: [
            { key: "start.utc", label: "Start (UTC)", path: true },
            { key: "bad..path", path: true },
          ],
          outputsFrom: "declared",
        },
      ],
    },
  });
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;
  const group = groupFor(container, "Workflow state");
  await click(group?.querySelector('[data-testid="expr-toggle-fields"]') as Element);
  const subs = group?.querySelectorAll(".w6w-exprmodal-subsources .w6w-exprmodal-source") ?? [];
  assert.equal(subs.length, 1, "the unreachable path is dropped, the nested one kept");
  assert.equal(
    group?.querySelector('[data-testid="expr-fields-from-test"]'),
    null,
    "declared fields carry no test-run note",
  );
  await click(subs[0]);
  const chip = editor.querySelector(".w6w-expr-chip") as HTMLElement;
  assert.equal(chip.getAttribute("data-ref"), "steps.ev.output.start.utc");
});

test("a dotted key WITHOUT path stays a literal key and is dropped, as before", async () => {
  const { container } = await mountModal({
    options: { steps: [{ id: "trig", outputs: [{ key: "a.b" }] }] },
  });
  assert.equal(container.querySelectorAll('[data-testid="expr-toggle-fields"]').length, 0);
});

test("fields from a test run say so when expanded", async () => {
  const { container } = await mountModal({
    options: {
      steps: [{ id: "ev", outputs: [{ key: "id", path: true }], outputsFrom: "test" }],
    },
  });
  const group = groupFor(container, "Workflow state");
  await click(group?.querySelector('[data-testid="expr-toggle-fields"]') as Element);
  const note = group?.querySelector('[data-testid="expr-fields-from-test"]');
  assert.equal(note?.textContent, "Fields from the last test run");
});

test("a step with no known shape tells the author to run a test, and still offers its whole output", async () => {
  const { container } = await mountModal({
    options: { steps: [{ id: "ev", needsTest: true }] },
  });
  const group = groupFor(container, "Workflow state");
  const hint = group?.querySelector('[data-testid="expr-needs-test"]');
  assert.equal(hint?.textContent, "Run a test of this step to see its fields");
  assert.equal(container.querySelectorAll('[data-testid="expr-toggle-fields"]').length, 0);
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;
  await click(group?.querySelector(".w6w-exprmodal-source") as Element);
  assert.equal(
    (editor.querySelector(".w6w-expr-chip") as HTMLElement).getAttribute("data-ref"),
    "steps.ev.output",
  );
});
