// Run: node --experimental-strip-types --import ./src/test-jsx-loader.mjs --test src/__tests__/WorkflowFlowEditor.step-test-meta.test.ts
//
// T3.2.2: step metadata (`meta`) through the step Test path (`StepTestRun`),
// the seeded start state, and the canvas run path (AST pins). The jsdom shims
// and `StepEditModal` mount are copied from `WorkflowFlowEditor.test-tab.test.ts`.
// Assertions compare primitives / plain data, never a DOM node: a failing
// `assert.equal` on a jsdom element runs util.inspect on it and HANGS the file.
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

import { readFileSync } from "node:fs";
import ts from "typescript";

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { StepEditModal } = await import("../WorkflowFlowEditor.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;

const FIXTURE_META = {
  app: "gate",
  version: "1.0.0",
  action: "check",
  connectionId: "conn_fixture",
};
const RETURNED_META = {
  app: "sendgrid",
  version: "2.3.4",
  action: "send",
  connectionId: "conn_returned",
};
const GATE_OUTPUT = { first_name: "Ada" };

const STEP = {
  id: "mail_1",
  uses: { app: "sendgrid", action: "send", connection: "conn_1" },
  with: {
    subject: { type: "expr", parts: [{ kind: "var", ref: "steps.gate_1.meta.connectionId" }] },
  },
} as const;

type Call = { app: string; action: string; params: unknown; opts: Record<string, unknown> };

function makeApi(invoke: (n: number) => unknown) {
  const calls: Call[] = [];
  const records: Record<string, unknown>[] = [];
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
    invokeAction: async (
      app: string,
      action: string,
      params: unknown,
      opts: Record<string, unknown>,
    ) => {
      calls.push({ app, action, params, opts });
      return invoke(calls.length);
    },
    listSavedTests: async () => [],
    saveStepTest: async () => ({ id: "t1" }),
    recordStepTestRun: async (_w: string, _s: string, body: Record<string, unknown>) => {
      records.push(body);
    },
    startAppOAuthFlow: async () => ({ authorizationUrl: "" }),
    listStepTests: async (_w: string, stepId: string) =>
      stepId === "gate_1"
        ? [
            {
              id: "st1",
              workflowId: "wf_1",
              stepId: "gate_1",
              name: null,
              input: {},
              with: {},
              createdAt: "",
              updatedAt: "",
              lastRunStatus: "succeeded",
              lastRunOutput: GATE_OUTPUT,
              lastRunMeta: FIXTURE_META,
            },
          ]
        : [],
  } as unknown as W6WApi;
  return { api, calls, records };
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
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api,
        children: React.createElement(StepEditModal, {
          workflowId: "wf_1",
          step: STEP,
          upstreamSteps: [{ id: "gate_1", label: "gate_1" }],
          onChange: () => {},
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
  const footerTest = () =>
    Array.from(container.querySelectorAll(".w6w-stepconfig-footer button")).find(
      (b) => b.textContent === "Test" || b.textContent === "Testing…",
    ) as HTMLButtonElement | undefined;
  const clickTest = async () => {
    const b = footerTest();
    assert.ok(b, "footer Test button present");
    await act(async () => {
      b.click();
    });
    await tick();
    await tick();
  };
  const metaBlocks = () =>
    Array.from(container.querySelectorAll(".w6w-testout-label")).filter(
      (l) => l.textContent === "Metadata",
    );
  return { container, root, clickTest, metaBlocks };
}

test("M1 — meta is recorded and shown, and never changes which app/action/connection is invoked", async () => {
  const { api, calls, records } = makeApi(() => ({ value: { ok: true }, meta: RETURNED_META }));
  const { container, root, clickTest, metaBlocks } = await mountAndOpenTest(api);

  const rowText = Array.from(container.querySelectorAll(".w6w-resolved-params > .w6w-resolved-row"))
    .map((r) => r.textContent ?? "")
    .join("|");
  assert.equal(
    rowText.includes("conn_fixture"),
    true,
    "preview resolves steps.gate_1.meta.connectionId",
  );

  await clickTest();
  await clickTest();

  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.equal(c.app, "sendgrid");
    assert.equal(c.action, "send");
    assert.equal(c.opts.connectionId, "conn_1", "connection comes from the step only");
    assert.deepEqual((c.opts.state as { steps: unknown }).steps, {
      gate_1: { output: GATE_OUTPUT, meta: FIXTURE_META },
    });
    assert.equal(JSON.stringify(c.params).includes("conn_returned"), false);
  }
  assert.equal(records.length, 2);
  for (const r of records) {
    assert.equal(r.status, "succeeded");
    assert.deepEqual(r.meta, RETURNED_META);
  }
  const blocks = metaBlocks();
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].parentElement?.textContent?.includes("conn_returned"), true);

  await act(async () => {
    root.unmount();
  });
});

