// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/ExpressionEditorModal.rail.test.ts  (Node 24)
//
// Mirrors `ExpressionEditorModal.documents.test.ts`'s jsdom + react-dom/client
// + act harness verbatim (same `<dialog>` shims, same `mountModal`, same
// `groupFor(container, labelText)` helper) — no third harness stood up here.
// Covers T1.1.2's rail reorder (A1), the Inputs existence gate (A2), and the
// collapse-by-default mechanism shared by the documents/steps loops (A3).
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

// A leaf row's own click now saves+closes; the icon beside it keeps the old
// insert-into-editor behaviour (T-2).
const copyOf = (srcBtn: Element) =>
  srcBtn.parentElement?.querySelector('[data-testid="expr-copy-to-editor"]') as Element;

// ── A1 — rail order ─────────────────────────────────────────────────────────

test("A1 — order, workflow context: Workflow state occupies the first slot, then Variables, Documents, Secrets", async () => {
  const { container } = await mountModal({
    options: {
      vars: ["v1"],
      secrets: ["s1"],
      documents: [{ key: "doc1" }],
      steps: [{ id: "st1" }],
      hasTrigger: true,
    },
  });
  const labels = Array.from(container.querySelectorAll(".w6w-exprmodal-group-label")).map(
    (el) => el.textContent,
  );
  assert.deepEqual(labels, ["Workflow state", "Variables", "Documents", "Secrets"]);
});

test("A1 — order, Function context: Inputs occupies the first slot, then Variables, Documents, Secrets", async () => {
  const { container } = await mountModal({
    options: {
      vars: ["v1"],
      secrets: ["s1"],
      documents: [{ key: "doc1" }],
      inputs: ["i1"],
    },
  });
  const labels = Array.from(container.querySelectorAll(".w6w-exprmodal-group-label")).map(
    (el) => el.textContent,
  );
  assert.deepEqual(labels, ["Inputs", "Variables", "Documents", "Secrets"]);
});

// ── A2 — Inputs gate: `options.inputs !== undefined`, not `.length > 0` ─────

test("A2 — Inputs absent: no Inputs group DOM at all, while the rest of the rail still renders", async () => {
  const { container } = await mountModal({
    options: { vars: ["v1"] },
  });
  assert.equal(groupFor(container, "Inputs"), null, "no options.inputs ⇒ no Inputs group DOM");
  assert.ok(groupFor(container, "Variables"), "the rest of the rail must still render");
});

test("A2 — Inputs empty array: the group IS present, with its existing 'No inputs' text", async () => {
  const { container } = await mountModal({
    options: { inputs: [] },
  });
  const group = groupFor(container, "Inputs");
  assert.ok(group, "inputs: [] must still render the Inputs group");
  assert.equal(group?.textContent?.includes("No inputs"), true);
});

// ── A3 — collapse-by-default, ONE mechanism serving both loops ─────────────

test("A3 — collapse, document: subsource rows are absent until the toggle is clicked, then present with the exact ref, then collapse again", async () => {
  const { container } = await mountModal({
    options: {
      documents: [{ key: "doc1", fields: [{ key: "f1" }, { key: "f2" }] }],
    },
  });
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;
  const group = groupFor(container, "Documents");
  assert.ok(group);

  assert.equal(
    group?.querySelectorAll(".w6w-exprmodal-subsource-row").length,
    0,
    "collapsed by default — zero subsource rows before any click",
  );
  const toggles = group?.querySelectorAll('[data-testid="expr-toggle-fields"]') ?? [];
  assert.equal(toggles.length, 1, "exactly one toggle for the one multi-field document");
  const toggle = toggles[0] as HTMLButtonElement;
  assert.equal(toggle.getAttribute("aria-expanded"), "false");

  await click(toggle);
  assert.equal(
    group?.querySelectorAll(".w6w-exprmodal-subsource-row").length,
    2,
    "expanded — both surviving fields now render",
  );
  assert.equal(toggle.getAttribute("aria-expanded"), "true");

  const firstFieldBtn = group?.querySelector(
    ".w6w-exprmodal-subsource-row .w6w-exprmodal-source",
  ) as HTMLButtonElement;
  assert.ok(firstFieldBtn);
  await click(copyOf(firstFieldBtn));
  const chip = editor.querySelector(".w6w-expr-chip") as HTMLElement;
  assert.ok(chip, "clicking a field button must insert a chip");
  assert.equal(chip.getAttribute("data-ref"), "documents.doc1.f1");

  await click(toggle);
  assert.equal(
    group?.querySelectorAll(".w6w-exprmodal-subsource-row").length,
    0,
    "a second click on the toggle collapses it again",
  );
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
});

