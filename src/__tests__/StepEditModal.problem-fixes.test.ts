// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepEditModal.problem-fixes.test.ts
// Rig copied from StepEditModal.missing-connection.test.ts.
// Mirrors `WorkflowFlowEditor.test-tab.test.ts`'s jsdom + react-dom/client +
// act rig verbatim (same file it itself mirrors, `StepBuilderModal.commit.test.ts`)
// rather than inventing a second one. See that file's header for why each shim
// exists (`<dialog>.showModal`, `@xyflow/react`'s own stylesheet import, and —
// belt-and-suspenders here, since neither Setup nor the Configure props view
// mounts `JsonEditor`/CodeMirror — the requestAnimationFrame trio).
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

const APPS = [
  { id: "sendgrid", displayName: "SendGrid" },
  { id: "slack", displayName: "Slack" },
];

const ACTIONS_BY_APP: Record<string, { key: string; title: string; params?: unknown[] }[]> = {
  sendgrid: [
    { key: "send", title: "Send", params: [{ key: "subject", type: "string", label: "Subject" }] },
  ],
  slack: [{ key: "post-message", title: "Post message", params: [] }],
};

const CONNS_BY_APP: Record<
  string,
  { id: string; appId: string; authKey: string; displayName: string }[]
> = {
  sendgrid: [{ id: "conn_1", appId: "sendgrid", authKey: "apiKey", displayName: "prod" }],
  slack: [{ id: "conn_2", appId: "slack", authKey: "oauth2", displayName: "workspace" }],
};

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    listApps: async () => APPS,
    getAppAuth: async () => [],
    listConnectionsForApp: async (appId: string) => CONNS_BY_APP[appId] ?? [],
    listConnections: async () => [],
    getAppActions: async (appId: string) => ACTIONS_BY_APP[appId] ?? [],
    invokeAction: async () => ({ value: {} }),
    listStepTests: async () => [],
    saveStepTest: async () => ({ id: "t1" }),
    recordStepTestRun: async () => {},
    createConnection: async () => ({
      id: "c1",
      appId: "sendgrid",
      authKey: "apiKey",
      state: "ok" as const,
    }),
    startAppOAuthFlow: async () => ({ authorizationUrl: "" }),
    ...overrides,
  } as unknown as W6WApi;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

type StepProblem = import("../step-problems.ts").StepProblem;
const { applyStepProblemFix } = await import("../flow-problems.ts");
const { connectDropRefusal } = await import("../flow-problems.ts");
const { workflowToFlow } = await import("../flow-utils.ts");

const BODY_STEP: FlowStep = {
  id: "mail_1",
  uses: { app: "sendgrid", action: "send", connection: "conn_1" },
  with: { subject: "Hi {{ nodes.f.output.name }} and {{ nodes.f.output }}", other: "{{ vars.a }}" },
};
const REFS: StepProblem = {
  code: "foreach_body_refs_output",
  foreachId: "f",
  refs: ["nodes.f.output.name", "nodes.f.output"],
  fix: { kind: "use_current_item", foreachId: "f", label: "Use Current item" },
};
const CONN: StepProblem = { code: "unknown_connection", connection: "conn_gone" };
const INVALID: StepProblem = {
  code: "loop_body_invalid",
  reason: { reason: "legacy_not_linear", stepId: "x" },
};

async function mount(step: FlowStep, stepProblems: StepProblem[], readOnly = false) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
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
            readOnly,
            stepProblems,
          }),
        }),
      }),
    );
  });
  await flush();
  return { container, root, changes };
}

const fixButtons = (c: Element) =>
  Array.from(c.querySelectorAll<HTMLButtonElement>("button[data-fix-code]"));

test("F1: mounting with problems calls onChange zero times; a fix button shows its label", async () => {
  const { container, root, changes } = await mount(BODY_STEP, [CONN, REFS, INVALID]);
  assert.equal(changes.length, 0);
  const btns = fixButtons(container);
  assert.equal(btns.length, 1, "only the problem carrying a fix gets a button");
  assert.equal(btns[0].dataset.fixCode, "foreach_body_refs_output");
  assert.equal(btns[0].textContent, "Use Current item");
  await act(async () => root.unmount());
});

test("F2: one click calls onChange exactly once with applyStepProblemFix(step, problem)", async () => {
  const { container, root, changes } = await mount(BODY_STEP, [REFS]);
  await act(async () => {
    fixButtons(container)[0].click();
  });
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], applyStepProblemFix(BODY_STEP, REFS));
  assert.equal(changes[0].with?.subject, "Hi {{ foreach.item.name }} and {{ foreach.item }}");
  assert.equal(changes[0].with?.other, "{{ vars.a }}");
  await act(async () => root.unmount());
});

test("F3: the button is disabled when readOnly and a click changes nothing", async () => {
  const { container, root, changes } = await mount(BODY_STEP, [REFS], true);
  const btn = fixButtons(container)[0];
  assert.equal(btn.disabled, true);
  await act(async () => {
    btn.click();
  });
  assert.equal(changes.length, 0);
  await act(async () => root.unmount());
});

test("F4: a connection problem at index 1 still blocks (banner shown, Setup tab)", async () => {
  const { container, root } = await mount(BODY_STEP, [REFS, { ...CONN, connection: "conn_1" }]);
  const alert = container.querySelector('[role="alert"]');
  assert.ok(alert);
  assert.match(alert.textContent ?? "", /Connection conn_1 no longer exists/);
  await act(async () => root.unmount());
});

test("F5: no problems, no fix block", async () => {
  const { container, root } = await mount(BODY_STEP, []);
  assert.equal(fixButtons(container).length, 0);
  await act(async () => root.unmount());
});

// ── Fix-now: the Done handle dropped on the loop's own first step ──────────────
const LOOP_WF = {
  manifestVersion: "2",
  id: "wf",
  name: "n",
  nodes: [
    {
      id: "f",
      uses: { app: "@w6w/control", action: "foreach" },
      with: { items: "{{ vars.xs }}", body: ["b0", "b1"] },
    },
    { id: "b0", uses: { app: "x", action: "y" } },
    { id: "b1", uses: { app: "x", action: "y" } },
    { id: "free", uses: { app: "x", action: "y" } },
  ],
  edges: [],
};

test("D1: Done (success) handle dropped on the first body step names outside_inbound", () => {
  const { nodes, edges } = workflowToFlow(LOOP_WF as never);
  assert.equal(connectDropRefusal("f", "b0", "success", nodes, edges), "outside_inbound");
  assert.equal(connectDropRefusal("f", "b1", "success", nodes, edges), "outside_inbound");
});

test("D2: Each item handle onto an already-owned step, and a body step onto its own For each, are loop reasons", () => {
  const { nodes, edges } = workflowToFlow(LOOP_WF as never);
  assert.equal(connectDropRefusal("f", "b0", "each", nodes, edges), "loop_cycle");
  assert.equal(connectDropRefusal("b1", "f", "success", nodes, edges), "loop_cycle");
});

test("D3: an unrelated drop has no loop reason (falls through to the builder)", () => {
  const { nodes, edges } = workflowToFlow(LOOP_WF as never);
  assert.equal(connectDropRefusal("free", "f", "success", nodes, edges), null);
  assert.equal(connectDropRefusal("free", "free", "success", nodes, edges), null);
  assert.equal(connectDropRefusal("free", "b0", "each", nodes, edges), null);
});
