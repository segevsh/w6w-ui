// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/params-form-groups.test.ts  (Node 24)
//
// Mirrors `StepBuilderModal.commit.test.ts:1-99`'s JSDOM/`act`/`setInputValue`
// rig, plus the CodeMirror shims (`Window`/`requestAnimationFrame`/
// `cancelAnimationFrame`) `JsonEditor.copy.test.ts:47-55` establishes — this
// file's D-2-ceiling fallback and childless-group fallback both mount the real
// `JsonParamField` → `JsonEditor` → CodeMirror stack.
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
// `JsonEditor.copy.test.ts:47-55`).
g.Window = dom.window.Window;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
(dom.window as unknown as Record<string, unknown>).requestAnimationFrame = raf;
(dom.window as unknown as Record<string, unknown>).cancelAnimationFrame = (id: number) =>
  clearTimeout(id as unknown as NodeJS.Timeout);

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { ParamsForm } = await import("../ParamsForm.tsx");
type ActionParam = import("../types.ts").ActionParam;

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

function setInputValue(input: Element | null, value: string) {
  const el = input as HTMLInputElement;
  const descriptor = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  );
  const setter = descriptor?.set;
  setter?.call(el, value);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

/** Flush the async tick CodeMirror's view creation needs (shimmed RAF above). */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

// `ParamsForm`/`ArrayField` are controlled components (rendered `items` derive
// from the `value` prop, not local state) — a stateful wrapper is needed so a
// click that fires `onChange` is actually reflected back into the next render,
// exactly as any real consumer (`StepBuilderModal`) would feed it back.
function Harness({
  params,
  initialValues,
  onChangeCapture,
}: {
  params: ActionParam[];
  initialValues: Record<string, unknown>;
  onChangeCapture: (next: Record<string, unknown>) => void;
}) {
  const [values, setValues] = React.useState(initialValues);
  return React.createElement(ParamsForm, {
    params,
    values,
    onChange: (next: Record<string, unknown>) => {
      onChangeCapture(next);
      setValues(next);
    },
  });
}

async function render(params: ActionParam[], values: Record<string, unknown>) {
  const calls: Record<string, unknown>[] = [];
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(Harness, {
        params,
        initialValues: values,
        onChangeCapture: (next: Record<string, unknown>) => calls.push(next),
      }),
    );
  });
  return { container, root, calls };
}

// Mirrors packages/apps/apps/companycam/actions/project-create.ts's real
// `address` group: six string children, three sharing `row: "locality"`.
const ADDRESS_GROUP: ActionParam = {
  key: "address",
  label: "Address",
  type: "group",
  children: [
    { key: "street1", label: "Street address", type: "string" },
    { key: "street2", label: "Street address 2", type: "string" },
    { key: "city", label: "City", type: "string", row: "locality" },
    { key: "state", label: "State", type: "string", row: "locality" },
    { key: "postalCode", label: "Postal code", type: "string", row: "locality" },
    { key: "country", label: "Country", type: "string" },
  ],
};

test("G1 — a group with children renders GroupField: 6 real inputs, one heading, the row-grouped children on one line", async () => {
  const { container, root } = await render([ADDRESS_GROUP], {});

  // No JSON-editor fallback engaged — this IS the nested form, not the escape
  // valve a childless group falls back to.
  assert.equal(container.querySelector(".w6w-json-editor"), null);

  const inputs = container.querySelectorAll("input");
  assert.equal(inputs.length, 6, "all six children render as real inputs");

  const heading = Array.from(container.querySelectorAll("span")).filter(
    (el) => el.textContent === "Address",
  );
  assert.equal(heading.length, 1, "the group's heading text renders exactly once");

  // The three `row: "locality"` children sit on one line: one `.w6w-field-row`
  // wrapping exactly city/state/postalCode.
  const rows = container.querySelectorAll(".w6w-field-row");
  assert.equal(rows.length, 1, "exactly one row-grouped cluster");
  assert.equal(rows[0].querySelectorAll("input").length, 3, "the locality row holds 3 inputs");

  await act(async () => {
    root.unmount();
  });
});

