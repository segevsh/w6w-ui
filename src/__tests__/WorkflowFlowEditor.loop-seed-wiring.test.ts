// Run: node --experimental-strip-types --import ./src/test-jsx-loader.mjs --test src/__tests__/WorkflowFlowEditor.loop-seed-wiring.test.ts
//
// T2.4.2: the loop seed (`state.foreach`) on a For each body step's Test, the refusal on an
// invalid seed, preview == invoke, the For each note, and AST pins for the sites that cannot
// be cheaply mounted (canvas ▶ Run, the two builder sites). Shims copied from
// `WorkflowFlowEditor.step-test-meta.test.ts`.
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

const SIX = Array.from({ length: 6 }, (_, i) => ({
  name: `T${i}`,
  sourceId: `s${i}`,
  price: i * 10,
  quantity: i + 1,
}));
const STEP = {
  id: "update_event_ticket_1",
  uses: { app: "sendgrid", action: "send", connection: "conn_1" },
  with: { subject: "{{ foreach.item.name }}" },
} as const;

type Call = { app: string; action: string; params: unknown; opts: Record<string, unknown> };

function makeApi() {
  const calls: Call[] = [];
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
      return { value: { ok: true } };
    },
    listSavedTests: async () => [],
    saveStepTest: async () => ({ id: "t1" }),
    recordStepTestRun: async () => {},
    startAppOAuthFlow: async () => ({ authorizationUrl: "" }),
    listStepTests: async () => [],
  } as unknown as W6WApi;
  return { api, calls };
}

const tick = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

type Props = Record<string, unknown>;

async function mount(api: W6WApi, step: Record<string, unknown>, props: Props, openTest = true) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const render = async (p: Props) => {
    await act(async () => {
      root.render(
        React.createElement(W6WUIProvider, {
          api,
          children: React.createElement(StepEditModal, {
            workflowId: "wf_1",
            step: step as never,
            upstreamSteps: [],
            onChange: () => {},
            onClose: () => {},
            ...p,
          }),
        }),
      );
    });
    await tick();
  };
  await render(props);
  if (openTest) {
    const testTab = Array.from(container.querySelectorAll(".w6w-subtabs button")).find(
      (b) => b.textContent === "Test",
    ) as HTMLButtonElement | undefined;
    assert.ok(testTab, "Test subtab present");
    await act(async () => {
      testTab.click();
    });
    await tick();
  }
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
  const win = dom.window as unknown as Record<string, { prototype: object }>;
  const setField = async (label: string, value: string) => {
    const el = container.querySelector(`[aria-label="${label}"]`) as
      | HTMLTextAreaElement
      | HTMLInputElement
      | null;
    assert.ok(el, `${label} control present`);
    const proto = el.tagName === "TEXTAREA" ? win.HTMLTextAreaElement : win.HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
    assert.ok(setter);
    await act(async () => {
      setter.call(el, value);
      el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await tick();
  };
  const resolvedText = () =>
    Array.from(container.querySelectorAll(".w6w-resolved-params .w6w-resolved-row"))
      .map((r) => r.textContent ?? "")
      .join("|");
  return {
    container,
    root,
    render,
    clickTest,
    setField,
    resolvedText,
    footerDisabled: () => footerTest()?.disabled,
    unmount: () =>
      act(async () => {
        root.unmount();
      }),
  };
}

const LOOP = { foreachId: "for_each_1", itemSample: SIX[0] };
const stateOf = (c: Call) => c.opts.state as { foreach?: unknown; steps?: unknown } | undefined;

test("AC1 — Test sends state.foreach = { item: sample, index: 0 }; edits are sent exactly", async () => {
  const { api, calls } = makeApi();
  const m = await mount(api, STEP, { loop: LOOP });
  await m.clickTest();
  assert.equal(calls.length, 1);
  assert.deepEqual(stateOf(calls[0])?.foreach, { item: SIX[0], index: 0 });
  await m.setField("Current item", JSON.stringify(SIX[4]));
  await m.setField("Index", "3");
  await m.clickTest();
  assert.equal(calls.length, 2);
  assert.deepEqual(stateOf(calls[1])?.foreach, { item: SIX[4], index: 3 });
  await m.unmount();
});

test("AC1 — a late-arriving sample is sent while untouched, ignored once edited", async () => {
  const { api, calls } = makeApi();
  const m = await mount(api, STEP, { loop: { foreachId: "for_each_1" } });
  await m.render({ loop: { foreachId: "for_each_1", itemSample: SIX[1] } });
  await m.clickTest();
  assert.deepEqual(stateOf(calls[0])?.foreach, { item: SIX[1], index: 0 });
  await m.setField("Current item", JSON.stringify(SIX[2]));
  await m.render({ loop: { foreachId: "for_each_1", itemSample: SIX[5] } });
  await m.clickTest();
  assert.deepEqual(stateOf(calls[1])?.foreach, { item: SIX[2], index: 0 });
  await m.unmount();
});

test("AC2 — off a loop: no foreach key, and no state at all without seeds", async () => {
  const { api, calls } = makeApi();
  const m = await mount(api, STEP, {});
  await m.clickTest();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.state, undefined);
  assert.equal(m.container.querySelector('[aria-label="Current item"]'), null);
  await m.unmount();
});

