// Run (from packages/ui): node --max-old-space-size=2048 --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/store-key-param.test.ts
//
// A `data-store-key` param renders a searchable Combobox of the sibling `store`'s entries
// (listDataStoreEntries, one page, server-side key-prefix search) when the provider supplies
// the member and `store` names a store literally; otherwise the plain text input it was.
// A key not in the list and the ƒx expression mode keep working. Same rig as store-param.test.ts.
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
const { W6WUIProvider, WorkflowProjectProvider } = await import("../provider.tsx");
type ActionParam = import("../types.ts").ActionParam;
const { STORE_KEY_PAGE, storeEntryDetail } = await import("../ParamsForm.tsx");

const PARAMS: ActionParam[] = [
  { key: "store", label: "Store", type: "data-store" },
  { key: "key", label: "Key", type: "data-store-key" },
];

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function render(
  api: unknown | null,
  initial: Record<string, unknown> = {},
  project?: string,
) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const box = { current: initial };
  function Harness() {
    const [values, setValues] = React.useState(initial);
    const form = React.createElement(
      ExpressionOptionsProvider,
      { value: { steps: [], sampleValues: {} }, children: null },
      React.createElement(ParamsForm, {
        params: PARAMS,
        values,
        onChange: (next: Record<string, unknown>) => {
          box.current = next;
          setValues(next);
        },
      }),
    );
    const scoped = project
      ? React.createElement(WorkflowProjectProvider, { project, children: form })
      : form;
    return api
      ? React.createElement(W6WUIProvider, { api: api as never, children: scoped })
      : scoped;
  }
  await act(async () => {
    root.render(React.createElement(Harness));
  });
  await settle(5);
  return { container, box, root };
}

type Call = { store: string; project?: string; prefix?: string; limit?: number };

const ENTRIES = [
  { key: "welcome", value: { subject: "Hi there", body: "x" }, updatedAt: "2026-10-30T12:34:56Z" },
  { key: "welcome-back", value: "plain text", updatedAt: "2026-10-31T08:00:00Z" },
  { key: "reset", value: 42 },
];

/** A fake host: prefix-filters ENTRIES server-side, as `GET /data-stores/:id/entries?prefix=`. */
function host(calls: Call[], more = false) {
  return {
    listDataStores: async () => [{ name: "templates", kind: "doc" }],
    listDataStoreEntries: async (
      store: string,
      opts: { project?: string; prefix?: string; limit?: number },
    ) => {
      calls.push({ store, project: opts.project, prefix: opts.prefix, limit: opts.limit });
      const items = ENTRIES.filter((e) => !opts.prefix || e.key.startsWith(opts.prefix));
      return { items: items.slice(0, opts.limit), more };
    },
  };
}

const keyInput = (container: HTMLElement) =>
  container.querySelector("input[role=combobox][aria-label=Key]") as HTMLInputElement | null;

async function open(input: HTMLInputElement) {
  await act(async () => {
    input.focus();
    input.dispatchEvent(new dom.window.FocusEvent("focus", { bubbles: false }));
  });
}

