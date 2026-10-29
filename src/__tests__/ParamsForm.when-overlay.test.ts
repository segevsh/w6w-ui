// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/ParamsForm.when-overlay.test.ts
// `Param.when` overlay across ParamsForm sites + ResolvedParams. Rig mirrors params-form-groups.test.ts.
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

const { ResolvedParams } = await import("../components/ResolvedParams.tsx");

const SCOPE: ActionParam = {
  key: "scope",
  label: "Scope",
  type: "select",
  options: [
    { value: "event", label: "Event" },
    { value: "organization", label: "Organization" },
  ],
};
const WHEN: NonNullable<ActionParam["when"]> = [
  { if: { field: "scope", equals: "event" }, set: { label: "Event ID" } },
  {
    if: { field: "scope", equals: "organization" },
    set: { label: "Organization ID", required: true },
  },
];
const ID: ActionParam = { key: "scopeId", label: "ID", type: "string", when: WHEN };

function render(root: ReturnType<typeof createRoot>, params: ActionParam[], values: object) {
  return act(async () => {
    root.render(
      React.createElement(ParamsForm, {
        params,
        values: values as Record<string, unknown>,
        onChange: () => {},
      }),
    );
  });
}
const text = (c: Element) => c.textContent ?? "";

test("top level: relabels and marks required, rerendered on the same root", async () => {
  const { container, root } = mountRoot();
  await render(root, [SCOPE, ID], { scope: "event" });
  assert.ok(text(container).includes("Event ID"));
  assert.ok(!text(container).includes("Organization ID"));
  assert.ok(!text(container).includes("Event ID *"));
  await render(root, [SCOPE, ID], { scope: "organization" });
  assert.ok(text(container).includes("Organization ID *"));
  assert.ok(!text(container).includes("Event ID"));
  await act(async () => root.unmount());
});

test("section child is overlaid", async () => {
  const { container, root } = mountRoot();
  const section: ActionParam = {
    key: "sec",
    label: "Sec",
    type: "section",
    section: "group",
    children: [ID],
  };
  await render(root, [SCOPE, section], { scope: "event" });
  assert.ok(text(container).includes("Event ID"));
  await render(root, [SCOPE, section], { scope: "organization" });
  assert.ok(text(container).includes("Organization ID *"));
  await act(async () => root.unmount());
});

test("group child reads a group-local sibling over an enclosing key", async () => {
  const { container, root } = mountRoot();
  const group: ActionParam = {
    key: "g",
    label: "G",
    type: "group",
    children: [{ ...SCOPE }, { ...ID }],
  };
  // enclosing scope=event, group-local scope=organization -> local wins
  await render(root, [SCOPE, group], { scope: "event", g: { scope: "organization" } });
  assert.ok(text(container).includes("Organization ID *"), text(container));
  await act(async () => root.unmount());
});

test("overlay-required advanced param renders in the main area", async () => {
  const { container, root } = mountRoot();
  const adv: ActionParam = { ...ID, advanced: true };
  await render(root, [SCOPE, adv], { scope: "event" });
  const folded = container.querySelector("details.w6w-params-optional");
  assert.ok(folded?.textContent?.includes("Event ID"), "advanced + optional is folded");
  await render(root, [SCOPE, adv], { scope: "organization" });
  assert.ok(text(container).includes("Organization ID *"));
  assert.equal(container.querySelector("details.w6w-params-optional"), null);
  await act(async () => root.unmount());
});

test("ResolvedParams shows the overlaid label", async () => {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(ResolvedParams, {
        params: [SCOPE, ID],
        values: { scope: "event", scopeId: "42" },
      } as never),
    );
  });
  assert.ok(text(container).includes("Event ID"), text(container));
  await act(async () => root.unmount());
});
