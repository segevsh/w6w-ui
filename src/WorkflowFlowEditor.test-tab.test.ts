// Run: node --import ./src/test-jsx-loader.mjs --test src/WorkflowFlowEditor.test-tab.test.ts  (Node 24)
//
// Mirrors `StepBuilderModal.commit.test.ts`'s jsdom + react-dom/client + act
// harness (the one real DOM-interaction rig in this suite) rather than
// standing up a second one. Two shims that file didn't need, both because it
// never mounts `StepEditModal`:
//   1. jsdom@30 has no `HTMLDialogElement.prototype.showModal` — `Modal.tsx`
//      calls it in an effect on every mount.
//   2. `WorkflowFlowEditor.tsx` imports `@xyflow/react`, which imports its own
//      `dist/style.css` — `test-jsx-loader.mjs`'s new `.css` arm stubs it.
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { StepEditModal } = await import("./WorkflowFlowEditor.tsx");
const { W6wUIProvider } = await import("./provider.tsx");
const { ExpressionOptionsProvider } = await import("./components/ExpressionOptions.tsx");
const { isTriggerApp } = await import("./flow-types.ts");
type W6wApi = Awaited<ReturnType<typeof import("./provider.tsx").useW6wApi>>;

// Re-routed from T1.1.1's eval (harvested there, dropped by a mis-scoped
// contract): the predicate is pinned against arm REMOVAL but not arm
// WIDENING — `===` → `startsWith` or a `toLowerCase()` fold both survive a
// suite that only checks the three real trigger apps and one unrelated app.
test("isTriggerApp — a near-miss app id is NOT a trigger (guards against a startsWith widening)", () => {
  assert.equal(isTriggerApp("@w6w/triggerx"), false);
});

/** A SendGrid-mail-send-shaped fixture: literal, resolved-var, resolved-fixture-var, and one unresolved var. */
const MAIL_STEP = {
  id: "mail_1",
  uses: { app: "sendgrid", action: "send", connection: "conn_1" },
  with: {
    subject: "Hello",
    from_email: { type: "expr", parts: [{ kind: "var", ref: "vars.from_email" }] },
    body: {
      type: "expr",
      parts: [
        { kind: "text", value: "Hi " },
        { kind: "var", ref: "steps.gate_1.output.first_name" },
        { kind: "text", value: ", welcome" },
      ],
    },
    missing: { type: "expr", parts: [{ kind: "var", ref: "vars.missing_var" }] },
  },
} as const;

const MAIL_PARAMS = [
  { key: "subject", type: "string", label: "Subject" },
  { key: "from_email", type: "string", label: "From email" },
  { key: "body", type: "text", label: "Message body" },
  { key: "missing", type: "string", label: "Missing field" },
];

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    listApps: async () => [],
    getAppAuth: async () => [],
    listConnectionsForApp: async () => [],
    listConnections: async () => [],
    getAppActions: async () => [{ key: "send", title: "Send", params: MAIL_PARAMS }],
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
    // The upstream ancestor `gate_1` carries a saved fixture whose last run
    // produced `first_name` — this is what makes `steps.gate_1.output.first_name`
    // resolve. The editing step's OWN fixture-seed effect (a different query,
    // same method) must see nothing, or it would clobber the override test below.
    listStepTests: async (_workflowId: string, stepId: string) =>
      stepId === "gate_1"
        ? [
            {
              id: "st1",
              workflowId: "wf_1",
              stepId: "gate_1",
              name: null,
              input: {},
              with: {},
              createdAt: "",
              updatedAt: "",
              lastRunStatus: "succeeded",
              lastRunOutput: { first_name: "Ada" },
            },
          ]
        : [],
    ...overrides,
  } as unknown as W6wApi;
}

