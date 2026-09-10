// Run: node --import ./src/test-jsx-loader.mjs --test src/__tests__/ActionTestForm.overrides.test.ts  (Node 24)
//
// T2.1.1 — the Overrides region on ActionTestForm. Mirrors
// `WorkflowFlowEditor.test-tab.test.ts`'s jsdom + react-dom/client + act rig
// (the CodeMirror-mounting one) rather than inventing a new one; the sub-editors
// are driven through CodeMirror's own `EditorView.dispatch` (found via
// `EditorView.findFromDOM` on the mounted `.cm-content` node) rather than DOM
// keystroke simulation, since CM6's `beforeinput`-based typing pipeline is not
// something jsdom reproduces — `dispatch` is CodeMirror's own public API, not a
// production-code shortcut, and it still exercises the real
// `@uiw/react-codemirror` `onChange` wiring `JsonEditor.tsx` depends on.
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
// `WorkflowFlowEditor.test-tab.test.ts:47-58`) — `ActionTestForm` always mounts
// three `JsonEditor`/CodeMirror instances for the Overrides sub-editors.
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
const { EditorView } = await import("@codemirror/view");
const { ActionTestForm } = await import("../ActionTestForm.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;
type ActionDef = import("../types.ts").ActionDef;

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    listApps: async () => [],
    getAppAuth: async () => [],
    listConnectionsForApp: async () => [],
    listConnections: async () => [],
    getAppActions: async () => [],
    invokeAction: async () => ({ value: {} }),
    listSavedTests: async () => [],
    createSavedTest: async () => ({}),
    updateSavedTest: async () => ({}),
    deleteSavedTest: async () => {},
    recordTestRun: async () => {},
    saveStepTest: async () => ({ id: "t1" }),
    recordStepTestRun: async () => {},
    createConnection: async () => ({
      id: "c1",
      appId: "sendgrid",
      authKey: "apiKey",
      state: "ok" as const,
    }),
    startAppOAuthFlow: async () => ({ authorizationUrl: "" }),
    ...overrides,
  } as unknown as W6WApi;
}

const SIMPLE_ACTION: ActionDef = {
  key: "send",
  type: "action",
  title: "Send",
  params: [{ key: "to", type: "string", label: "To", required: true }],
};

const ACTION_WITH_ADVANCED: ActionDef = {
  key: "send",
  type: "action",
  title: "Send",
  params: [
    { key: "to", type: "string", label: "To", required: true },
    { key: "cc", type: "string", label: "CC", advanced: true },
  ],
};

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

/** Flush the async tick CodeMirror's view creation (and any pending fetch) needs. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function render(action: ActionDef, apiOverrides: Record<string, unknown> = {}) {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(
      React.createElement(W6WUIProvider, {
        api: fakeApi(apiOverrides),
        children: React.createElement(ActionTestForm, {
          appId: "app_1",
          actions: [action],
          action,
          connectionId: "conn_1",
        }),
      }),
    );
  });
  await settle();
  return { container, root };
}

/** The mounted CodeMirror view behind a `JsonEditor` identified by its `aria-label`. */
function viewFor(container: Element, ariaLabel: string) {
  const content = container.querySelector(`[aria-label="${ariaLabel}"] .cm-content`);
  assert.ok(content, `CodeMirror content for aria-label="${ariaLabel}" must have mounted`);
  const view = EditorView.findFromDOM(content as HTMLElement);
  assert.ok(view, `EditorView.findFromDOM must find the mounted view for "${ariaLabel}"`);
  return view;
}

