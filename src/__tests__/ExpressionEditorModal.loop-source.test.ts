// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/ExpressionEditorModal.loop-source.test.ts  (Node 24)
//
// T2.4.1: the rail "Loop" group, its inserts, and the Result preview of foreach.* / nodes.* (D-X1).
// Same jsdom + react-dom/client + act harness as `ExpressionEditorModal.rail.test.ts`.
// T3.2.3: the Metadata group (R-7), chip labels (varLabel) and save/reload.
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

// json-binding mode mounts a CodeMirror JsonEditor, which needs these (same shims as
// `ParamsForm.json-binding.test.ts`).
g.Window = dom.window.Window;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
(dom.window as unknown as Record<string, unknown>).requestAnimationFrame = raf;
(dom.window as unknown as Record<string, unknown>).cancelAnimationFrame = (id: number) =>
  clearTimeout(id as unknown as NodeJS.Timeout);
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
const { upstreamSampleValues, upstreamStateSources } = await import("../step-preview-state.ts");
const { workflowToFlow } = await import("../flow-utils.ts");
const { buildResolveScope, resolveParamValue } = await import("../resolve-params.ts");

const q = (c: ParentNode, sel: string) => Array.from(c.querySelectorAll(sel)) as HTMLElement[];
const FIELDS = ["name", "sourceId", "price", "quantity"];
const tickets = [
  { name: "GA", sourceId: "s1", price: 10, quantity: 5 },
  { name: "VIP", sourceId: "s2", seats: 2 },
];
const step = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  uses: { app: "io.w6w.stub", action: "run" },
  position: { x: 0, y: 0 },
  ...extra,
});
const graph = workflowToFlow({
  nodes: [
    step("create_event_1"),
    step("eventbrite_to_cohost_1"),
    {
      ...step("for_each_1"),
      uses: { app: "@w6w/control", action: "foreach" },
      with: {
        items: "{{ nodes.eventbrite_to_cohost_1.output.tickets }}",
        body: ["update_event_ticket_1"],
      },
    },
    step("update_event_ticket_1"),
  ],
  edges: [
    { from: "create_event_1", to: "eventbrite_to_cohost_1" },
    { from: "eventbrite_to_cohost_1", to: "for_each_1" },
  ],
  // biome-ignore lint/suspicious/noExplicitAny: structural fixture
} as any);
const testOutputs = {
  create_event_1: { id: "E1" },
  eventbrite_to_cohost_1: { tickets },
};
const proj = (outs: Record<string, unknown> | undefined) =>
  upstreamStateSources("update_event_ticket_1", graph.nodes, graph.edges, { testOutputs: outs });
const loopLabels = (c: ParentNode) =>
  q(c, '[data-testid="expr-loop-group"] .w6w-exprmodal-source-label').map((e) => e.textContent);
const loopBtn = (c: ParentNode, label: string) =>
  q(c, '[data-testid="expr-loop-group"] .w6w-exprmodal-source').find(
    (b) => b.querySelector(".w6w-exprmodal-source-label")?.textContent === label,
  ) as HTMLElement;

test("R1 - Loop group: Current item, Index, one row per field; each click saves its ref", async () => {
  const p = proj(testOutputs);
  assert.equal(p.loop?.itemOutputs?.length, 4);
  const labels = ["Current item", "Index", ...FIELDS];
  const refs = ["foreach.item", "foreach.index", ...FIELDS.map((f) => `foreach.item.${f}`)];
  for (const [i, label] of labels.entries()) {
    const m = await mountModal({ options: { steps: p.steps, loop: p.loop } });
    assert.deepEqual(loopLabels(m.container), labels);
    await click(loopBtn(m.container, label));
    assert.deepEqual(m.onSaveCalls, [`{{ ${refs[i]} }}`], label);
  }
});

test("R2 - the group renders with empty steps, and without field rows when there is no sample", async () => {
  const { container } = await mountModal({
    options: { steps: [], loop: { foreachId: "for_each_1" } },
  });
  assert.deepEqual(loopLabels(container), ["Current item", "Index"]);
  assert.equal(proj(undefined).loop?.foreachId, "for_each_1");
});

test("R3 - json-binding mode: group renders and 'No upstream steps' does not", async () => {
  const { container } = await mountModal({
    mode: "json-binding",
    options: {
      steps: [],
      loop: {
        foreachId: "for_each_1",
        itemSample: tickets[0],
        itemOutputs: FIELDS.map((key) => ({ key, path: true })),
      },
    },
  });
  assert.equal(loopLabels(container).length, 6);
  assert.equal(container.textContent?.includes("No upstream steps"), false);
});

test("R4 - no loop, no group; and steps-only still shows 'No upstream steps' gate unchanged", async () => {
  const { container } = await mountModal({ mode: "json-binding", options: {} });
  assert.equal(q(container, '[data-testid="expr-loop-group"]').length, 0);
  assert.equal(container.textContent?.includes("No upstream steps"), true);
});

test("P1 - text-mode Result preview: nodes ref, foreach.item field and index all render", async () => {
  const p = proj(testOutputs);
  const sampleValues = upstreamSampleValues(p.steps, testOutputs, {}, p.loop);
  const expect: [string, string][] = [
    ["{{ nodes.create_event_1.output.id }}", "E1"],
    ["{{ foreach.item.name }}", "GA"],
    ["{{ foreach.index }}", "0"],
  ];
  for (const [value, shown] of expect) {
    const { container } = await mountModal({
      value,
      options: { steps: p.steps, loop: p.loop, sampleValues },
    });
    assert.equal(q(container, ".w6w-exprmodal-result")[0].textContent, shown, value);
  }
});

test("P2 - JSON-mode scope resolves foreach.item.name and foreach.index", () => {
  const scope = buildResolveScope({ "foreach.item": tickets[0], "foreach.index": 0 }, undefined);
  const name = resolveParamValue("{{ foreach.item.name }}", scope)[0];
  assert.equal(name.status === "resolved" && name.value, "GA");
  const idx = resolveParamValue("{{ foreach.index }}", scope)[0];
  assert.equal(idx.status === "resolved" && idx.value, 0);
});
