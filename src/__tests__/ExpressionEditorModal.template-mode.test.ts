// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/ExpressionEditorModal.template-mode.test.ts  (Node 24)
//
// Mirrors `StepBuilderModal.commit.test.ts`'s jsdom + react-dom/client + act
// harness (the one real DOM-interaction rig in this suite, per its own
// docstring) plus the two extra shims `WorkflowFlowEditor.test-tab.test.ts`
// adds for a mounted `Modal` (`HTMLDialogElement.prototype.showModal`,
// `matchMedia`) — no third harness stood up here. `ExpressionEditorModal`
// needs no `W6wUIProvider` (it takes `options` as a plain prop, not via a
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

function setTextareaValue(el: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    dom.window.HTMLTextAreaElement.prototype,
    "value",
  );
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

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

const toggleButtons = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".w6w-view-toggle button")) as HTMLButtonElement[];

const enterTemplateMode = async (container: HTMLElement) => {
  const btn = byText(container, "button", "Template");
  assert.ok(btn, "the Template toggle button must be present");
  await act(async () => {
    btn?.click();
  });
};

const exitTemplateMode = async (container: HTMLElement) => {
  const btn = byText(container, "button", "Chips");
  assert.ok(btn, "the Chips toggle button must be present");
  await act(async () => {
    btn?.click();
  });
};

const templateTextarea = (container: HTMLElement) =>
  container.querySelector(".w6w-exprmodal-template-input") as HTMLTextAreaElement | null;

// ── The draft buffer is never parsed back into `parts` on a keystroke ──────

test("the template draft holds exactly what was typed, keystroke by keystroke — never eagerly re-parsed+re-serialized", async () => {
  const { container } = await mountModal({ value: "" });
  await enterTemplateMode(container);
  const textarea = templateTextarea(container);
  assert.ok(textarea);

  // Deliberately irregular inner spacing: the grammar's serializer NORMALIZES
  // `{{  vars.x  }}` (double spaces) to `{{ vars.x }}` (single) on
  // parse→serialize (`.trim()` + a fixed `"{{ " + ref + " }}"` template) — so
  // any implementation that re-derives the controlled value from
  // `parseTemplate`→`serializeTemplate` on every keystroke would visibly
  // reformat it MID-TYPING. A dedicated draft buffer never does.
  const typed = "{{  vars.x  }} and more, {{ vars.";
  let acc = "";
  for (const ch of typed) {
    acc += ch;
    await act(async () => {
      if (textarea) setTextareaValue(textarea, acc);
    });
    assert.equal(textarea?.value, acc, `draft must hold exactly what was typed so far: "${acc}"`);
  }
});

// ── Branched commit: save() and "Use a plain value" ─────────────────────────

test("save() commits the PARSED DRAFT in template mode, not a stale DOM read", async () => {
  const { container, onSaveCalls } = await mountModal({ value: "before" });
  await enterTemplateMode(container);
  const textarea = templateTextarea(container);
  assert.ok(textarea);
  await act(async () => {
    if (textarea) setTextareaValue(textarea, "{{ vars.after }}");
  });

  const saveBtn = byText(container, "button", "Save");
  assert.ok(saveBtn);
  await act(async () => {
    saveBtn?.click();
  });

  assert.equal(onSaveCalls.length, 1);
  assert.deepEqual(onSaveCalls[0], {
    type: "expr",
    parts: [{ kind: "var", ref: "vars.after" }],
  });
  assert.notDeepEqual(onSaveCalls[0], "before");
});

test('"Use a plain value" saves the draft TEXT in template mode, not a stale serializeTemplate(parts)', async () => {
  const { container, onSaveCalls } = await mountModal({ value: "before" });
  await enterTemplateMode(container);
  const textarea = templateTextarea(container);
  assert.ok(textarea);
  await act(async () => {
    if (textarea) setTextareaValue(textarea, "after edit, still text");
  });

  const plainBtn = byText(container, "button", "Use a plain value");
  assert.ok(plainBtn);
  await act(async () => {
    plainBtn?.click();
  });

  assert.equal(onSaveCalls.length, 1);
  assert.equal(onSaveCalls[0], "after edit, still text");
});

// ── Masked: no toggle at all; unmasked: exactly one toggle control ─────────

test("masked hides the template toggle entirely; unmasked shows exactly one toggle control", async () => {
  const masked = await mountModal({ masked: true, value: undefined });
  assert.equal(masked.container.querySelectorAll(".w6w-view-toggle").length, 0);
  await act(async () => {
    masked.root.unmount();
  });

  const unmasked = await mountModal({ value: undefined });
  assert.equal(unmasked.container.querySelectorAll(".w6w-view-toggle").length, 1);
  await act(async () => {
    unmasked.root.unmount();
  });
});

// ── Commit repaints the chips editor from the NEW parts — nothing stale ────

test("leaving template mode repaints the chips editor from the committed parts — the stale chip is gone", async () => {
  const { container } = await mountModal({
    value: { type: "expr", parts: [{ kind: "var", ref: "vars.old" }] },
  });
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;
  assert.ok(editor.querySelector('[data-ref="vars.old"]'), "the initial chip must be painted");

  await enterTemplateMode(container);
  const textarea = templateTextarea(container);
  await act(async () => {
    if (textarea) setTextareaValue(textarea, "{{ vars.new }}");
  });
  await exitTemplateMode(container);

  assert.equal(
    editor.querySelector('[data-ref="vars.old"]'),
    null,
    "the stale chip must not survive the repaint",
  );
  assert.ok(editor.querySelector('[data-ref="vars.new"]'), "the new chip must be painted");
});