/** Replace a JsonEditor sub-editor's whole document — the real `onChange` wiring fires from this. */
async function setJson(container: Element, ariaLabel: string, text: string) {
  const view = viewFor(container, ariaLabel);
  await act(async () => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    // Flush CodeMirror's own post-dispatch measure tick (shimmed RAF above) inside
    // this `act` boundary, so it doesn't fire — and warn — after it.
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function setInputValue(el: Element | null, value: string) {
  const input = el as HTMLInputElement;
  assert.ok(input);
  const descriptor = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  );
  await act(async () => {
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function openOverridesRegion(container: Element) {
  const region = container.querySelector('[data-testid="overrides-region"]') as HTMLDetailsElement;
  assert.ok(region, "the Overrides region must render");
  const summary = region.querySelector("summary");
  assert.ok(summary);
  await act(async () => {
    summary.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  return region;
}

test("region is present and collapsed on first render", async () => {
  const { container, root } = await render(SIMPLE_ACTION);
  const region = container.querySelector('[data-testid="overrides-region"]') as HTMLDetailsElement;
  assert.ok(region, "the Overrides region must render");
  assert.equal(region.hasAttribute("open"), false, "collapsed by default");
  assert.ok(region.textContent?.includes("Overrides"), "the region must be labelled 'Overrides'");
  await act(async () => {
    root.unmount();
  });
});

test("opening the region reveals exactly the five inputs, and never inside the Additional-parameters disclosure", async () => {
  const { container, root } = await render(ACTION_WITH_ADVANCED);
  const region = await openOverridesRegion(container);
  assert.equal(region.open, true, "clicking the summary opens the disclosure");

  const jsonEditors = region.querySelectorAll(".w6w-json-editor");
  assert.equal(jsonEditors.length, 3, "exactly three JSON sub-editors: body, query, headers");
  const select = region.querySelector('select[aria-label="Overrides target"]');
  assert.ok(select, "a target selector must be present");
  const match = region.querySelector('input[aria-label="Overrides match"]');
  assert.ok(match, "a free-text match field must be present");

  // M6 — never a descendant of ParamsForm's own "Additional parameters" disclosure.
  const paramsOptional = container.querySelector(".w6w-params-optional");
  assert.ok(paramsOptional, "this fixture's `cc` param is advanced, so the disclosure must exist");
  assert.equal(
    paramsOptional.contains(region),
    false,
    "the Overrides region must not be nested inside Additional parameters",
  );
  assert.equal(
    region.contains(paramsOptional),
    false,
    "nor the reverse — the two are siblings, not nested either way",
  );

  await act(async () => {
    root.unmount();
  });
});

test("M1/M2 — Run forwards params and overrides as separate arguments to invokeAction", async () => {
  const calls: unknown[][] = [];
  const { container, root } = await render(SIMPLE_ACTION, {
    invokeAction: async (...args: unknown[]) => {
      calls.push(args);
      return { value: { ok: true } };
    },
  });

  // Fill the action's own param.
  const toInput = container.querySelector('input[aria-label="To"]');
  await setInputValue(toInput, "person@example.com");

  // Open and fill every Overrides sub-control.
  await openOverridesRegion(container);
  await setJson(container, "Overrides body (JSON)", '{"subject":"hi"}');
  await setJson(container, "Overrides query (JSON)", '{"dry_run":true}');
  await setJson(container, "Overrides headers (JSON)", '{"X-Test":"abc"}');
  const targetSelect = container.querySelector(
    'select[aria-label="Overrides target"]',
  ) as HTMLSelectElement;
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      dom.window.HTMLSelectElement.prototype,
      "value",
    );
    descriptor?.set?.call(targetSelect, "all");
    targetSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  const matchInput = container.querySelector('input[aria-label="Overrides match"]');
  await setInputValue(matchInput, "billing");

  const runBtn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === "Run action",
  ) as HTMLButtonElement | undefined;
  assert.ok(runBtn, "the Run action button must be present");
  assert.equal(runBtn.disabled, false, "a fully valid form must not be disabled");
  await act(async () => {
    runBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  await settle();

  assert.equal(calls.length, 1, "invokeAction must be called exactly once");
  const [appId, actionKey, params, opts] = calls[0] as [
    string,
    string,
    Record<string, unknown>,
    Record<string, unknown>,
  ];
  assert.equal(appId, "app_1");
  assert.equal(actionKey, "send");
  // M2 — params carries exactly the form's own params, never the overrides.
  assert.deepEqual(Object.keys(params).sort(), ["to"]);
  assert.equal(params.to, "person@example.com");
  // M2 — overrides rides on the FOURTH argument, never merged into params.
  assert.deepEqual(opts, {
    connectionId: "conn_1",
    overrides: {
      body: { subject: "hi" },
      query: { dry_run: true },
      headers: { "X-Test": "abc" },
      target: "all",
      match: "billing",
    },
  });

  await act(async () => {
    root.unmount();
  });
});

test("M3 — an untouched Overrides region sends no `overrides` key at all", async () => {
  const calls: unknown[][] = [];
  const { container, root } = await render(SIMPLE_ACTION, {
    invokeAction: async (...args: unknown[]) => {
      calls.push(args);
      return { value: { ok: true } };
    },
  });

  const toInput = container.querySelector('input[aria-label="To"]');
  await setInputValue(toInput, "person@example.com");
  // Deliberately never open/touch the Overrides region.

  const runBtn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === "Run action",
  ) as HTMLButtonElement | undefined;
  assert.ok(runBtn);
  await act(async () => {
    runBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  await settle();

  assert.equal(calls.length, 1);
  const opts = calls[0][3] as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(opts).sort(),
    ["connectionId"],
    "no `overrides` key at all — byte-identical to a request from before this control existed",
  );

  await act(async () => {
    root.unmount();
  });
});

test("M4 — invalid JSON in the body sub-editor shows the invalid state and Run refuses", async () => {
  const calls: unknown[][] = [];
  const { container, root } = await render(SIMPLE_ACTION, {
    invokeAction: async (...args: unknown[]) => {
      calls.push(args);
      return { value: {} };
    },
  });

  const toInput = container.querySelector('input[aria-label="To"]');
  await setInputValue(toInput, "person@example.com");

  await openOverridesRegion(container);
  await setJson(container, "Overrides body (JSON)", '{"a":');

  const runBtn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === "Run action",
  ) as HTMLButtonElement | undefined;
  assert.ok(runBtn);
  assert.equal(runBtn.disabled, true, "Run must be disabled while a sub-editor is invalid");

  await act(async () => {
    runBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  await settle();
  assert.equal(calls.length, 0, "invokeAction must never be called with a half-parsed envelope");

  const bodyField = container
    .querySelector('[aria-label="Overrides body (JSON)"]')
    ?.closest(".w6w-field");
  assert.ok(bodyField?.textContent?.includes("Invalid JSON"), "the invalid hint must render");

  // Clearing the field back to empty must un-block Run (empty = no override, not an error).
  await setJson(container, "Overrides body (JSON)", "");
  assert.equal(runBtn.disabled, false, "an emptied sub-editor is valid again, not an error state");

  await act(async () => {
    root.unmount();
  });
});
