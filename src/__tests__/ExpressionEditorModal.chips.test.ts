// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/ExpressionEditorModal.chips.test.ts  (Node 24)
//
// Mirrors `StepBuilderModal.commit.test.ts`'s jsdom + react-dom/client + act
// harness (the one real DOM-interaction rig in this suite, per its own
// docstring) plus the two extra shims `WorkflowFlowEditor.test-tab.test.ts`
// adds for a mounted `Modal` (`HTMLDialogElement.prototype.showModal`,
// `matchMedia`) — no third harness stood up here. `ExpressionEditorModal`
// needs no `W6WUIProvider` (it takes `options` as a plain prop, not via a
// hook), so this file is simpler than those two on that one point.
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
const { readParts } = await import("../components/expression-dom.ts");
const { DATA_APP, DOCUMENT_APP, INTERNAL_NODES, internalNodeDef } = await import(
  "../flow-types.ts"
);
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

const byText = (container: HTMLElement, tag: string, text: string) =>
  Array.from(container.querySelectorAll(tag)).find((el) => el.textContent === text) as
    | HTMLButtonElement
    | undefined;

// ── "Use a plain value": the non-template arm, positively asserted ─────────

test('"Use a plain value" saves serializeTemplate(parts) and closes', async () => {
  const { container, onSaveCalls, onCloseCalls } = await mountModal({
    value: { type: "expr", parts: [{ kind: "var", ref: "vars.x" }] },
  });

  const plainBtn = byText(container, "button", "Use a plain value");
  assert.ok(plainBtn);
  await act(async () => {
    plainBtn?.click();
  });

  assert.equal(onSaveCalls.length, 1);
  assert.equal(onSaveCalls[0], "{{ vars.x }}");
  assert.equal(onCloseCalls.length, 1, "onClose must fire alongside onSave");
});

// ── The surviving surface, asserted positively (no chips/template toggle) ──

test("the unmasked modal has no view-mode switch (chips/template removed): exactly one plain-value button, one editable chips pane, and an enabled source rail", async () => {
  const { container } = await mountModal({ value: undefined, options: { vars: ["a"] } });

  assert.equal(container.querySelectorAll(".w6w-view-toggle").length, 0);
  assert.equal(
    Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent === "Use a plain value",
    ).length,
    1,
  );
  const chipsEls = container.querySelectorAll(".w6w-exprmodal-chips");
  assert.equal(chipsEls.length, 1);
  assert.equal((chipsEls[0] as HTMLElement).getAttribute("contenteditable"), "true");
  const enabledSources = Array.from(
    container.querySelectorAll("button.w6w-exprmodal-source"),
  ).filter((b) => !(b as HTMLButtonElement).disabled);
  assert.ok(enabledSources.length >= 1, "at least one source rail button must not be disabled");
});

// ── The render affordance: makeChip's paint -> read round trip ─────────────

test("a render part survives PAINT -> READ intact (not makeChip's bare else / expr fallback)", async () => {
  const { container } = await mountModal({
    value: { type: "expr", parts: [{ kind: "render", ref: "documents.a.body" }] },
  });
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;
  assert.deepEqual(readParts(editor), [{ kind: "render", ref: "documents.a.body" }]);
});

// ── The flip: byte-identical ref, live (no-remount) dis/enable of "Use a plain value" ──

test('flipping a var chip to render (and back), live — preserves the ref and dis/enables "Use a plain value" without remounting', async () => {
  const { container } = await mountModal({
    value: { type: "expr", parts: [{ kind: "var", ref: "vars.x" }] },
  });
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;
  const plainValueBtn = () => byText(container, "button", "Use a plain value");

  // Before the flip: enabled.
  assert.equal(plainValueBtn()?.disabled, false);

  const varChip = editor.querySelector('[data-kind="var"]') as HTMLElement;
  assert.ok(varChip, "the var chip should be painted");
  const flip = varChip.querySelector("[data-render-toggle]") as HTMLElement;
  assert.ok(flip, "a var chip must carry the render-flip control");

  await act(async () => {
    flip.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });

  // After the flip, WITHOUT remounting: disabled.
  assert.equal(plainValueBtn()?.disabled, true);

  const renderChip = editor.querySelector('[data-kind="render"]') as HTMLElement;
  assert.ok(renderChip, "the chip must now be a render chip");
  assert.equal(
    renderChip.getAttribute("data-ref"),
    "vars.x",
    "the ref must be byte-identical after the flip — never re-derived",
  );

  // Flip back.
  const flipBack = renderChip.querySelector("[data-render-toggle]") as HTMLElement;
  await act(async () => {
    flipBack.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });

  assert.equal(plainValueBtn()?.disabled, false);
  assert.ok(
    editor.querySelector('[data-ref="vars.x"][data-kind="var"]'),
    "the chip must be back to a plain var chip, same ref",
  );
});

test('mounting directly WITH a render part disables "Use a plain value" immediately (not only after a live flip)', async () => {
  const withRender = await mountModal({
    value: { type: "expr", parts: [{ kind: "render", ref: "documents.a.body" }] },
  });
  assert.equal(byText(withRender.container, "button", "Use a plain value")?.disabled, true);

  const withoutRender = await mountModal({
    value: { type: "expr", parts: [{ kind: "var", ref: "vars.x" }] },
  });
  assert.equal(byText(withoutRender.container, "button", "Use a plain value")?.disabled, false);
});

// ── The Document step: reachable in the palette, exactly one param ─────────
// Pure — no mount needed. Kept in this file (rather than a new one) because
// `flow-types.ts` has no dedicated unit-test file and the contract's
// `inputs.touch` does not add one.

test("DOCUMENT_APP is registered, reachable through the Utilities-tab filter, with exactly one required `key` param and no `project`", async () => {
  // Mirrors `StepBuilderModal.tsx:463-465`'s `UtilitiesFlow` predicate
  // EXACTLY — that is what actually makes the step reachable in the palette,
  // not merely "present in the array".
  const utilities = INTERNAL_NODES.filter(
    (n) => n.group !== "control" && n.group !== "trigger" && n.app !== DATA_APP,
  );
  assert.ok(
    utilities.some((n) => n.app === DOCUMENT_APP),
    "the Document step must be reachable via the Utilities tab",
  );

  const def = internalNodeDef(DOCUMENT_APP, "get");
  assert.ok(def, "internalNodeDef(@w6w/document, get) must be defined");
  assert.deepEqual(
    def?.params.map((p) => p.key),
    ["key"],
  );
  assert.equal(def?.params[0].required, true);
  assert.equal(def?.params[0].type, "string");
  assert.ok(
    !def?.params.some((p) => p.key === "project"),
    "no `project` param — the run's own project is bound host-side (C-6)",
  );
});
