// Run: node --experimental-strip-types --import ./src/test-jsx-loader.mjs --test src/__tests__/StepTestRun.persisted-result.test.ts
//
// T0.3.1: the step modal's Test tab shows the step's newest stored run (success
// or failure) on reopen, labelled with its time; a new run replaces it; nothing
// reaches the workflow document. The jsdom shims, `makeApi` and the mount are
// copied from `WorkflowFlowEditor.step-test-meta.test.ts`. Assertions compare
// primitives, never a DOM node (a failing assert on a jsdom element hangs).
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

// Three more shims beyond the ones above — needed only once this file mounts
// `JsonEditor` (CodeMirror 6), which none of the file's other tests did before
// A4/A5 added the Test tab's code view. Verified necessary and jointly
// sufficient (measured writing this contract).
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
const { StepTestRun } = await import("../StepBuilderModal.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;

const STEP = {
  id: "mail_1",
  uses: { app: "sendgrid", action: "send", connection: "conn_1" },
  with: { subject: "hi" },
} as const;

type Row = Record<string, unknown>;
const row = (over: Row): Row => ({
  id: "st",
  workflowId: "wf_1",
  stepId: "mail_1",
  name: null,
  input: {},
  with: {},
  createdAt: "",
  updatedAt: "",
  ...over,
});
const ok = (at: string, output: unknown): Row =>
  row({ lastRunAt: at, lastRunStatus: "succeeded", lastRunOutput: output });

const A1_ROWS = [
  ok("2026-02-02T00:00:00Z", { v: "new-marker" }),
  ok("2026-01-01T00:00:00Z", { v: "old-marker" }),
];

function makeApi(rows: () => Promise<Row[]>, invoke: () => unknown = () => ({ value: {} })) {
  const counts = { invoke: 0, save: 0, record: 0, list: 0 };
  const api = {
    listApps: async () => [],
    getAppAuth: async () => [],
    listConnectionsForApp: async () => [],
    listConnections: async () => [],
    getAppActions: async () => [
      {
        key: "send",
        title: "Send",
        params: [{ key: "subject", type: "string", label: "Subject" }],
      },
    ],
    invokeAction: async () => {
      counts.invoke++;
      return invoke();
    },
    listSavedTests: async () => [],
    saveStepTest: async () => {
      counts.save++;
      return { id: "t1" };
    },
    recordStepTestRun: async () => {
      counts.record++;
    },
    startAppOAuthFlow: async () => ({ authorizationUrl: "" }),
    listStepTests: async (_w: string, stepId: string) => {
      counts.list++;
      if (stepId !== "mail_1") return [];
      return rows();
    },
  } as unknown as W6WApi;
  return { api, counts };
}

const tick = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

async function mountAndOpenTest(api: W6WApi) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const changes: unknown[] = [];
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api,
        children: React.createElement(StepEditModal, {
          workflowId: "wf_1",
          step: STEP,
          upstreamSteps: [],
          onChange: (s: unknown) => changes.push(s),
          onClose: () => {},
        }),
      }),
    );
  });
  await tick();
  const testTab = Array.from(container.querySelectorAll(".w6w-subtabs button")).find(
    (b) => b.textContent === "Test",
  ) as HTMLButtonElement | undefined;
  assert.ok(testTab, "Test subtab present");
  await act(async () => {
    testTab.click();
  });
  await tick();
  await tick();
  const clickTest = async () => {
    const b = Array.from(container.querySelectorAll(".w6w-stepconfig-footer button")).find(
      (x) => x.textContent === "Test" || x.textContent === "Testing…",
    ) as HTMLButtonElement | undefined;
    assert.ok(b, "footer Test button present");
    await act(async () => {
      b.click();
    });
    await tick();
    await tick();
  };
  const text = () => container.textContent ?? "";
  const q = (sel: string) => container.querySelector(sel);
  const unmount = () =>
    act(async () => {
      root.unmount();
    });
  return { changes, clickTest, text, q, unmount, container };
}