test("G2 — a group with NO children (or an empty array) still falls back to the JSON editor", async () => {
  const noChildrenKey: ActionParam = { key: "settingsA", label: "Settings A", type: "group" };
  const emptyChildrenKey: ActionParam = {
    key: "settingsB",
    label: "Settings B",
    type: "group",
    children: [],
  };

  for (const param of [noChildrenKey, emptyChildrenKey]) {
    const { container, root } = await render([param], {});
    await settle();
    assert.ok(
      container.querySelector(".w6w-json-editor"),
      `${param.key}: the childless-group fallback must be preserved, not removed`,
    );
    await act(async () => {
      root.unmount();
    });
  }
});

test("G3 — GroupField writes a NESTED record on child edit, never a flat top-level key", async () => {
  const group: ActionParam = {
    key: "address",
    label: "Address",
    type: "group",
    children: [{ key: "street1", label: "Street address", type: "string" }],
  };
  const { container, root, calls } = await render([group], {});

  const input = container.querySelector('input[aria-label="Street address"]');
  assert.ok(input, "the child input must render");
  await act(async () => {
    setInputValue(input, "1 Main St");
  });

  assert.equal(calls.length, 1, "onChange fires exactly once");
  const next = calls[0];
  // The exact SectionField-copied-too-literally mistake: writing the child key
  // flat at the top level instead of nested under the group's own key.
  assert.equal(next.street1, undefined, "must NOT write the child key flat at the top level");
  assert.deepEqual(
    next.address,
    { street1: "1 Main St" },
    "must write a Record keyed by the child's key, nested under the group's own key",
  );

  await act(async () => {
    root.unmount();
  });
});

test('G4 — a scalar repeat param routes to ArrayField with an EXPLICIT synthesized item (not ArrayField\'s own "string" default)', async () => {
  const param: ActionParam = {
    key: "retryDelays",
    label: "Retry delays",
    type: "number",
    repeat: true,
  };
  const { container, root } = await render([param], {});

  assert.ok(container.querySelector(".w6w-array-row") === null, "no rows yet — none added");
  const addBtn = container.querySelector(".w6w-array-add");
  assert.ok(addBtn, "the existing ArrayField's add button must render");
  await act(async () => {
    addBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });

  const row = container.querySelector(".w6w-array-row");
  assert.ok(row, "existing ArrayField chrome renders the new row");
  const cell = row.querySelector("input");
  assert.ok(cell, "the blank row renders an input");
  assert.equal(
    cell.getAttribute("type"),
    "number",
    'item.type must be the param\'s own type, not the literal "string" default',
  );
  assert.equal(cell.value, "0", 'a number item\'s blank row must be 0, not ""');

  await act(async () => {
    root.unmount();
  });
});

// Mirrors packages/apps/apps/slack/actions/user-update-profile.ts's real
// `customFields` shape.
const CUSTOM_FIELDS: ActionParam = {
  key: "customFields",
  label: "Custom fields",
  type: "group",
  repeat: true,
  children: [
    { key: "id", label: "Field ID", type: "string" },
    { key: "value", label: "Value", type: "string" },
  ],
};

test("G5 — a repeat group with scalar-only children routes to ArrayField's object-item mode (never a second list component)", async () => {
  const { container, root } = await render([CUSTOM_FIELDS], {
    customFields: [{ id: "a", value: "b" }],
  });

  // Both classes present: proof this is the SAME ArrayField object-item mode,
  // not a parallel implementation.
  assert.ok(container.querySelector(".w6w-array-row"), "w6w-array-row present");
  assert.ok(container.querySelector(".w6w-array-cells"), "w6w-array-cells present");
  const cellInputs = container.querySelectorAll(".w6w-array-cells input");
  assert.equal(cellInputs.length, 2, "both scalar children render as cells");
  assert.equal((cellInputs[0] as HTMLInputElement).value, "a");
  assert.equal((cellInputs[1] as HTMLInputElement).value, "b");

  await act(async () => {
    root.unmount();
  });
});

