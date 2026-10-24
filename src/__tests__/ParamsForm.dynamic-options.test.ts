// Run (from packages/ui): node --max-old-space-size=2048 --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/ParamsForm.dynamic-options.test.ts
//
// T1.4 A1/A2/A6: form-resolved dynamic options in ParamsForm. Rig mirrors model-route-param.test.ts.
//
// acc-2: a `model-route` param renders a Combobox of listModelRoutes() names when
// the provider supplies the member; otherwise a plain text input, and never calls it.
//
// T3.2.1 - the fx whole-output binding on `json` / childless `group` params.
// Mirrors `ParamsForm.script-language.test.ts`'s JSDOM + react-dom/client rig,
// plus the `<dialog>` shim `ExpressionEditorModal.*.test.ts` needs.
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

// CodeMirror 6 needs these three (verified necessary + jointly sufficient at
// `WorkflowFlowEditor.test-tab.test.ts:47-58`, reused verbatim by
// `params-form-groups.test.ts`/`ActionTestForm.overrides.test.ts`).
g.Window = dom.window.Window;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
(dom.window as unknown as Record<string, unknown>).requestAnimationFrame = raf;
(dom.window as unknown as Record<string, unknown>).cancelAnimationFrame = (id: number) =>
  clearTimeout(id as unknown as NodeJS.Timeout);

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

// CodeMirror measures selection layers through Range rects, which jsdom omits.
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { ParamsForm } = await import("../ParamsForm.tsx");
const { ExpressionOptionsProvider } = await import("../components/ExpressionOptions.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type ActionParam = import("../types.ts").ActionParam;

const DYN: ActionParam = {
  key: "model",
  label: "Model",
  type: "string",
  options: { source: "resolveFields" },
};
const CTX = { appId: "anthropic", actionKey: "messages", connectionId: "c1", appName: "Anthropic" };

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function render(
  api: unknown | null,
  params: ActionParam[],
  dynamic: Record<string, unknown> | undefined,
  initial: Record<string, unknown> = {},
) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const box = { current: initial, n: 0 };
  let setCtx: (d: Record<string, unknown> | undefined) => void = () => {};
  function Harness() {
    const [values, setValues] = React.useState(initial);
    const [ctx, setC] = React.useState(dynamic);
    setCtx = setC;
    const form = React.createElement(
      ExpressionOptionsProvider,
      { value: { steps: [], sampleValues: {} }, children: null },
      React.createElement(ParamsForm, {
        params,
        values,
        dynamic: ctx as never,
        onChange: (next: Record<string, unknown>) => {
          box.current = next;
          box.n += 1;
          setValues(next);
        },
      }),
    );
    return api ? React.createElement(W6WUIProvider, { api: api as never, children: form }) : form;
  }
  await act(async () => {
    root.render(React.createElement(Harness));
  });
  await settle(5);
  return { container, box, root, setCtx: (d: Record<string, unknown> | undefined) => setCtx(d) };
}

type Call = {
  appId: string;
  actionKey: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
};

test("A1: array options + no allowCustom is still the native select", async () => {
  const { container, root } = await render(
    null,
    [{ key: "m", label: "M", type: "string", options: [{ value: "a", label: "A" }] }],
    undefined,
  );
  assert.ok(container.querySelector("select"));
  assert.equal(container.querySelector("[role=combobox]"), null);
  await act(async () => root.unmount());
});

test("A1: adapter absent or dynamic absent = plain input, adapter never called", async () => {
  const calls: Call[] = [];
  const api = {
    resolveActionFields: async (
      appId: string,
      actionKey: string,
      body: Record<string, unknown>,
    ) => {
      calls.push({ appId, actionKey, body });
      return { fields: {} };
    },
  };
  for (const [a, d] of [
    [api, undefined],
    [{}, CTX],
    [null, CTX],
  ] as const) {
    const { container, root } = await render(a, [DYN], d);
    assert.ok(container.querySelector("input[type=text]"), "plain input");
    assert.equal(container.querySelector("[role=combobox]"), null);
    assert.equal(container.querySelector(".w6w-hint"), null);
    await act(async () => root.unmount());
  }
  assert.equal(calls.length, 0);
});

