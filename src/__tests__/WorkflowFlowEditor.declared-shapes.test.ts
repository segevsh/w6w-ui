// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/WorkflowFlowEditor.declared-shapes.test.ts  (Node 24)
//
// 26-11-01-01 T2.1.2: the mounted flow editor feeds the declared output shapes (the REAL
// Eventbrite `list-webhooks` / `order-placed` declarations, `fixtures/eventbrite-declared.json`,
// generated from apps/apps/eventbrite by the harness's eventbrite-fixture.ts) into the picker,
// the ƒx Result preview and the Test tab. Rig: jsdom + react-dom (mirrors
// WorkflowFlowEditor.app-trigger-node.test.ts). Nothing here runs a step: no saved tests and
// no node samples unless a case supplies them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
const win = dom.window as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;
g.matchMedia = (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});
win.matchMedia = g.matchMedia;
class FakeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
g.MutationObserver = win.MutationObserver ?? FakeObserver;
win.MutationObserver = g.MutationObserver;
g.ResizeObserver = FakeObserver;
win.ResizeObserver = FakeObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.Window = dom.window.Window;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
win.requestAnimationFrame = raf;
win.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as NodeJS.Timeout);
const dlg = (dom.window as unknown as { HTMLDialogElement: { prototype: Record<string, unknown> } })
  .HTMLDialogElement.prototype;
dlg.showModal = function (this: { open: boolean }) {
  this.open = true;
};
dlg.close = function (this: { open: boolean }) {
  this.open = false;
};

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { WorkflowFlowEditor } = await import("../WorkflowFlowEditor.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;
type FlowWorkflow = import("../flow-types.ts").FlowWorkflow;

// The REAL Eventbrite declarations (generated; the gate re-derives the file from the source).
const FIXTURE = JSON.parse(
  readFileSync(new URL("./fixtures/eventbrite-declared.json", import.meta.url), "utf8"),
) as {
  app: string;
  action: { key: string; output: unknown; sample: unknown };
  trigger: { key: string; output: unknown; sample: unknown };
};
const EB = FIXTURE.app;
const PROBE = {
  key: "probe",
  title: "Probe",
  params: [{ key: "note", type: "string", label: "Note" }],
};

interface Rig {
  actions?: Record<string, unknown[]>;
  savedTests?: Record<string, unknown>;
  samples?: unknown[];
}
function fakeApi(rig: Rig = {}) {
  const actions = rig.actions ?? {
    [EB]: [{ ...FIXTURE.action, title: "List webhooks", params: [] }, PROBE],
  };
  return {
    listApps: async () => [],
    listAppsPage: async () => ({ apps: [], total: 0 }),
    listAppsByIds: async () => [],
    getAppAuth: async () => [],
    listConnections: async () => [],
    listConnectionsForApp: async () => [],
    listFunctions: async () => [],
    listWorkflows: async () => [],
    getAppActions: async (app: string) => actions[app] ?? [],
    getAppTriggers: async () => [
      { ...FIXTURE.trigger, title: "Order placed", type: "webhook", params: [] },
    ],
    listSavedTests: async () => [],
    listStepTests: async (_wf: string, stepId: string) =>
      rig.savedTests?.[stepId]
        ? [
            {
              id: `st_${stepId}`,
              workflowId: "wf_1",
              stepId,
              name: null,
              input: {},
              with: {},
              createdAt: "",
              updatedAt: "",
              lastRunStatus: "succeeded",
              lastRunOutput: rig.savedTests[stepId],
            },
          ]
        : [],
    ...(rig.samples ? { loadNodeSamples: async () => rig.samples } : {}),
  } as unknown as W6WApi;
}

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const settle = async (n = 4) => {
  for (let i = 0; i < n; i++) await flush();
};
const click = (el: Element | undefined | null) => {
  assert.ok(el, `expected element to click; DOM: ${document.body.textContent?.slice(0, 300)}`);
  return act(async () => {
    (el as HTMLElement).click();
  });
};
const card = (id: string) =>
  document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;

async function mountEditor(value: FlowWorkflow, api: W6WApi) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api,
        children: React.createElement(WorkflowFlowEditor, {
          value,
          apps: [{ id: EB, displayName: "Eventbrite" }],
          height: 600,
          onChange: () => {},
        } as never),
      }),
    );
  });
  await settle();
  return root;
}

