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
  const box = { current: initial };
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
