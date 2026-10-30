// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepEditModal.missing-connection.test.ts
// Rig mirrored from StepEditModal.setup-and-configure.test.ts.
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

/** A SendGrid-send-shaped fixture — the literal value U6 asserts against. */
const STEP: FlowStep = {
  id: "mail_1",
  uses: { app: "sendgrid", action: "send", connection: "conn_1" },
  with: { subject: "Hello" },
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
const PROBLEM: StepProblem = { code: "unknown_connection", connection: "conn_1" };

async function mount(
  step: FlowStep,
  stepProblems: StepProblem[] | undefined,
  initialView?: "props" | "json" | "settings",
  conns?: unknown[],
) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const changes: FlowStep[] = [];
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api: fakeApi(conns ? { listConnectionsForApp: async () => conns } : {}),
        children: React.createElement(ExpressionOptionsProvider, {
          value: { sampleValues: {} },
          children: React.createElement(StepEditModal, {
            workflowId: "wf_1",
            step,
            upstreamSteps: [],
            onChange: (next: FlowStep) => changes.push(next),
            onClose: () => {},
            initialView,
            stepProblems,
          }),
        }),
      }),
    );
  });
  await flush();
  return { container, root, changes };
}

function tabs(container: Element) {
  const m: Record<string, HTMLButtonElement> = {};
  for (const b of Array.from(container.querySelectorAll(".w6w-subtabs button"))) {
    m[b.textContent ?? ""] = b as HTMLButtonElement;
  }
  return m;
}
const active = (c: Element) => c.querySelector(".w6w-subtab.active")?.textContent;

test("A3: blocked opens on Setup for props, json and settings", async () => {
  for (const view of ["props", "json", "settings"] as const) {
    const { container, root } = await mount(STEP, [PROBLEM], view);
    assert.equal(active(container), "Setup", view);
    await act(async () => root.unmount());
  }
});

test("A3: no problem / non-matching problem keeps the Configure default", async () => {
  for (const p of [undefined, { code: "unknown_connection", connection: "other" } as StepProblem]) {
    const { container, root } = await mount(STEP, p ? [p] : undefined);
    assert.equal(active(container), "Configure");
    assert.equal(tabs(container).Configure.disabled, false);
    assert.equal(container.querySelector('[role="alert"]'), null);
    await act(async () => root.unmount());
  }
});

test("A4: Configure/Test disabled, clicks stay on Setup, alert names the id", async () => {
  const { container, root } = await mount(STEP, [PROBLEM]);
  const t = tabs(container);
  assert.equal(t.Configure.disabled, true);
  assert.equal(t.Test.disabled, true);
  await act(async () => {
    t.Configure.click();
    t.Test.click();
  });
  assert.equal(active(container), "Setup");
  const alert = container.querySelector('[role="alert"]');
  assert.ok(alert);
  assert.ok(alert.textContent?.includes("conn_1"));
  await act(async () => root.unmount());
});

test("A4: footer Next is disabled while blocked and clicking leaves Setup active", async () => {
  const { container, root } = await mount(STEP, [PROBLEM]);
  const next = Array.from(container.querySelectorAll(".w6w-stepconfig-footer button")).find((b) =>
    b.textContent?.includes("Next"),
  ) as HTMLButtonElement | undefined;
  assert.ok(next);
  assert.equal(next.disabled, true);
  await act(async () => next.click());
  assert.equal(active(container), "Setup");
  await act(async () => root.unmount());
});

test("A5: picking another connection unblocks; onChange differs only in uses.connection", async () => {
  const { container, root, changes } = await mount(STEP, [PROBLEM], "props", [
    { id: "conn_1", appId: "sendgrid", authKey: "apiKey", displayName: "prod" },
    { id: "conn_9", appId: "sendgrid", authKey: "apiKey", displayName: "staging" },
  ]);
  const conn = container.querySelector(
    '.w6w-stepconfig-body button[aria-label="Connection"]',
  ) as HTMLButtonElement;
  assert.ok(conn);
  await act(async () => conn.click());
  await flush();
  const opt = Array.from(container.querySelectorAll(".w6w-stepbuilder-item")).find((e) =>
    e.textContent?.includes("staging"),
  ) as HTMLElement | undefined;
  assert.ok(opt, "the staging connection option should be listed");
  await act(async () => opt.click());
  await flush();
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], { ...STEP, uses: { ...STEP.uses, connection: "conn_9" } });
  const t = tabs(container);
  assert.equal(t.Configure.disabled, false);
  assert.equal(t.Test.disabled, false);
  const next = Array.from(container.querySelectorAll(".w6w-stepconfig-footer button")).find((b) =>
    b.textContent?.includes("Next"),
  ) as HTMLButtonElement | undefined;
  assert.equal(next?.disabled, false);
  assert.equal(container.querySelector('[role="alert"]'), null);
  await act(async () => root.unmount());
});

test("A6: the editor passes the editing node's data.stepProblems into StepEditModal", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../WorkflowFlowEditor.tsx", import.meta.url), "utf8");
  assert.match(src, /stepProblems=\{editingNode\?\.data\.stepProblems\}/);
});