const step = (id: string, app: string, action: string, w?: Record<string, unknown>) => ({
  id,
  uses: { app, action },
  with: w ?? {},
});
const wf = (nodes: unknown[], edges: [string, string][]) =>
  ({ id: "wf_1", name: "wf", nodes, edges: edges.map(([from, to]) => ({ from, to })) }) as never;

/** Open the step editor of `id`, then the ƒx picker of its `Note` param. */
async function openPicker(id: string) {
  await act(async () => {
    card(id)?.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
  });
  await settle();
  const fx = document.querySelector(
    '[aria-label="Use an expression for Note"], [aria-label="Edit expression for Note"], [aria-label="Edit expression"]',
  );
  assert.ok(fx, `no ƒx for Note; DOM: ${document.body.textContent?.slice(0, 300)}`);
  await click(fx);
  await settle();
  assert.ok(document.querySelector(".w6w-exprmodal"), "the expression picker is open");
}
/** Expand every disclosure caret in the picker (to a fixpoint). */
async function expandAll() {
  for (let i = 0; i < 40; i++) {
    const c = document.querySelector('.w6w-exprmodal [aria-expanded="false"]');
    if (!c) return;
    await click(c);
  }
}
/** Offered refs (tooltip names) → whether the row is a muted declared-only one. */
function offered(within = ".w6w-exprmodal"): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const b of document.querySelectorAll(`${within} .w6w-exprmodal-source`)) {
    const t = (b.getAttribute("title") ?? "").replace(/^(Use|Insert) /, "");
    out.set(t, b.classList.contains("is-declared-only"));
  }
  return out;
}
const hintsIn = (testId: string) =>
  Array.from(document.querySelectorAll(`.w6w-exprmodal [data-testid="${testId}"]`)).map(
    (n) => n.textContent?.trim() ?? "",
  );

test("A2: nothing ever run - the step after list-webhooks offers the declared webhooks/pagination and the list item fields", async () => {
  const root = await mountEditor(
    wf([step("lw", EB, "list-webhooks"), step("nx", EB, "probe")], [["lw", "nx"]]),
    fakeApi(),
  );
  await openPicker("nx");
  await expandAll();
  const refs = offered();
  for (const k of [
    "webhooks",
    "pagination",
    "webhooks.0.id",
    "webhooks.0.endpoint_url",
    "webhooks.0.actions",
  ]) {
    assert.equal(refs.get(`lw.${k}`), false, `${k} offered`);
  }
  assert.deepEqual(hintsIn("expr-fields-from-declared"), ["declared by the app"]);
  assert.equal(hintsIn("expr-fields-from-test").length, 0, "no test hint: nothing ran");
  await act(async () => root.unmount());
});

test("A2: a For each over list-webhooks' webhooks offers Current item fields id, endpoint_url, actions", async () => {
  const root = await mountEditor(
    wf(
      [
        step("lw", EB, "list-webhooks"),
        {
          ...step("fe", "@w6w/control", "foreach", {
            items: "{{ nodes.lw.output.webhooks }}",
            body: ["nx"],
          }),
        },
        step("nx", EB, "probe"),
      ],
      [["lw", "fe"]],
    ),
    fakeApi(),
  );
  await openPicker("nx");
  await expandAll();
  const refs = offered('.w6w-exprmodal [data-testid="expr-loop-fields"]');
  for (const k of ["id", "endpoint_url", "actions"]) {
    assert.ok(refs.has(k), `Current item field ${k}; got ${[...refs.keys()]}`);
  }
  await act(async () => root.unmount());
});

const DEMO = "io.w6w.demo";
const demoActions = {
  [DEMO]: [
    { key: "plain", title: "Plain", output: [] },
    {
      key: "mk",
      title: "Make",
      output: [
        { key: "b", type: "number", label: "B" },
        { key: "c", type: "number", label: "C" },
      ],
    },
    PROBE,
  ],
};