// ── The `}}` truncation hazard: T1.1.3's fix must not be reintroduced ──────

test("an expr part whose JSON ends in }} survives chips -> template -> Save unchanged", async () => {
  const exprPart = { kind: "expr" as const, expr: { missing: { var: "a" } } };
  const { container, onSaveCalls } = await mountModal({
    value: { type: "expr", parts: [exprPart] },
  });
  await enterTemplateMode(container);
  const textarea = templateTextarea(container);
  assert.equal(textarea?.value, '{{ ={"missing":{"var":"a"}} }}');

  const saveBtn = byText(container, "button", "Save");
  await act(async () => {
    saveBtn?.click();
  });

  assert.equal(onSaveCalls.length, 1);
  assert.deepEqual(onSaveCalls[0], { type: "expr", parts: [exprPart] });
});

// ── The filler-<br> hazard: two full cycles, no growth ──────────────────────

test("a multiline value ending in \\n: two full chips<->template cycles keep the template text stable and add no extra <br>", async () => {
  const { container } = await mountModal({ value: "line one\n", multiline: true });
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;

  await enterTemplateMode(container);
  const draft1 = templateTextarea(container)?.value;
  await exitTemplateMode(container);
  assert.equal(editor.querySelectorAll("br").length, 1, "exactly one filler <br> after cycle 1");

  await enterTemplateMode(container);
  const draft2 = templateTextarea(container)?.value;
  assert.equal(draft2, draft1, "the template text must be byte-identical across both cycles");
  await exitTemplateMode(container);
  assert.equal(
    editor.querySelectorAll("br").length,
    1,
    "still exactly one filler <br> after cycle 2 — no growth",
  );
});

// ── Warnings actually render in the DOM (not just present-but-unwired) ─────

test("template-mode warnings render in the DOM for an unresolvable ref and an unknown secret", async () => {
  const { container } = await mountModal({
    value: { type: "expr", parts: [{ kind: "var", ref: "vars.ok" }] },
    options: { secrets: ["known"] },
  });
  await enterTemplateMode(container);
  const textarea = templateTextarea(container);
  await act(async () => {
    if (textarea) setTextareaValue(textarea, "{{ nope.x }} and {{ secrets.unknown }}");
  });

  const warnings = Array.from(container.querySelectorAll(".w6w-exprmodal-warnings li")).map(
    (li) => li.textContent ?? "",
  );
  assert.ok(
    warnings.some((w) => w.includes("nope.x")),
    `expected an unresolvable-ref warning, got: ${JSON.stringify(warnings)}`,
  );
  assert.ok(
    warnings.some((w) => w.includes("unknown")),
    `expected an unknown-secret warning, got: ${JSON.stringify(warnings)}`,
  );
});

// ── The render affordance: makeChip's paint -> read round trip ─────────────

test("a render part survives PAINT -> READ intact (not makeChip's bare else / expr fallback)", async () => {
  const { container } = await mountModal({
    value: { type: "expr", parts: [{ kind: "render", ref: "documents.a.body" }] },
  });
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;
  assert.deepEqual(readParts(editor), [{ kind: "render", ref: "documents.a.body" }]);
});

// ── The flip: byte-identical ref, live (no-remount) dis/enable of BOTH controls ──

test("flipping a var chip to render (and back), live — preserves the ref and dis/enables both controls without remounting", async () => {
  const { container } = await mountModal({
    value: { type: "expr", parts: [{ kind: "var", ref: "vars.x" }] },
  });
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;
  const plainValueBtn = () => byText(container, "button", "Use a plain value");

  // Before the flip: both controls enabled.
  assert.ok(
    toggleButtons(container).every((b) => !b.disabled),
    "the template toggle must be enabled before any render part exists",
  );
  assert.equal(plainValueBtn()?.disabled, false);

  const varChip = editor.querySelector('[data-kind="var"]') as HTMLElement;
  assert.ok(varChip, "the var chip should be painted");
  const flip = varChip.querySelector("[data-render-toggle]") as HTMLElement;
  assert.ok(flip, "a var chip must carry the render-flip control");

  await act(async () => {
    flip.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });

  // After the flip, WITHOUT remounting: both controls disabled.
  assert.ok(
    toggleButtons(container).every((b) => b.disabled),
    "the template toggle must disable itself once a render part exists — live, no remount",
  );
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

  assert.ok(
    toggleButtons(container).every((b) => !b.disabled),
    "the template toggle must re-enable once the render part is gone",
  );
  assert.equal(plainValueBtn()?.disabled, false);
  assert.ok(
    editor.querySelector('[data-ref="vars.x"][data-kind="var"]'),
    "the chip must be back to a plain var chip, same ref",
  );
});

test("mounting directly WITH a render part disables both controls immediately (not only after a live flip)", async () => {
  const withRender = await mountModal({
    value: { type: "expr", parts: [{ kind: "render", ref: "documents.a.body" }] },
  });
  assert.ok(toggleButtons(withRender.container).length > 0);
  assert.ok(toggleButtons(withRender.container).every((b) => b.disabled));
  assert.equal(byText(withRender.container, "button", "Use a plain value")?.disabled, true);

  const withoutRender = await mountModal({
    value: { type: "expr", parts: [{ kind: "var", ref: "vars.x" }] },
  });
  assert.ok(toggleButtons(withoutRender.container).every((b) => !b.disabled));
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