test("G6 — D-2 ceiling: a repeat group whose children include a `secret` falls back to the JSON editor for the WHOLE group, never a visible text input", async () => {
  const withSecret: ActionParam = {
    ...CUSTOM_FIELDS,
    key: "customFieldsSecret",
    children: [
      { key: "id", label: "Field ID", type: "string" },
      { key: "secretVal", label: "Secret value", type: "secret" },
    ],
  };
  const { container, root } = await render([withSecret], {
    customFieldsSecret: [{ id: "a", secretVal: "shh-do-not-leak" }],
  });
  await settle();

  assert.ok(
    container.querySelector(".w6w-json-editor"),
    "the JSON editor fallback must engage for the whole group",
  );
  assert.equal(
    container.querySelector(".w6w-array-row"),
    null,
    "must not half-render the group as ArrayField rows",
  );
  const leaked = Array.from(container.querySelectorAll("input")).some(
    (i) => (i as HTMLInputElement).value === "shh-do-not-leak",
  );
  assert.equal(leaked, false, "the secret value must never surface as a visible text input");

  await act(async () => {
    root.unmount();
  });
});

test("G7 — D-2 ceiling: a repeat group whose child carries its OWN children also falls back to the JSON editor", async () => {
  const withNestedChild: ActionParam = {
    ...CUSTOM_FIELDS,
    key: "customFieldsNested",
    children: [
      { key: "id", label: "Field ID", type: "string" },
      {
        key: "nested",
        label: "Nested",
        type: "group",
        children: [{ key: "x", label: "X", type: "string" }],
      },
    ],
  };
  const { container, root } = await render([withNestedChild], {
    customFieldsNested: [{ id: "a", nested: { x: "1" } }],
  });
  await settle();

  assert.ok(container.querySelector(".w6w-json-editor"), "must fall back to the JSON editor");
  assert.equal(container.querySelector(".w6w-array-row"), null, "must not half-render as rows");

  await act(async () => {
    root.unmount();
  });
});

test("G8 — D-3: a group child's showIf resolves the group's OWN sibling first, not the enclosing form's", async () => {
  // `mode` exists in BOTH scopes with DIFFERENT values — enclosing-only
  // resolution would read "outer" and hide `flagged`; group-local-first reads
  // the group's own "inner" default and shows it.
  const params: ActionParam[] = [
    { key: "mode", type: "string", default: "outer" },
    {
      key: "settings",
      type: "group",
      children: [
        { key: "mode", type: "string", default: "inner" },
        {
          key: "flagged",
          label: "Flagged",
          type: "string",
          showIf: { field: "mode", equals: "inner" },
        },
      ],
    },
  ];
  const { container, root } = await render(params, {});
  assert.ok(
    container.querySelector('input[aria-label="Flagged"]'),
    'must resolve against the group\'s OWN `mode` ("inner"), not the enclosing form\'s ("outer")',
  );
  await act(async () => {
    root.unmount();
  });
});

test("G8b — D-3: a key the group does NOT declare still falls back to the enclosing form", async () => {
  const params: ActionParam[] = [
    { key: "outerFlag", type: "boolean", default: true },
    {
      key: "settings2",
      type: "group",
      children: [
        {
          key: "flagged2",
          label: "Flagged 2",
          type: "string",
          showIf: { field: "outerFlag", truthy: true },
        },
      ],
    },
  ];
  const { container, root } = await render(params, {});
  assert.ok(
    container.querySelector('input[aria-label="Flagged 2"]'),
    "a key the group doesn't declare must fall back to the enclosing form's effective value",
  );
  await act(async () => {
    root.unmount();
  });
});