test("A3: fresh and persisted tiers stay separate - persisted 'from last test', fresh a saved test, real {a,b} with declared {b,c} lists a, b, c (c muted)", async () => {
  const persistedShape = {
    type: "object",
    fields: { pa: { type: "string" }, pb: { type: "number" } },
  };
  const root = await mountEditor(
    wf(
      [
        step("per", DEMO, "plain"),
        step("fre", DEMO, "plain"),
        step("mrg", DEMO, "mk"),
        step("nx", DEMO, "probe"),
      ],
      [
        ["per", "fre"],
        ["fre", "mrg"],
        ["mrg", "nx"],
      ],
    ),
    fakeApi({
      actions: demoActions,
      savedTests: { fre: { fk: 1 }, mrg: { a: 1, b: 2 } },
      samples: [
        {
          nodeId: "per",
          shape: persistedShape,
          sampleOmitted: true,
          source: "step_test",
          updatedAt: "2026-10-01T00:00:00Z",
        },
      ],
    }),
  );
  await openPicker("nx");
  await expandAll();
  const refs = offered();
  // Persisted only: its keys, with the persisted hint (not the fresh one).
  assert.equal(refs.get("per.pa"), false);
  assert.equal(refs.get("per.pb"), false);
  const hints = hintsIn("expr-fields-from-test");
  assert.ok(hints.includes("Fields from last test"), `persisted hint; got ${hints}`);
  // A fresh saved test: the fresh hint, never a declared/persisted one.
  assert.ok(hints.includes("Fields from the last test run"), `fresh hint; got ${hints}`);
  assert.equal(refs.get("fre.fk"), false);
  // Real {a,b} + declared {b,c}: a, b real; c declared-only and muted.
  assert.equal(refs.get("mrg.a"), false);
  assert.equal(refs.get("mrg.b"), false);
  assert.equal(refs.get("mrg.c"), true);
  assert.equal(
    document.querySelectorAll('.w6w-exprmodal [data-testid="expr-declared-only"]').length,
    1,
    "exactly one muted 'declared by the app' (c)",
  );
  await act(async () => root.unmount());
});

test("A4: below an order-placed Eventbrite trigger the picker offers trigger.event and its declared fields", async () => {
  const root = await mountEditor(
    wf(
      [
        {
          id: "tr",
          uses: { app: EB, action: "order-placed", trigger: true },
          with: {},
        },
        step("nx", EB, "probe"),
      ],
      [["tr", "nx"]],
    ),
    fakeApi(),
  );
  await openPicker("nx");
  await expandAll();
  const refs = offered();
  assert.ok(refs.has("trigger.event"), "trigger.event offered");
  assert.ok(refs.has("trigger.event.resource.id"), `got ${[...refs.keys()].join(" | ")}`);
  assert.ok(refs.has("trigger.event.resourceId"));
  await act(async () => root.unmount());
});

const SAMPLE_VALUE = (FIXTURE.action.sample as { pagination: { continuation: string } }).pagination
  .continuation;
const NOTE = {
  type: "expr",
  parts: [{ kind: "var", ref: "nodes.lw.output.pagination.continuation" }],
};

test("A5: the ƒx Result preview and the Test tab preview of a never-run list-webhooks ref show its declared sample", async () => {
  assert.equal(SAMPLE_VALUE, "example-continuation-token");
  const root = await mountEditor(
    wf([step("lw", EB, "list-webhooks"), step("nx", EB, "probe", { note: NOTE })], [["lw", "nx"]]),
    fakeApi(),
  );
  await openPicker("nx");
  const result = document.querySelector(".w6w-exprmodal-result")?.textContent ?? "";
  assert.ok(result.includes(SAMPLE_VALUE), `Result preview; got "${result}"`);
  assert.equal(
    document.querySelector('[data-testid="expr-result-source"]')?.textContent,
    "example from the app",
  );
  // Close the picker, then read the Test tab's resolved parameters.
  const close = Array.from(document.querySelectorAll("dialog button")).find(
    (b) => (b.textContent ?? "").trim() === "Cancel",
  );
  await click(close);
  await settle();
  const testTab = Array.from(document.querySelectorAll(".w6w-subtab")).find(
    (b) => (b.textContent ?? "").trim() === "Test",
  );
  await click(testTab);
  await settle();
  const rows = Array.from(document.querySelectorAll(".w6w-resolved-params > .w6w-resolved-row"));
  const note = rows.find((r) => r.querySelector("span")?.textContent === "Note");
  assert.ok(note, `a Note row; DOM: ${document.body.textContent?.slice(0, 400)}`);
  assert.ok(note.textContent?.includes(SAMPLE_VALUE), `Test tab row; got "${note.textContent}"`);
  await act(async () => root.unmount());
});
