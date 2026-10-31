// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepEditModal.script-reads.test.ts  (Node 24)
//
// A Run script in the step editor reads data as CODE: `{{ }}` markers in its code become
// `state.nodes.<id>.output…` / `vars.…` / `consts.…` reads when the step opens (a quiet note with
// Undo, never a red banner), Input sits collapsed under "Custom input (advanced)", and the insert
// chips under the code write code reads.
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
// CodeMirror measures text ranges after an insert; jsdom has no layout, so give it empty rects.
const rangeProto = (dom.window as unknown as { Range: { prototype: Record<string, unknown> } })
  .Range.prototype;
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
const { EditorView } = await import("@codemirror/view");
const { StepEditModal } = await import("../WorkflowFlowEditor.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
const { ExpressionOptionsProvider } = await import("../components/ExpressionOptions.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;
type FlowStep = import("../flow-types.ts").FlowStep;

const CODE = `const total = '{{ nodes.fetch.output.costs.total }}';
const region = '{{ var.region }}';
return { total, region };`;
const CONVERTED = `const total = state.nodes.fetch.output.costs.total;
const region = vars.region;
return { total, region };`;

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

async function mount(withValues: Record<string, unknown>, readOnly = false) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const changes: FlowStep[] = [];
  const step: FlowStep = {
    id: "run_script_1",
    uses: { app: "@w6w/script", action: "run" },
    with: withValues,
  };
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api: fakeApi(),
        children: React.createElement(ExpressionOptionsProvider, {
          value: { sampleValues: {}, steps: [{ id: "fetch" }] },
          children: React.createElement(StepEditModal, {
            workflowId: "wf_1",
            step,
            upstreamSteps: [],
            readOnly,
            onChange: (next: FlowStep) => changes.push(next),
            onClose: () => {},
          }),
        }),
      }),
    );
  });
  await flush();
  await flush();
  return { container, root, changes };
}

const note = (c: Element) => c.querySelector(".w6w-script-converted");
const codeView = (c: Element) => {
  const el = c.querySelector('[aria-label="code code"] .cm-editor');
  assert.ok(el, "the code editor");
  const view = EditorView.findFromDOM(el as HTMLElement);
  assert.ok(view);
  return view;
};

test("opening a script converts its {{ }} to code reads, with a quiet note — no red banner", async () => {
  const { container, root, changes } = await mount({ code: CODE });
  assert.equal(changes.at(-1)?.with?.code, CONVERTED);
  assert.match(note(container)?.textContent ?? "", /Converted 2 references to code reads/);
  assert.equal(container.querySelectorAll('[role="alert"]').length, 0, "no alert");
  assert.ok(
    !Array.from(container.querySelectorAll("button")).some(
      (b) => b.textContent === "Move to Input",
    ),
    "no Move to Input",
  );
  assert.equal(codeView(container).state.doc.toString(), CONVERTED);
  await act(async () => root.unmount());
});

test("Undo puts the code back, and it stays back while the step is open", async () => {
  const { container, root, changes } = await mount({ code: CODE });
  const undo = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === "Undo",
  );
  assert.ok(undo, "an Undo button");
  await act(async () => undo.click());
  await flush();
  assert.equal(changes.at(-1)?.with?.code, CODE);
  assert.equal(codeView(container).state.doc.toString(), CODE);
  assert.match(
    note(container)?.textContent ?? "",
    /2 \{\{ \}\} left in the code stay literal text/,
  );
  await act(async () => root.unmount());
});

test("read-only: nothing is rewritten", async () => {
  const { container, root, changes } = await mount({ code: CODE }, true);
  assert.equal(changes.length, 0);
  assert.doesNotMatch(note(container)?.textContent ?? "", /Converted/);
  await act(async () => root.unmount());
});

test("Input is collapsed under Custom input (advanced) when empty, open when set", async () => {
  const empty = await mount({ code: "return input;" });
  const section = () =>
    Array.from(empty.container.querySelectorAll("details")).find((d) =>
      d.querySelector("summary")?.textContent?.includes("Custom input (advanced)"),
    );
  assert.ok(section(), "the Custom input section");
  assert.equal(section()?.open, false, "collapsed when Input is empty");
  assert.equal(empty.changes.length, 0, "no markers, nothing changes");
  await act(async () => empty.root.unmount());

  const set = await mount({ code: "return input;", input: { a: "{{ nodes.fetch.output.a }}" } });
  const open = Array.from(set.container.querySelectorAll("details")).find((d) =>
    d.querySelector("summary")?.textContent?.includes("Custom input (advanced)"),
  );
  assert.equal(open?.open, true, "open when Input holds a value");
  await act(async () => set.root.unmount());
});

test("a step chip inserts a code read; How to read data shows the three reads", async () => {
  const { container, root, changes } = await mount({ code: "return 1;" });
  const chip = container.querySelector(
    '.w6w-script-insert button[title="Insert state.nodes.fetch.output"]',
  );
  assert.ok(chip, "a chip for the upstream step");
  await act(async () => (chip as HTMLButtonElement).click());
  await flush();
  const code = String(changes.at(-1)?.with?.code);
  assert.ok(code.includes("state.nodes.fetch.output"), code);
  assert.ok(!code.includes("{{"), "never a {{ }} marker");
  const help = container.querySelector(".w6w-script-help-examples")?.textContent ?? "";
  for (const read of ["state.nodes.fetch.output", "vars.region", "consts.api_base"]) {
    assert.ok(help.includes(read), read);
  }
  await act(async () => root.unmount());
});