test("M2 — no meta in the response: no `meta` key recorded, no Metadata block", async () => {
  const { api, records } = makeApi(() => ({ value: { ok: true } }));
  const { root, clickTest, metaBlocks } = await mountAndOpenTest(api);
  await clickTest();
  assert.equal(records.length, 1);
  assert.equal(Object.hasOwn(records[0], "meta"), false);
  assert.equal(metaBlocks().length === 0, true, "no Metadata block without meta");
  await act(async () => {
    root.unmount();
  });
});

test("M3 — a rejected invoke records failed with no `meta` key", async () => {
  const { api, records } = makeApi(() => {
    throw new Error("boom");
  });
  const { root, clickTest, metaBlocks } = await mountAndOpenTest(api);
  await clickTest();
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "failed");
  assert.equal(Object.hasOwn(records[0], "meta"), false);
  assert.equal(metaBlocks().length === 0, true);
  await act(async () => {
    root.unmount();
  });
});

// ── Canvas ▶ Run path: AST pins (the path is not cheaply mountable) ─────────
const path = new URL("../WorkflowFlowEditor.tsx", import.meta.url).pathname;
const sf = ts.createSourceFile(
  path,
  readFileSync(path, "utf8"),
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX,
);

function constInit(name: string): ts.Node {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer)
      found = n.initializer;
    if (!found) ts.forEachChild(n, visit);
  };
  ts.forEachChild(sf, visit);
  assert.ok(found, `const ${name} not found`);
  return found;
}
function calls(root: ts.Node, name: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === name) out.push(n);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(root, visit);
  return out;
}
/** Does object literal `o` carry a conditional spread of `meta` (…(meta ? { meta } : {}))? */
function hasMetaSpread(o: ts.ObjectLiteralExpression): boolean {
  return o.properties.some(
    (p) =>
      ts.isSpreadAssignment(p) &&
      ts.isParenthesizedExpression(p.expression) &&
      ts.isConditionalExpression(p.expression.expression) &&
      /\bmeta\b/.test(p.expression.expression.whenTrue.getText(sf)),
  );
}

test("W1 — performRunStep's invoke identity comes from the step, never from state/meta", () => {
  const fn = constInit("performRunStep");
  const inv = calls(fn, "api.invokeAction");
  assert.equal(inv.length, 1);
  assert.equal(inv[0].arguments[0].getText(sf), "step.uses.app");
  assert.equal(inv[0].arguments[1].getText(sf), "step.uses.action");
  const opts = inv[0].arguments[3].getText(sf);
  assert.equal(opts.includes("connectionId: step.uses.connection"), true);
  assert.equal(
    /state\??\.steps|\.meta\b/.test(inv[0].arguments.map((a) => a.getText(sf)).join("\n")),
    false,
  );
});

test("W2 — the succeeded persist and the run result carry meta by conditional spread; failed never does", () => {
  const fn = constInit("performRunStep");
  const persists = calls(fn, "persistStepRun");
  const succeeded = persists.find((c) => c.arguments[2].getText(sf).includes('"succeeded"'));
  const failed = persists.find((c) => c.arguments[2].getText(sf).includes('"failed"'));
  assert.ok(succeeded && failed);
  assert.equal(hasMetaSpread(succeeded.arguments[2] as ts.ObjectLiteralExpression), true);
  assert.equal(failed.arguments[2].getText(sf).includes("meta"), false);
  const done = calls(fn, "setRunResult").find((c) => c.arguments[0].getText(sf).includes('"done"'));
  assert.ok(done);
  assert.equal(hasMetaSpread(done.arguments[0] as ts.ObjectLiteralExpression), true);
  const rec = calls(constInit("persistStepRun"), "api.recordStepTestRun");
  assert.equal(rec.length, 1);
  assert.equal(hasMetaSpread(rec[0].arguments[2] as ts.ObjectLiteralExpression), true);
});

test("W3 — stepSampleValues merges stepMetaSampleValues per upstream step", () => {
  const c = calls(constInit("stepSampleValues"), "stepMetaSampleValues");
  assert.equal(c.length, 1);
  assert.equal(c[0].arguments[0].getText(sf), "st.id");
});

test("C1 — the step-test fetch effect maps `lastRunMeta` into `meta` beside the latest output", () => {
  const maps: ts.ObjectLiteralExpression[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isObjectLiteralExpression(n) &&
      n.properties.some(
        (p) =>
          ts.isPropertyAssignment(p) &&
          p.name.getText(sf) === "output" &&
          p.initializer.getText(sf) === "latest.lastRunOutput",
      )
    )
      maps.push(n);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(sf, visit);
  assert.ok(maps.length >= 1, "the listStepTests mapping exists");
  for (const m of maps) {
    const meta = m.properties.find(
      (p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === "meta",
    );
    assert.ok(meta && ts.isPropertyAssignment(meta), "mapping carries a `meta` property");
    assert.equal(meta.initializer.getText(sf), "latest.lastRunMeta");
  }
});