test("A2: one init call, Combobox with returned options, aria-busy while in flight", async () => {
  const calls: Call[] = [];
  let release: (v: unknown) => void = () => {};
  const api = {
    resolveActionFields: (
      appId: string,
      actionKey: string,
      body: Record<string, unknown>,
      o?: { signal?: AbortSignal },
    ) => {
      calls.push({ appId, actionKey, body, signal: o?.signal });
      return new Promise((r) => {
        release = r;
      });
    },
  };
  const params: ActionParam[] = [
    { key: "name", label: "Name", type: "string", default: "x" },
    { key: "tok", label: "Tok", type: "string" },
    DYN,
  ];
  const { container, root } = await render(api, params, CTX, { tok: { $: "steps.a.output" } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].appId, "anthropic");
  assert.equal(calls[0].actionKey, "messages");
  assert.deepEqual(calls[0].body, {
    reason: "init",
    form: { name: "x" },
    fields: ["model"],
    unresolved: ["tok"],
    connectionId: "c1",
  });
  assert.equal(container.querySelector("[aria-busy=true]") !== null, true);
  await act(async () => {
    release({ fields: { model: { options: [{ value: "opus", label: "Opus" }] } } });
  });
  await settle(5);
  assert.equal(container.querySelector("[aria-busy=true]"), null);
  const input = container.querySelector("input[role=combobox]") as HTMLInputElement | null;
  assert.ok(input, "combobox renders");
  await act(async () => {
    input.focus();
    input.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    input.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  const opts = Array.from(document.querySelectorAll("[role=option]")).map((o) => o.textContent);
  assert.deepEqual(opts, ["Opus"]);
  assert.equal(calls.length, 1);
  await act(async () => root.unmount());
});

test("A2: context change aborts in-flight and re-inits with the new connection", async () => {
  const calls: Call[] = [];
  const api = {
    resolveActionFields: (
      appId: string,
      actionKey: string,
      body: Record<string, unknown>,
      o?: { signal?: AbortSignal },
    ) => {
      calls.push({ appId, actionKey, body, signal: o?.signal });
      return new Promise(() => {});
    },
  };
  const { root, setCtx } = await render(api, [DYN], CTX);
  assert.equal(calls.length, 1);
  await act(async () => setCtx({ ...CTX, connectionId: "c2" }));
  await settle(5);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].signal?.aborted, true);
  assert.equal(calls[1].body.connectionId, "c2");
  assert.equal(calls[1].body.reason, "init");
  await act(async () => root.unmount());
});

test("A2: allowCustom field is forceSelection=false (free text is a value)", async () => {
  const api = {
    resolveActionFields: async () => ({
      fields: { model: { options: [{ value: "opus", label: "Opus" }] } },
    }),
  };
  const custom: ActionParam = { ...DYN, config: { allowCustom: true } } as ActionParam;
  const { container, box, root } = await render(api, [custom], CTX);
  const input = container.querySelector("input[role=combobox]") as HTMLInputElement | null;
  assert.ok(input);
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(input, "my-model");
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
  assert.equal(box.current.model, "my-model");
  await act(async () => root.unmount());
});

test("A6: no connection -> free text + hint, no call; unresolved refreshOn -> hint, not requested", async () => {
  const calls: Call[] = [];
  const api = {
    resolveActionFields: async (
      appId: string,
      actionKey: string,
      body: Record<string, unknown>,
    ) => {
      calls.push({ appId, actionKey, body });
      return { fields: {} };
    },
  };
  let r = await render(api, [DYN], { appId: "anthropic", actionKey: "messages" });
  assert.ok(r.container.querySelector("input[type=text]"));
  assert.equal(
    r.container.querySelector(".w6w-hint")?.textContent,
    "Connect an account to load choices",
  );
  await act(async () => r.root.unmount());
  assert.equal(calls.length, 0);

  const dep: ActionParam = {
    key: "organizer",
    label: "Organizer",
    type: "string",
    options: { source: "resolveFields", refreshOn: ["org"] },
  };
  const org: ActionParam = { key: "org", label: "Organization", type: "string" };
  r = await render(api, [org, dep], CTX, { org: { $: "steps.a.output.org" } });
  assert.equal(calls.length, 0);
  assert.equal(
    r.container.querySelector(".w6w-hint")?.textContent,
    "Options unavailable while Organization is an expression",
  );
  assert.ok(r.container.querySelector("input[type=text]"));
  await act(async () => r.root.unmount());
});

// ---- S4: A3 commit, A4 sequencing/cache, A5 stale values, A7 errors ----

const ORG: ActionParam = { key: "org", label: "Organization", type: "string" };
const ORGANIZER: ActionParam = {
  key: "organizer",
  label: "Organizer",
  type: "string",
  options: { source: "resolveFields", refreshOn: ["org"] },
};
const NAME: ActionParam = { key: "name", label: "Name", type: "string" };

const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;

function mockApi(
  respond: (body: Record<string, unknown>, call: Call) => unknown = () => ({ fields: {} }),
) {
  const calls: Call[] = [];
  return {
    calls,
    api: {
      resolveActionFields: (
        appId: string,
        actionKey: string,
        body: Record<string, unknown>,
        o?: { signal?: AbortSignal },
      ) => {
        const c = { appId, actionKey, body, signal: o?.signal };
        calls.push(c);
        return Promise.resolve(respond(body, c));
      },
    },
  };
}