test("AC3 — invalid item JSON / bad index refuses the run, visibly, never falling back", async () => {
  const { api, calls } = makeApi();
  const m = await mount(api, STEP, { loop: LOOP });
  await m.setField("Current item", "{nope");
  assert.equal(m.footerDisabled(), true);
  await m.clickTest();
  assert.equal(calls.length, 0);
  assert.equal((m.container.textContent ?? "").includes("must be valid JSON"), true);
  await m.setField("Current item", JSON.stringify(SIX[0]));
  for (const bad of ["-1", "1.5"]) {
    await m.setField("Index", bad);
    await m.clickTest();
    assert.equal(calls.length, 0, `index ${bad}`);
    assert.equal((m.container.textContent ?? "").includes("The index must be"), true);
  }
  await m.setField("Index", "2");
  await m.clickTest();
  assert.equal(calls.length, 1);
  await m.unmount();
});

test("AC4 — the ResolvedParams preview follows the edited seed", async () => {
  const { api } = makeApi();
  const m = await mount(api, STEP, { loop: LOOP });
  assert.equal(m.resolvedText().includes("T0"), true);
  await m.setField("Current item", JSON.stringify({ name: "EDITED" }));
  const t = m.resolvedText();
  assert.equal(t.includes("EDITED"), true);
  assert.equal(t.includes("T0"), false);
  await m.unmount();
});

const FE_STEP = {
  id: "for_each_1",
  uses: { app: "@w6w/control", action: "foreach" },
  with: {
    items: "{{ nodes.eventbrite_to_cohost_1.output.tickets }}",
    body: ["update_event_ticket_1"],
  },
} as const;
const GENERIC = "Flow-control nodes can't be tested on their own.";

test("AC6 — For each note: N items / 1 item / no count, no generic line; `if` keeps the generic line", async () => {
  const { api } = makeApi();
  const text = async (step: Record<string, unknown>, props: Props) => {
    const m = await mount(api, step, props);
    const t = m.container.textContent ?? "";
    await m.unmount();
    return t;
  };
  const six = await text(FE_STEP, { foreachItemCount: 6 });
  assert.equal(six.includes("6 items"), true);
  assert.equal(six.includes("Each item"), true);
  assert.equal(six.includes(GENERIC), false);
  const one = await text(FE_STEP, { foreachItemCount: 1 });
  assert.equal(one.includes("1 item") && !one.includes("1 items"), true);
  const zero = await text(FE_STEP, { foreachItemCount: 0 });
  assert.equal(zero.includes("0 items"), true);
  const none = await text(FE_STEP, {});
  assert.equal(/\d+ items?/.test(none), false);
  assert.equal(none.includes("Each item"), true);
  const iff = await text({ id: "if_1", uses: { app: "@w6w/control", action: "if" } }, {});
  assert.equal(iff.includes(GENERIC), true);
});

// ── AC5: AST pins for the sites that are not cheaply mountable ─────────────
function parse(rel: string) {
  const p = new URL(rel, import.meta.url).pathname;
  return ts.createSourceFile(
    p,
    readFileSync(p, "utf8"),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX,
  );
}
function callsIn(sf: ts.SourceFile, scope: string | null, name: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const visitAll = (root: ts.Node) => {
    const v = (n: ts.Node) => {
      if (ts.isCallExpression(n) && n.expression.getText(sf) === name) out.push(n);
      ts.forEachChild(n, v);
    };
    ts.forEachChild(root, v);
  };
  if (scope === null) visitAll(sf);
  else {
    const f = (n: ts.Node) => {
      if (ts.isFunctionDeclaration(n) && n.name?.getText(sf) === scope) visitAll(n);
      else ts.forEachChild(n, f);
    };
    ts.forEachChild(sf, f);
  }
  return out;
}

test("AC5 — StepRunCollect passes the loop seed as startStateFromSeeds' 2nd argument", () => {
  const c = callsIn(parse("../WorkflowFlowEditor.tsx"), "StepRunCollect", "startStateFromSeeds");
  assert.equal(c.length, 1);
  assert.equal(c[0].arguments.length, 2);
});

test("AC5 — both StepBuilderModal sites pass a loop-derived 2nd argument", () => {
  const sf = parse("../StepBuilderModal.tsx");
  for (const site of ["ControlStepConfig", "AppStepConfig"]) {
    const c = callsIn(sf, site, "startStateFromSeeds");
    assert.equal(c.length, 1, site);
    assert.equal(c[0].arguments.length, 2, site);
    assert.equal(/loop/.test(c[0].arguments[1].getText(sf)), true, site);
  }
});

test("AC5 — the ▶ Run projection call passes stepShapes (4th argument)", () => {
  const sf = parse("../WorkflowFlowEditor.tsx");
  const c = callsIn(sf, null, "upstreamStateSources").filter(
    (x) => x.arguments[0]?.getText(sf) === "runResult.stepId",
  );
  assert.equal(c.length, 1);
  assert.equal(c[0].arguments[3]?.getText(sf), "stepShapes");
});
