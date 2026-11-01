// Run (from packages/ui): node --experimental-strip-types --import ./src/test-jsx-loader.mjs --test src/__tests__/ExecutionLogPanel.state.test.ts
// T4.1.3: the per-step State block (state writes, warnings, State after this step).
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body></body></html>");
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
(dom.window as unknown as Record<string, unknown>).matchMedia = g.matchMedia;
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { ExecutionLogPanel } = await import("../components/ExecutionLogPanel.tsx");

type Step = Parameters<typeof ExecutionLogPanel>[0]["steps"][number];

async function mount(step: Step, expand = true) {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ExecutionLogPanel, { steps: [step] }));
  });
  const details = container.querySelector("details");
  if (expand && details) {
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new dom.window.Event("toggle", { bubbles: true }));
    });
  }
  return container;
}

const headings = (c: HTMLElement) =>
  Array.from(c.querySelectorAll(".w6w-execution-log-json strong")).map((e) => e.textContent);
const stateBlock = (c: HTMLElement) => c.querySelector('[data-testid="execution-log-state"]');
const rows = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('[data-testid="execution-log-state-write"]')).map(
    (e) => e.textContent ?? "",
  );
const after = (c: HTMLElement) =>
  c.querySelector('[data-testid="execution-log-state-after"]')?.textContent ?? null;

const ALL_CODES = [
  "not_object",
  "missing_source",
  "null_append",
  "append_not_array",
  "write_too_large",
  "run_too_large",
  "too_deep",
  "key_too_long",
  "forbidden_key",
  "log_truncated",
];

test("S1 - writes + after: rows in array order (never re-sorted), old → new, item suffix, State after", async () => {
  const c = await mount({
    id: "s",
    status: "succeeded",
    output: { id: 7 },
    stateWrites: [
      { path: ["z"], new: 1 },
      { path: ["a", "b"], old: "x", new: { k: [1] } },
      { path: [], old: { q: 1 } },
      { path: ["items"], item: 2, old: [], new: [3] },
    ],
    stateAfter: { z: 1, a: { b: { k: [1] } } },
  });
  assert.equal(stateBlock(c)?.querySelector("strong")?.textContent, "State");
  assert.deepEqual(rows(c), [
    "state.z: (not set) → 1",
    'state.a.b: "x" → {"k":[1]}',
    'state: {"q":1} → (not set)',
    "state.items (item 2): [] → [3]",
  ]);
  const a = after(c) ?? "";
  assert.ok(a.startsWith("State after this step"));
  assert.ok(a.includes('"k": ['));
});

test("S2 - the block is the last child of the row body, after Metadata", async () => {
  const c = await mount({
    id: "s",
    status: "succeeded",
    input: { a: 1 },
    output: { b: 2 },
    meta: { app: "acme", version: "1.0.0", action: "run" } as Step["meta"],
    stateWrites: [{ path: ["x"], new: 1 }],
  });
  const body = c.querySelector(".w6w-execution-log-row-body");
  assert.equal(body?.lastElementChild?.getAttribute("data-testid"), "execution-log-state");
});

test("S3 - headings: Input/Output/Metadata list unchanged; the State block is not a JSON block", async () => {
  const c = await mount({
    id: "s",
    status: "succeeded",
    input: { a: 1 },
    output: { b: 2 },
    meta: { app: "acme", version: "1.0.0", action: "run" } as Step["meta"],
    stateWrites: [{ path: ["x"], new: 1 }],
    stateAfter: { x: 1 },
  });
  assert.deepEqual(headings(c), ["Input", "Output", "Metadata"]);
  assert.equal(stateBlock(c)?.classList.contains("w6w-execution-log-json"), false);
});

test("S4 - warning rows: data-warning, plain label (all ten distinct, never the raw code), unknown code raw", async () => {
  const c = await mount({
    id: "s",
    status: "succeeded",
    stateWrites: [
      ...ALL_CODES.map((code) => ({ path: ["k"], warning: code })),
      { path: ["k"], warning: "brand_new_code" },
    ],
  });
  const els = Array.from(c.querySelectorAll('[data-testid="execution-log-state-write"]'));
  assert.deepEqual(
    els.map((e) => e.getAttribute("data-warning")),
    [...ALL_CODES, "brand_new_code"],
  );
  const texts = els.map((e) => e.textContent ?? "");
  const labels = texts.slice(0, ALL_CODES.length).map((t) => t.slice("state.k: ".length));
  assert.equal(new Set(labels).size, ALL_CODES.length);
  for (const [i, code] of ALL_CODES.entries()) {
    assert.ok(texts[i].startsWith("state.k: "));
    assert.equal(texts[i].includes(code), false, code);
  }
  assert.equal(texts[ALL_CODES.length], "state.k: brand_new_code");
});

test("S5 - absent / null / empty: no block and no new expandability", async () => {
  for (const extra of [
    {},
    { stateWrites: null, stateAfter: null },
    { stateWrites: [], stateAfter: {} },
    { stateWrites: [] },
    { stateAfter: {} },
  ]) {
    const c = await mount({ id: "s", status: "succeeded", ...extra } as Step);
    assert.equal(c.querySelector("details"), null, JSON.stringify(extra));
    assert.equal(stateBlock(c), null, JSON.stringify(extra));
  }
  const withOutput = await mount({
    id: "s",
    status: "succeeded",
    output: { a: 1 },
    stateWrites: [],
    stateAfter: {},
  });
  assert.equal(stateBlock(withOutput), null);
});

test("S6 - a state-only row (no input/output/meta) is expandable and shows the block", async () => {
  const collapsed = await mount(
    { id: "s", status: "succeeded", stateWrites: [{ path: ["x"], new: 1 }] },
    false,
  );
  assert.notEqual(collapsed.querySelector("details"), null);
  const c = await mount({ id: "s", status: "succeeded", stateWrites: [{ path: ["x"], new: 1 }] });
  assert.deepEqual(rows(c), ["state.x: (not set) → 1"]);
  assert.equal(after(c), null);
});

test("S7 - after-only row: State after this step, no write rows", async () => {
  const c = await mount({ id: "s", status: "succeeded", stateAfter: { seed: true } });
  assert.notEqual(stateBlock(c), null);
  assert.deepEqual(rows(c), []);
  assert.ok((after(c) ?? "").includes('"seed": true'));
});

test("S8 - writes with stateAfter {} shows {}", async () => {
  const c = await mount({
    id: "s",
    status: "succeeded",
    stateWrites: [{ path: ["x"], old: 1 }],
    stateAfter: {},
  });
  assert.deepEqual(rows(c), ["state.x: 1 → (not set)"]);
  const a = after(c) ?? "";
  assert.ok(a.includes("{}"), a);
});

test("S9 - long values are truncated with an ellipsis", async () => {
  const c = await mount({
    id: "s",
    status: "succeeded",
    stateWrites: [{ path: ["x"], new: "y".repeat(500) }],
  });
  const [r] = rows(c);
  assert.ok(r.endsWith("…"));
  assert.ok(r.length < 200);
});