const field = (container: Element, label: string) =>
  container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;

async function typeInto(el: HTMLInputElement, text: string) {
  await act(async () => {
    el.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
    setter?.call(el, text);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function blurOut(el: HTMLInputElement) {
  await act(async () => {
    el.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
  await settle(5);
}

test("A3: text commits on blur only (not per keystroke); unrelated key issues no call", async () => {
  const { api, calls } = mockApi();
  const r = await render(api, [NAME, ORG, ORGANIZER], CTX, { org: "a", name: "n" });
  assert.equal(calls.length, 1); // init
  const org = field(r.container, "Organization");
  await typeInto(org, "b");
  await typeInto(org, "bc");
  await settle(5);
  assert.equal(calls.length, 1, "no call per keystroke");
  await blurOut(org);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.reason, "change");
  assert.deepEqual(calls[1].body.changed, ["org"]);
  assert.deepEqual(calls[1].body.fields, ["organizer"]);
  assert.deepEqual(calls[1].body.previous, { org: "a", name: "n" });
  assert.deepEqual(calls[1].body.form, { org: "bc", name: "n" });
  const name = field(r.container, "Name");
  await typeInto(name, "zzz");
  await blurOut(name);
  assert.equal(calls.length, 2, "key no refreshOn names -> no call");
  await act(async () => r.root.unmount());
});

test("A3: a select pick commits immediately with one change call", async () => {
  const { api, calls } = mockApi();
  const pickOrg: ActionParam = {
    ...ORG,
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
  };
  const r = await render(api, [pickOrg, ORGANIZER], CTX, { org: "a" });
  const sel = r.container.querySelector("select") as HTMLSelectElement;
  await act(async () => {
    const d = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value");
    d?.set?.call(sel, "b");
    sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await settle(5);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.reason, "change");
  assert.deepEqual(calls[1].body.changed, ["org"]);
  assert.deepEqual(calls[1].body.previous, { org: "a" });
  await act(async () => r.root.unmount());
});

test("A4: newer overlapping request aborts the in-flight one; stale response ignored", async () => {
  let n = 0;
  const releases: Array<(v: unknown) => void> = [];
  const calls: Call[] = [];
  const api = {
    resolveActionFields: (
      a: string,
      k: string,
      body: Record<string, unknown>,
      o?: { signal?: AbortSignal },
    ) => {
      calls.push({ appId: a, actionKey: k, body, signal: o?.signal });
      n += 1;
      if (n === 1) return Promise.resolve({ fields: {} });
      return new Promise((res) => releases.push(res));
    },
  };
  const r = await render(api, [ORG, ORGANIZER], CTX, { org: "a" });
  const org = field(r.container, "Organization");
  await typeInto(org, "b");
  await blurOut(org);
  await typeInto(org, "c");
  await blurOut(org);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].signal?.aborted, true, "first change aborted");
  assert.equal(calls[2].signal?.aborted, false);
  // Stale response resolves LATE with options: must not be applied.
  await act(async () => {
    releases[0]({ fields: { organizer: { options: [{ value: "stale", label: "STALE" }] } } });
    releases[1]({ fields: { organizer: { options: [{ value: "fresh", label: "FRESH" }] } } });
  });
  await settle(5);
  const o = field(r.container, "Organizer");
  await act(async () => {
    o.focus();
    o.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    o.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  const opts = Array.from(document.querySelectorAll("[role=option]")).map((x) => x.textContent);
  assert.deepEqual(opts, ["FRESH"]);
  await act(async () => r.root.unmount());
});

test("A4: repeat of same key is served from cache; cache none refetches; errors not cached", async () => {
  for (const cache of ["session", "none"] as const) {
    const { api, calls } = mockApi(() => ({
      fields: { organizer: { options: [{ value: "x", label: "X" }] } },
    }));
    const dep = { ...ORGANIZER, options: { source: "resolveFields", refreshOn: ["org"], cache } };
    const r = await render(api, [ORG, dep as ActionParam], CTX, { org: "a" });
    const org = field(r.container, "Organization");
    await typeInto(org, "b");
    await blurOut(org);
    await typeInto(org, "a");
    await blurOut(org);
    assert.equal(calls.length, cache === "session" ? 2 : 3, `cache=${cache}`);
    await act(async () => r.root.unmount());
  }
  let fail = true;
  const { api, calls } = mockApi((body) =>
    body.reason === "change" && fail
      ? { fields: { organizer: { error: "boom" } } }
      : { fields: { organizer: { options: [{ value: "x", label: "X" }] } } },
  );
  const r = await render(api, [ORG, ORGANIZER], CTX, { org: "a" });
  const org = field(r.container, "Organization");
  await typeInto(org, "b");
  await blurOut(org);
  assert.equal(calls.length, 2);
  fail = false;
  await typeInto(org, "a");
  await blurOut(org);
  await typeInto(org, "b");
  await blurOut(org);
  assert.equal(calls.length, 3, "a served from cache; errored b refetched, not cached");
  await act(async () => r.root.unmount());
});

test("A5: stale literal cleared in the SAME single onChange on change (no allowCustom)", async () => {
  const { api } = mockApi((body) => ({
    fields: {
      organizer: {
        options:
          body.reason === "init" ? [{ value: "gone", label: "G" }] : [{ value: "ok", label: "O" }],
      },
    },
  }));
  const r = await render(api, [ORG, ORGANIZER], CTX, { org: "a", organizer: "gone" });
  const org = field(r.container, "Organization");
  await typeInto(org, "b");
  const before = r.box.n;
  await blurOut(org);
  assert.equal(r.box.n - before, 1, "exactly one onChange for the clear");
  assert.equal("organizer" in r.box.current, false);
  assert.equal(r.box.current.org, "b");
  await act(async () => r.root.unmount());
});

test("A5: with allowCustom a stale literal is kept and flagged; expression never flagged/cleared", async () => {
  const { api } = mockApi(() => ({
    fields: { organizer: { options: [{ value: "ok", label: "O" }] } },
  }));
  const custom = { ...ORGANIZER, config: { allowCustom: true } } as ActionParam;
  let r = await render(api, [ORG, custom], CTX, { org: "a", organizer: "mine" });
  assert.equal(
    r.container.querySelector(".w6w-hint")?.textContent,
    "Not in the list returned by Anthropic",
  );
  const org = field(r.container, "Organization");
  await typeInto(org, "b");
  await blurOut(org);
  assert.equal(r.box.current.organizer, "mine", "kept on change with allowCustom");
  await act(async () => r.root.unmount());

  const expr = { $: "steps.a.output.o" };
  r = await render(api, [ORG, ORGANIZER], CTX, { org: "a", organizer: expr });
  assert.equal(r.container.querySelector(".w6w-hint"), null);
  const org2 = field(r.container, "Organization");
  await typeInto(org2, "b");
  await blurOut(org2);
  assert.deepEqual(r.box.current.organizer, expr, "expression never cleared");
  await act(async () => r.root.unmount());
});

test("A7: per-field error shows alert + Retry for that field only; siblings keep options", async () => {
  const A: ActionParam = {
    key: "a",
    label: "Alpha",
    type: "string",
    options: { source: "resolveFields" },
  };
  const B: ActionParam = {
    key: "b",
    label: "Beta",
    type: "string",
    options: { source: "resolveFields" },
  };
  const { api, calls } = mockApi((body) =>
    (body.fields as string[]).length === 1
      ? { fields: { a: { options: [{ value: "1", label: "ONE" }] } } }
      : {
          fields: {
            a: { error: "a failed" },
            b: { options: [{ value: "y", label: "WHY" }] },
            zzz: { options: [{ value: "q", label: "Q" }] },
          },
        },
  );
  const r = await render(api, [A, B], CTX);
  const alerts = r.container.querySelectorAll("[role=alert]");
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].textContent ?? "", /a failed/);
  assert.equal(alerts[0].querySelectorAll("button").length, 1);
  assert.equal(
    r.container.querySelectorAll("input[role=combobox]").length,
    2,
    "both stay editable",
  );
  const bIn = field(r.container, "Beta");
  await act(async () => {
    bIn.focus();
    bIn.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    bIn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(
    Array.from(document.querySelectorAll("[role=option]")).map((x) => x.textContent),
    ["WHY"],
  );
  await act(async () => {
    (alerts[0].querySelector("button") as HTMLButtonElement).click();
  });
  await settle(5);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body.fields, ["a"]);
  assert.equal(r.container.querySelectorAll("[role=alert]").length, 0);
  await act(async () => r.root.unmount());
});

test("A7: a rejected call alerts the requested fields and Retry re-requests", async () => {
  let n = 0;
  const calls: Call[] = [];
  const api = {
    resolveActionFields: async (a: string, k: string, body: Record<string, unknown>) => {
      calls.push({ appId: a, actionKey: k, body });
      n += 1;
      if (n === 1) throw new Error("network down");
      return { fields: { model: { options: [{ value: "m", label: "M" }] } } };
    },
  };
  const r = await render(api, [DYN], CTX);
  const alert = r.container.querySelector("[role=alert]");
  assert.match(alert?.textContent ?? "", /network down/);
  await act(async () => {
    (alert?.querySelector("button") as HTMLButtonElement).click();
  });
  await settle(5);
  assert.equal(calls.length, 2);
  assert.equal(r.container.querySelector("[role=alert]"), null);
  await act(async () => r.root.unmount());
});
