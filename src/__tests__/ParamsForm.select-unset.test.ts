// Run (from packages/ui): node --max-old-space-size=2048 --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/ParamsForm.select-unset.test.ts
//
// An optional select with no default and a `placeholder` (the `@w6w/model`
// `dialect` / `response` params) renders a leading "unset" choice, shows it
// while nothing is stored, and choosing it clears the value — instead of
// displaying the first option while the step carries nothing.
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
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { ParamsForm } = await import("../ParamsForm.tsx");
const { internalNodeParams, internalNodeDefaults, MODEL_APP } = await import("../flow-types.ts");
type ActionParam = import("../types.ts").ActionParam;

function Harness({
  params,
  initial,
  box,
}: {
  params: ActionParam[];
  initial: Record<string, unknown>;
  box: { current: Record<string, unknown> };
}) {
  const [values, setValues] = React.useState(initial);
  return React.createElement(ParamsForm, {
    params,
    values,
    onChange: (next: Record<string, unknown>) => {
      box.current = next;
      setValues(next);
    },
  });
}

async function render(params: ActionParam[], initial: Record<string, unknown>) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  const box = { current: initial };
  await act(async () => {
    root.render(React.createElement(Harness, { params, initial, box }));
  });
  return { container, root, box };
}

const selects = () =>
  internalNodeParams(MODEL_APP, "complete")
    .filter((p) => p.key === "dialect" || p.key === "response")
    .map((p) => ({ ...p, advanced: false }));

test("unset select shows its placeholder choice and stores nothing", async () => {
  const { container, root, box } = await render(
    selects(),
    internalNodeDefaults(MODEL_APP, "complete"),
  );
  const dialect = container.querySelector('select[aria-label="Dialect"]') as HTMLSelectElement;
  assert.ok(dialect, "dialect select rendered");
  assert.equal(dialect.value, "");
  assert.equal(dialect.options[0]?.textContent, "Provider native");
  assert.deepEqual(
    [...dialect.options].map((o) => o.value),
    ["", "openai", "anthropic", "ollama"],
  );
  const response = container.querySelector('select[aria-label="Response"]') as HTMLSelectElement;
  assert.equal(response.value, "");
  assert.equal(response.options[0]?.textContent, "Both");

  await act(async () => {
    dialect.value = "anthropic";
    dialect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  assert.equal(box.current.dialect, "anthropic");

  await act(async () => {
    dialect.value = "";
    dialect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  assert.equal(box.current.dialect, undefined);
  assert.equal(dialect.value, "");
  await act(async () => root.unmount());
});

test("a select without a placeholder keeps the first-option display", async () => {
  const params: ActionParam[] = [
    {
      key: "m",
      label: "Method",
      type: "select",
      options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
      ],
    },
  ];
  const { container, root } = await render(params, {});
  const sel = container.querySelector('select[aria-label="Method"]') as HTMLSelectElement;
  assert.equal(sel.options.length, 2);
  assert.equal(sel.value, "GET");
  await act(async () => root.unmount());
});