function setTextareaValue(el: Element | null, value: string) {
  const node = el as HTMLTextAreaElement;
  const descriptor = Object.getOwnPropertyDescriptor(
    dom.window.HTMLTextAreaElement.prototype,
    "value",
  );
  descriptor?.set?.call(node, value);
  node.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

test("Test tab — lists every configured param with its resolved value, distinguishing literal/resolved/unresolved", async () => {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(W6wUIProvider, {
        api: fakeApi(),
        children: React.createElement(ExpressionOptionsProvider, {
          value: { sampleValues: { "vars.from_email": "hello@example.com" } },
          children: React.createElement(StepEditModal, {
            workflowId: "wf_1",
            step: MAIL_STEP,
            upstreamSteps: [{ id: "gate_1", label: "gate_1" }],
            onChange: () => {},
            onClose: () => {},
          }),
        }),
      }),
    );
  });
  // Flush the params/connections/seed-source/remembered-state effects.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  const testTab = Array.from(container.querySelectorAll(".w6w-subtabs button")).find(
    (b) => b.textContent === "Test",
  ) as HTMLButtonElement | undefined;
  assert.ok(testTab, "the Test subtab button should be present");
  await act(async () => {
    testTab.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  const rows = Array.from(container.querySelectorAll(".w6w-resolved-params > .w6w-field"));
  assert.equal(rows.length, 4, "exactly one row per configured param — not a floor");

  const rowFor = (label: string) => {
    const row = rows.find((r) => r.querySelector("span")?.textContent === label);
    assert.ok(row, `expected a row labeled "${label}"`);
    return row as Element;
  };

  // Literal param: shows its literal value.
  const subjectRow = rowFor("Subject");
  assert.ok(subjectRow.textContent?.includes("Hello"), "literal param shows its literal value");

  // A param bound to a fixture-backed ref (sampleValues) shows the fixture's value.
  const fromEmailRow = rowFor("From email");
  assert.ok(
    fromEmailRow.textContent?.includes("hello@example.com"),
    "a var ref backed by sampleValues resolves to the real value",
  );

  // A param bound to a fixture-backed ref (testStartState, via the gate_1 seed) resolves too.
  const bodyRow = rowFor("Message body");
  assert.ok(
    bodyRow.textContent?.includes("Ada"),
    "a steps.<id>.output.<field> ref resolves against testStartState",
  );

  // Unresolved param: a non-empty `.w6w-param-unresolved` badge, and the row
  // never renders the raw template syntax or the full ref string as if it
  // were the value.
  const missingRow = rowFor("Missing field");
  const badge = missingRow.querySelector(".w6w-param-unresolved");
  assert.ok(badge, "an unresolved ref renders the dedicated badge element");
  assert.ok(badge.textContent && badge.textContent.trim().length > 0, "the badge is non-empty");
  assert.equal(missingRow.textContent?.includes("{{"), false, "never the raw template syntax");
  assert.equal(
    missingRow.textContent?.includes("vars.missing_var"),
    false,
    "never the full ref string standing in as a value",
  );

  // The override criterion: overriding the incoming state updates the
  // resolved values — this is what dies if the component reads `step.with`
  // instead of `testValues`.
  const overrideBox = container.querySelector(
    'textarea[aria-label="Incoming state override (JSON)"]',
  );
  assert.ok(overrideBox, "the override textarea should be present");
  await act(async () => {
    setTextareaValue(overrideBox, JSON.stringify({ subject: "Overridden Subject" }));
  });

  const rowsAfter = Array.from(container.querySelectorAll(".w6w-resolved-params > .w6w-field"));
  const subjectRowAfter = rowsAfter.find((r) => r.querySelector("span")?.textContent === "Subject");
  assert.ok(subjectRowAfter);
  assert.ok(
    subjectRowAfter.textContent?.includes("Overridden Subject"),
    "overriding the incoming state updates the resolved value shown",
  );
  assert.equal(
    subjectRowAfter.textContent?.includes("Hello") &&
      !subjectRowAfter.textContent?.includes("Overridden"),
    false,
    "the stale literal must not still be the one shown",
  );

  await act(async () => {
    root.unmount();
  });
});
