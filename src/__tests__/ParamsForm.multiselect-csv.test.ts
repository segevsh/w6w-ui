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

const statusParam: ActionParam = {
  key: "status",
  label: "Status",
  type: "multiselect",
  config: { valueFormat: "csv" },
  default: "live",
  options: [
    { value: "live", label: "Live" },
    { value: "draft", label: "Draft" },
    { value: "ended", label: "Ended" },
  ],
};

async function choose(container: HTMLElement, value: string) {
  const select = container.querySelector("select");
  assert.ok(select);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

async function remove(container: HTMLElement, label: string) {
  const button = container.querySelector(
    `button[aria-label="Remove ${label}"]`,
  ) as HTMLButtonElement;
  assert.ok(button);
  await act(async () => button.click());
}

test("CSV multiselect reads a saved filter and preserves its string contract on edits", async () => {
  const { container, root, box } = await render([statusParam], { status: "live,draft" });
  assert.ok(container.querySelector('button[aria-label="Remove Live"]'));
  assert.ok(container.querySelector('button[aria-label="Remove Draft"]'));
  assert.equal(container.querySelector('select option[value="live"]'), null);
  await choose(container, "ended");
  assert.equal(box.current.status, "live,draft,ended");
  await remove(container, "Draft");
  assert.equal(box.current.status, "live,ended");
  await act(async () => root.unmount());
});

test("CSV multiselect uses a string default and clearing it stays empty", async () => {
  const { container, root, box } = await render([statusParam], {});
  assert.ok(container.querySelector('button[aria-label="Remove Live"]'));
  await remove(container, "Live");
  assert.equal(box.current.status, "");
  assert.equal(container.querySelectorAll(".w6w-chip").length, 0);
  await choose(container, "draft");
  assert.equal(box.current.status, "draft");
  await act(async () => root.unmount());
});

test("CSV multiselect preserves existing custom values until explicitly removed", async () => {
  const { container, root, box } = await render([statusParam], { status: "legacy, draft" });
  assert.ok(container.querySelector('button[aria-label="Remove legacy"]'));
  await choose(container, "live");
  assert.equal(box.current.status, "legacy,draft,live");
  await act(async () => root.unmount());
});

test("ordinary multiselects continue storing arrays, including numeric options", async () => {
  const param: ActionParam = {
    key: "status",
    label: "Status",
    type: "multiselect",
    default: [1],
    options: [
      { value: 1, label: "One" },
      { value: 2, label: "Two" },
    ],
  };
  const { container, root, box } = await render([param], {});
  await choose(container, "2");
  assert.deepEqual(box.current.status, [1, 2]);
  await remove(container, "One");
  assert.deepEqual(box.current.status, [2]);
  await remove(container, "Two");
  assert.deepEqual(box.current.status, []);
  await act(async () => root.unmount());
});