async function type(input: HTMLInputElement, text: string) {
  await act(async () => {
    input.focus();
    setter?.call(input, text);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

const optionKeys = () =>
  Array.from(document.querySelectorAll("[role=listbox][aria-label=Key] [role=option]")).map(
    (o) => o.firstChild?.textContent,
  );

const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;

test("lists the selected store's entries: one page, key plus a value/updated preview", async () => {
  const calls: Call[] = [];
  const { container, root } = await render(host(calls), { store: "templates" }, "p1");
  assert.deepEqual(calls, [
    { store: "templates", project: "p1", prefix: undefined, limit: STORE_KEY_PAGE },
  ]);
  const input = keyInput(container);
  assert.ok(input, "key combobox renders");
  await open(input);
  assert.deepEqual(optionKeys(), ["welcome", "welcome-back", "reset"]);
  const details = Array.from(document.querySelectorAll(".w6w-combobox-detail")).map(
    (d) => d.textContent,
  );
  assert.deepEqual(details, [
    '{"subject":"Hi there","body":"x"} · updated 2026-10-30 12:34',
    "plain text · updated 2026-10-31 08:00",
    "42",
  ]);
  await act(async () => root.unmount());
});

test("typing searches the host by key prefix and the list narrows", async () => {
  const calls: Call[] = [];
  const { container, root } = await render(host(calls), { store: "templates" });
  const input = keyInput(container);
  assert.ok(input);
  await type(input, "welc");
  await settle(300);
  assert.deepEqual(calls.at(-1), {
    store: "templates",
    project: undefined,
    prefix: "welc",
    limit: STORE_KEY_PAGE,
  });
  assert.deepEqual(optionKeys(), ["welcome", "welcome-back"]);
  await type(input, "zzz");
  await settle(300);
  assert.deepEqual(optionKeys(), []);
  assert.match(
    document.querySelector("[role=listbox][aria-label=Key]")?.textContent ?? "",
    /No key starts with "zzz"/,
  );
  await act(async () => root.unmount());
});

test("keystrokes inside the debounce make ONE request", async () => {
  const calls: Call[] = [];
  const { container, root } = await render(host(calls), { store: "templates" });
  const input = keyInput(container);
  assert.ok(input);
  await type(input, "w");
  await type(input, "we");
  await type(input, "wel");
  await settle(300);
  assert.deepEqual(
    calls.map((c) => c.prefix),
    [undefined, "wel"],
  );
  await act(async () => root.unmount());
});

test("picking an entry fills the key", async () => {
  const { container, box, root } = await render(host([]), { store: "templates" });
  const input = keyInput(container);
  assert.ok(input);
  await open(input);
  const opt = Array.from(document.querySelectorAll("[role=option]")).find(
    (o) => o.firstChild?.textContent === "welcome-back",
  ) as HTMLElement | undefined;
  assert.ok(opt);
  await act(async () => {
    opt.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
  });
  assert.equal(box.current.key, "welcome-back");
  assert.equal(box.current.store, "templates");
  await act(async () => root.unmount());
});

test("a key not in the list, typed and blurred, is the value", async () => {
  const { container, box, root } = await render(host([]), { store: "templates" });
  const input = keyInput(container);
  assert.ok(input);
  await type(input, "brand-new");
  await act(async () => {
    input.blur();
  });
  assert.equal(box.current.key, "brand-new");
  await act(async () => root.unmount());
});

test("more entries past the page: a footer says to narrow", async () => {
  const { container, root } = await render(host([], true), { store: "templates" });
  const input = keyInput(container);
  assert.ok(input);
  await open(input);
  assert.match(
    document.querySelector(".w6w-combobox-footer")?.textContent ?? "",
    /More entries — type to narrow/,
  );
  await act(async () => root.unmount());
});

test("ƒx: the plain picker keeps its ƒx button, and a saved expression renders the expression input", async () => {
  const calls: Call[] = [];
  const plain = await render(host(calls), { store: "templates" });
  assert.ok(plain.container.querySelector("button[aria-label='Use an expression for Key']"));
  await act(async () => plain.root.unmount());

  const expr = { type: "expr", parts: [{ kind: "var", ref: "vars.entry_key" }] };
  const { container, box, root } = await render(host(calls), { store: "templates", key: expr });
  assert.equal(keyInput(container), null, "expression mode replaces the picker");
  assert.deepEqual(box.current.key, expr);
  await act(async () => root.unmount());
});

test("no store, a store bound to an expression, or no member: the plain text input, never called", async () => {
  const calls: Call[] = [];
  const cases: [unknown, Record<string, unknown>][] = [
    [host(calls), {}],
    [host(calls), { store: { type: "expr", parts: [{ kind: "var", ref: "vars.store" }] } }],
    [{ listDataStores: async () => [] }, { store: "templates" }],
    [null, { store: "templates" }],
  ];
  for (const [api, initial] of cases) {
    const { container, box, root } = await render(api, initial);
    assert.equal(keyInput(container), null);
    const input = container.querySelector(
      "input[type=text][aria-label=Key]",
    ) as HTMLInputElement | null;
    assert.ok(input, "plain key input");
    await act(async () => {
      setter?.call(input, "k1");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(box.current.key, "k1");
    await act(async () => root.unmount());
  }
  assert.deepEqual(calls, []);
});

test("storeEntryDetail shortens a long value to one line", () => {
  const long = storeEntryDetail({ value: { text: "a\n".repeat(80) } });
  assert.ok(long.length <= 60);
  assert.ok(long.endsWith("…"));
  assert.ok(!long.includes("\n"));
  assert.equal(storeEntryDetail({}), "");
});