test("A3 — collapse, step: the SAME mechanism reaches the steps loop independently of the documents loop", async () => {
  const { container } = await mountModal({
    options: {
      steps: [{ id: "st1", outputs: [{ key: "o1" }] }],
    },
  });
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;
  const group = groupFor(container, "Workflow state");
  assert.ok(group);

  assert.equal(
    group?.querySelectorAll(".w6w-exprmodal-subsources").length,
    0,
    "collapsed by default — no subsources block before any click",
  );
  const toggles = group?.querySelectorAll('[data-testid="expr-toggle-fields"]') ?? [];
  assert.equal(toggles.length, 1, "exactly one toggle for the one multi-output step");
  const toggle = toggles[0] as HTMLButtonElement;
  assert.equal(toggle.getAttribute("aria-expanded"), "false");

  await click(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  const outputBtn = group?.querySelector(".w6w-exprmodal-subsources .w6w-exprmodal-source");
  assert.ok(outputBtn, "expanded — the step's declared output now renders");

  await click(copyOf(outputBtn as Element));
  const chip = editor.querySelector(".w6w-expr-chip") as HTMLElement;
  assert.ok(chip, "clicking a step output button must insert a chip");
  assert.equal(chip.getAttribute("data-ref"), "steps.st1.output.o1");
});

// ── A3 — no toggle without surviving children ───────────────────────────────

test("A3 — no toggle without children: a document with no fields and a step with no outputs render zero toggles but still insert their whole-source refs", async () => {
  const { container } = await mountModal({
    options: {
      documents: [{ key: "doc1" }],
      steps: [{ id: "st1" }],
    },
  });
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;
  assert.equal(
    container.querySelectorAll('[data-testid="expr-toggle-fields"]').length,
    0,
    "neither source has surviving children — zero toggles anywhere in the rail",
  );

  const docsGroup = groupFor(container, "Documents");
  const docBtn = docsGroup?.querySelector(".w6w-exprmodal-source") as HTMLButtonElement;
  assert.ok(docBtn);
  await click(copyOf(docBtn));

  const stateGroup = groupFor(container, "Workflow state");
  const stepBtn = stateGroup?.querySelector(".w6w-exprmodal-source") as HTMLButtonElement;
  assert.ok(stepBtn);
  await click(copyOf(stepBtn));

  const refs = Array.from(editor.querySelectorAll(".w6w-expr-chip"))
    .map((el) => el.getAttribute("data-ref"))
    .sort();
  assert.deepEqual(refs, ["documents.doc1", "steps.st1.output"]);
});

// ── T-2 — leaf row click = save + close; icon = insert only ────────────────

test("T-2 — a scalar row click saves that single ref (as Save would) and closes, without touching the editor", async () => {
  const { container, onSaveCalls, onCloseCalls } = await mountModal({
    options: { vars: ["v1"] },
  });
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;
  const btn = groupFor(container, "Variables")?.querySelector(".w6w-exprmodal-source") as Element;
  assert.ok(btn);
  await click(btn);
  assert.equal(onSaveCalls.length, 1);
  assert.deepEqual(onSaveCalls[0], { type: "expr", parts: [{ kind: "var", ref: "vars.v1" }] });
  assert.equal(onCloseCalls.length, 1);
  assert.equal(editor.querySelectorAll(".w6w-expr-chip").length, 0);
});

test("T-2 — the 'Copy to expression editor' icon inserts a chip, stays open, and does not save", async () => {
  const { container, onSaveCalls, onCloseCalls } = await mountModal({
    options: { vars: ["v1"] },
  });
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;
  const icon = groupFor(container, "Variables")?.querySelector(
    '[data-testid="expr-copy-to-editor"]',
  ) as HTMLElement;
  assert.ok(icon);
  assert.equal(icon.getAttribute("aria-label"), "Copy to expression editor");
  assert.equal(icon.getAttribute("title"), "Copy to expression editor");
  await click(icon);
  assert.equal(
    (editor.querySelector(".w6w-expr-chip") as HTMLElement).getAttribute("data-ref"),
    "vars.v1",
  );
  assert.equal(onSaveCalls.length, 0);
  assert.equal(onCloseCalls.length, 0);
});

test("T-2 — a composite row (step with fields) keeps click = insert, no save", async () => {
  const { container, onSaveCalls, onCloseCalls } = await mountModal({
    options: { steps: [{ id: "st1", outputs: [{ key: "o1" }] }] },
  });
  const editor = container.querySelector(".w6w-exprmodal-chips") as HTMLElement;
  const whole = groupFor(container, "Workflow state")?.querySelector(
    ".w6w-exprmodal-source",
  ) as Element;
  await click(whole);
  assert.equal(
    (editor.querySelector(".w6w-expr-chip") as HTMLElement).getAttribute("data-ref"),
    "steps.st1.output",
  );
  assert.equal(onSaveCalls.length, 0);
  assert.equal(onCloseCalls.length, 0);
});