test("A1 — newest by time, not by array position", async () => {
  const { api } = makeApi(async () => A1_ROWS);
  const { text, q, unmount } = await mountAndOpenTest(api);
  assert.equal(text().includes("new-marker"), true);
  assert.equal(text().includes("old-marker"), false);
  assert.equal((q(".w6w-testout-restored")?.textContent ?? "").startsWith("Last run"), true);
  assert.equal((q(".w6w-result-viewer")?.textContent ?? "").includes("new-marker"), true);
  await unmount();
});

test("A1b — the last array element holding the newest run still wins", async () => {
  const { api } = makeApi(async () => [...A1_ROWS].reverse());
  const { text, unmount } = await mountAndOpenTest(api);
  assert.equal(text().includes("new-marker"), true);
  assert.equal(text().includes("old-marker"), false);
  await unmount();
});

test("A2 — a newer failure is the newest run", async () => {
  const { api } = makeApi(async () => [
    ok("2026-01-01T00:00:00Z", { v: "ok-marker" }),
    row({
      lastRunAt: "2026-02-02T00:00:00Z",
      lastRunStatus: "failed",
      lastRunError: "boom-marker",
    }),
  ]);
  const { text, q, unmount } = await mountAndOpenTest(api);
  assert.equal((q(".w6w-result.w6w-error")?.textContent ?? "").includes("boom-marker"), true);
  assert.equal(text().includes("Result (return value)"), false);
  assert.equal(text().includes("ok-marker"), false);
  assert.equal(q(".w6w-testout-restored") !== null, true);
  await unmount();
});

test("A3 — a new run replaces the stored one and never reaches the document", async () => {
  const { api } = makeApi(
    async () => A1_ROWS,
    () => ({ value: { fresh: "fresh-marker" } }),
  );
  const { changes, clickTest, text, q, unmount } = await mountAndOpenTest(api);
  assert.equal(text().includes("new-marker"), true);
  await clickTest();
  assert.equal(text().includes("fresh-marker"), true);
  assert.equal(text().includes("new-marker"), false);
  assert.equal(q(".w6w-testout-restored"), null);
  for (const c of changes) {
    const j = JSON.stringify(c);
    assert.equal(j.includes("fresh-marker") || j.includes("new-marker"), false);
  }
  await unmount();
});

test("A4 — hydration is read-only", async () => {
  const { api, counts } = makeApi(async () => A1_ROWS);
  const { changes, text, unmount } = await mountAndOpenTest(api);
  assert.equal(text().includes("new-marker"), true);
  assert.equal(counts.invoke, 0);
  assert.equal(counts.save, 0);
  assert.equal(counts.record, 0);
  assert.equal(changes.length, 0);
  await unmount();
});

test("A5 — a late read-back never overwrites a session run; no persist, no fetch", async () => {
  let release: (r: Row[]) => void = () => {};
  const late = new Promise<Row[]>((res) => {
    release = res;
  });
  const { api } = makeApi(
    () => late,
    () => ({ value: { fresh: "fresh-marker" } }),
  );
  const { clickTest, text, unmount } = await mountAndOpenTest(api);
  await clickTest();
  assert.equal(text().includes("fresh-marker"), true);
  release(A1_ROWS);
  await tick();
  assert.equal(text().includes("fresh-marker"), true);
  assert.equal(text().includes("new-marker"), false);
  await unmount();

  const direct = makeApi(async () => A1_ROWS);
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api: direct.api,
        children: React.createElement(StepTestRun, {
          app: "sendgrid",
          action: "send",
          values: {},
          canRun: true,
        }),
      }),
    );
  });
  await tick();
  assert.equal(direct.counts.list, 0);
  assert.equal((container.textContent ?? "").includes("new-marker"), false);
  await act(async () => {
    root.unmount();
  });
});
