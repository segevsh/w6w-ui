// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.callable-tabs.test.ts  (Node 24)
//
// Acceptance 4 — NodeConfigForm's graph-less mode (`hasGraph`/`reroute`).
// Mounts the REAL NodeConfigForm in a real DOM via `react-dom/client` + `act`
// — StepBuilderModal.commit.test.ts's jsdom rig, reused verbatim (no
// `<dialog>` is involved here, so its imperative-API shim isn't needed). The
// absent-by-value assertions are the discriminating half: a form that quietly
// ignores `hasGraph` still passes every "present" assertion below.
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

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { NodeConfigForm } = await import("../NodeConfigForm.tsx");

function optionValues(select: HTMLSelectElement | null): string[] {
  assert.ok(select, "onError <select> must be present");
  return Array.from((select as HTMLSelectElement).options).map((o) => o.value);
}

test("NodeConfigForm: hasGraph omitted keeps the 3-option select and the canvas-edge sentence (unchanged today)", async () => {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container as Element);
  await act(async () => {
    root.render(React.createElement(NodeConfigForm, { config: {}, onChange: () => {} }));
  });

  const select = (container as Element).querySelector("select") as HTMLSelectElement | null;
  assert.deepEqual(optionValues(select), ["fail", "continue", "continue-record"]);
  assert.ok(
    (container as Element).textContent?.includes("outgoing"),
    "the canvas-edge sentence must be present when hasGraph is omitted",
  );

  await act(async () => {
    root.unmount();
  });
});

test("NodeConfigForm: hasGraph={false} drops continue-record BY VALUE and the canvas-edge sentence", async () => {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container as Element);
  await act(async () => {
    root.render(
      React.createElement(NodeConfigForm, { config: {}, onChange: () => {}, hasGraph: false }),
    );
  });

  const select = (container as Element).querySelector("select") as HTMLSelectElement | null;
  const values = optionValues(select);
  assert.equal(values.length, 2, `expected exactly 2 options, got ${JSON.stringify(values)}`);
  assert.ok(
    !values.includes("continue-record"),
    `continue-record must be absent BY VALUE, got ${JSON.stringify(values)}`,
  );
  assert.ok(
    !(container as Element).textContent?.includes("outgoing"),
    "the canvas-edge sentence must be absent when hasGraph is false",
  );

  await act(async () => {
    root.unmount();
  });
});

test("NodeConfigForm: reroute renders the supplied picker node; omitted, nothing reroute-shaped renders", async () => {
  const container = document.getElementById("root");
  assert.ok(container);

  const root = createRoot(container as Element);
  await act(async () => {
    root.render(
      React.createElement(NodeConfigForm, {
        config: {},
        onChange: () => {},
        reroute: {
          value: undefined,
          onChange: () => {},
          picker: React.createElement(
            "button",
            { "data-testid": "reroute-picker", type: "button" },
            "Pick target",
          ),
        },
      }),
    );
  });
  assert.ok(
    (container as Element).querySelector('[data-testid="reroute-picker"]'),
    "the supplied picker node must render when reroute is present",
  );
  await act(async () => {
    root.unmount();
  });

  const root2 = createRoot(container as Element);
  await act(async () => {
    root2.render(React.createElement(NodeConfigForm, { config: {}, onChange: () => {} }));
  });
  assert.equal(
    (container as Element).querySelector('[data-testid="reroute-picker"]'),
    null,
    "nothing reroute-shaped must render when reroute is omitted",
  );
  assert.ok(
    !(container as Element).textContent?.includes("Reroute on failure"),
    "the reroute field's own label must not render when reroute is omitted",
  );

  await act(async () => {
    root2.unmount();
  });
});
