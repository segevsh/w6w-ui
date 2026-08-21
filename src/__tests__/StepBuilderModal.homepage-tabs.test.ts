// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/StepBuilderModal.homepage-tabs.test.ts  (Node 24)
//
// F-2.0's homepage. Two things it pins:
//
//   1. The SIDEBAR order — Ready to use · Apps · AI · Workflows · Functions.
//      The two callable tabs shipped UNREACHABLE outside the workflow canvas:
//      they were rendered behind `!appsOnly`, the same gate that hides
//      Triggers/Controls/Utilities/Data, and every picker that binds a TARGET
//      passes `appsOnly`. That is the sidebar in the screenshot the human
//      filed. `callables` is their own knob now.
//
//   2. The HOME TAB's two-column layout, which the intake draws as
//
//          Connnected apps | functions
//                          | workflows
//
//      Connected apps left; Functions above Workflows right. It was built as
//      three sidebar tabs first — the sketch is a layout, not a tab list.
//
// Mounts the REAL StepBuilderModal in a real DOM via `react-dom/client` +
// `act` — StepBuilderModal.commit.test.ts's jsdom rig, extended with the
// `<dialog>` shim `Modal` needs and a fake `W6WApi` (the callable lists fetch
// through it on mount).
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
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

// jsdom implements <dialog> as an element but not its imperative API.
const proto = dom.window.HTMLDialogElement?.prototype as unknown as Record<string, unknown>;
if (proto && typeof proto.showModal !== "function") {
  proto.showModal = function showModal(this: HTMLElement) {
    this.setAttribute("open", "");
  };
  proto.close = function close(this: HTMLElement) {
    this.removeAttribute("open");
  };
}

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { StepBuilderModal } = await import("../StepBuilderModal.tsx");
const { W6WUIProvider } = await import("../provider.tsx");

interface Fixture {
  apps?: Array<Record<string, unknown>>;
  connections?: Array<{ appId: string }>;
  functions?: Array<Record<string, unknown>>;
  workflows?: Array<Record<string, unknown>>;
}

/** Enough of `W6WApi` for the home tab and the callable lists to resolve.
 *  Every other member is unreached here and answers with an empty list. */
function makeApi(f: Fixture = {}) {
  return new Proxy(
    {
      listApps: () => Promise.resolve(f.apps ?? []),
      listConnections: () => Promise.resolve(f.connections ?? []),
      listFunctions: () => Promise.resolve(f.functions ?? []),
      listWorkflows: () => Promise.resolve(f.workflows ?? []),
    } as Record<string, unknown>,
    {
      get(t, k: string) {
        if (k in t) return t[k];
        return () => Promise.resolve([]);
      },
    },
  );
}

/** A workspace with one of each — the "everything present" fixture. */
const FULL: Fixture = {
  apps: [{ id: "slack", displayName: "Slack" }],
  connections: [{ appId: "slack" }],
  functions: [{ id: "fn_a", displayName: "Send Email" }],
  workflows: [{ id: "wf_a", displayName: "Nightly Sync" }],
};

/** Nothing connected and nothing built. */
const api = makeApi(FULL);

/** Mount the modal and hand the mounted document to `read`, then unmount. */
async function withModal<T>(
  props: Record<string, unknown>,
  read: () => T,
  fixture: Fixture = FULL,
): Promise<T> {
  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api: makeApi(fixture) as never, children: null } as never,
        React.createElement(StepBuilderModal, {
          onClose: () => {},
          onAdd: () => {},
          ...props,
        } as never),
      ),
    );
  });
  const out = read();
  await act(async () => root.unmount());
  return out;
}

const readTabs = () =>
  Array.from(document.querySelectorAll(".w6w-stepbuilder-tab")).map((el) =>
    (el.textContent || "").trim(),
  );
const readHeadings = () =>
  Array.from(document.querySelectorAll(".w6w-readytouse-heading")).map((el) =>
    (el.textContent || "").trim(),
  );

async function tabsFor(props: Record<string, unknown>, fixture: Fixture = FULL) {
  return withModal(props, readTabs, fixture);
}

test("the sidebar order is Ready to use · Apps · AI · Workflows · Functions", async () => {
  const tabs = await tabsFor({ appsOnly: true });
  assert.deepEqual(
    tabs,
    ["Ready to use", "Apps", "AI", "Workflows", "Functions"],
    `F-2.0's sidebar, in order; got ${JSON.stringify(tabs)}`,
  );
  assert.ok(
    !tabs.includes("Connected apps"),
    "the home tab is no longer apps-only, so its label must not still say so",
  );
});

// THE regression this file exists for. `appsOnly` hides the graph-only tabs;
// it must not touch the two callable ones.
test("appsOnly hides Triggers/Controls/Utilities/Data and KEEPS Functions/Workflows", async () => {
  const tabs = await tabsFor({ appsOnly: true });
  for (const graphOnly of ["Triggers", "Controls", "Utilities", "Data"]) {
    assert.ok(!tabs.includes(graphOnly), `${graphOnly} must be hidden by appsOnly`);
  }
  for (const callable of ["Workflows", "Functions"]) {
    assert.ok(tabs.includes(callable), `${callable} must survive appsOnly`);
  }
});

test("callables narrows the callable tabs, and [] removes both", async () => {
  assert.deepEqual(await tabsFor({ appsOnly: true, callables: ["function"] }), [
    "Ready to use",
    "Apps",
    "AI",
    "Functions",
  ]);
  assert.deepEqual(await tabsFor({ appsOnly: true, callables: [] }), [
    "Ready to use",
    "Apps",
    "AI",
  ]);
});

// THE layout the intake draws. Three headed columns on ONE screen, in the
// arrangement `Connnected apps | functions / workflows` — not three tabs, and
// not one flat list (both of which this was built as, in that order, before
// the sketch was read as a layout).
test("the home tab is two columns: Connected apps | Functions over Workflows", async () => {
  const shape = await withModal({ appsOnly: true }, () => {
    const grid = document.querySelector(".w6w-readytouse");
    assert.ok(grid, "the home tab must render the two-column grid");
    const stack = grid.querySelector(".w6w-readytouse-stack");
    assert.ok(stack, "Functions and Workflows must share the right-hand column");
    return {
      headings: readHeadings(),
      stacked: Array.from(stack.querySelectorAll(".w6w-readytouse-heading")).map((el) =>
        (el.textContent || "").trim(),
      ),
      topLevel: grid.children.length,
      cols: grid.getAttribute("data-cols"),
    };
  });
  assert.deepEqual(
    shape.headings,
    ["Connected apps", "Functions", "Workflows"],
    `the three columns, in the intake's order; got ${JSON.stringify(shape.headings)}`,
  );
  // The right-hand pair is NESTED — that nesting IS the `|` in the sketch. A
  // flat three-column row would pass the heading check above and still be the
  // wrong layout.
  assert.deepEqual(shape.stacked, ["Functions", "Workflows"], "Functions sits above Workflows");
  assert.equal(shape.topLevel, 2, "two top-level columns");
  assert.equal(shape.cols, "2", "data-cols drives the grid template and the divider");
});

// A family this picker does not OFFER is a different case from one you have
// none of: it is never fetched, so an empty column there would be a claim
// about data nobody looked at.
test("a picker offering one callable family shows only that column", async () => {
  assert.deepEqual(await withModal({ appsOnly: true, callables: ["workflow"] }, readHeadings), [
    "Connected apps",
    "Workflows",
  ]);
});

// ── Empty columns disappear, heading and all ───────────────────────────────
//
// A "Workflows" heading over nothing claims you have workflows ready to use,
// which is precisely what the empty list is telling you is false. Each case
// below asserts the ABSENT heading, not just the present ones — a component
// that renders every column unconditionally passes a present-only check.

test("no workflows ⇒ no Workflows heading; no functions ⇒ no Functions heading", async () => {
  assert.deepEqual(await withModal({ appsOnly: true }, readHeadings, { ...FULL, workflows: [] }), [
    "Connected apps",
    "Functions",
  ]);
  assert.deepEqual(await withModal({ appsOnly: true }, readHeadings, { ...FULL, functions: [] }), [
    "Connected apps",
    "Workflows",
  ]);
});

test("no connected apps ⇒ the left column goes, and the grid collapses to one", async () => {
  const shape = await withModal(
    { appsOnly: true },
    () => ({
      headings: readHeadings(),
      cols: document.querySelector(".w6w-readytouse")?.getAttribute("data-cols"),
    }),
    // The app is registered but NOT connected — the discriminating fixture:
    // a component filtering on the wrong list still shows a left column here.
    { ...FULL, connections: [] },
  );
  assert.deepEqual(shape.headings, ["Functions", "Workflows"]);
  assert.equal(shape.cols, "1", "one column ⇒ no divider");
});

test("nothing connected and nothing built ⇒ no Ready to use TAB at all", async () => {
  const tabs = await tabsFor({ appsOnly: true }, {});
  assert.ok(
    !tabs.includes("Ready to use"),
    `an empty home tab must not be offered; got ${JSON.stringify(tabs)}`,
  );
  assert.deepEqual(tabs, ["Apps", "AI", "Workflows", "Functions"]);
});

test("the empty home tab is not merely hidden — the modal opens on Apps instead", async () => {
  const active = await tabsFor({ appsOnly: true }, {}).then(() =>
    withModal(
      { appsOnly: true },
      () => (document.querySelector(".w6w-stepbuilder-tab.active")?.textContent || "").trim(),
      {},
    ),
  );
  assert.equal(active, "Apps", "a body with no tab above it would be the alternative");
});

// ── One row component, everywhere ──────────────────────────────────────────
//
// A Function must look like a Function whether it is listed on the home tab or
// on the Functions tab — same glyph, same tinted background. They were two
// separate row markups, which is how they drifted.
test("a callable row carries the same glyph and tint on the home tab and its own tab", async () => {
  const onHome = await withModal({ appsOnly: true }, () => {
    const row = document.querySelector('.w6w-readytouse [data-kind="function"]');
    assert.ok(row, "the home tab must render a function row");
    return {
      tinted: row.classList.contains("w6w-stepbuilder-item--callable"),
      glyph: row.querySelector("svg")?.innerHTML ?? "",
    };
  });
  assert.ok(onHome.tinted, "a callable row must be visually distinct from an app row");
  assert.ok(onHome.glyph.length > 0, "a callable row must carry a glyph");

  const onTab = await withModal({ appsOnly: true, initialTab: "functions" }, () => {
    const row = document.querySelector('[data-kind="function"]');
    assert.ok(row, "the Functions tab must render a function row");
    return {
      tinted: row.classList.contains("w6w-stepbuilder-item--callable"),
      glyph: row.querySelector("svg")?.innerHTML ?? "",
    };
  });
  assert.equal(onTab.tinted, onHome.tinted, "same tint on both surfaces");
  assert.equal(onTab.glyph, onHome.glyph, "same glyph on both surfaces");
});

test("an app row is NOT tinted like a callable one — the distinction is real", async () => {
  const appTinted = await withModal({ appsOnly: true }, () => {
    const row = document.querySelector('.w6w-readytouse [data-kind="app"]');
    assert.ok(row, "the home tab must render an app row");
    return row.classList.contains("w6w-stepbuilder-item--callable");
  });
  assert.equal(appTinted, false);
});

// A Workflow's glyph must differ from a Function's, or the "different
// background" and the icons together still leave the two unreadable.
test("a Workflow's glyph differs from a Function's", async () => {
  const glyphs = await withModal({ appsOnly: true }, () => ({
    fn: document.querySelector('[data-kind="function"] svg')?.innerHTML ?? "",
    wf: document.querySelector('[data-kind="workflow"] svg')?.innerHTML ?? "",
  }));
  assert.ok(glyphs.fn.length > 0 && glyphs.wf.length > 0);
  assert.notEqual(glyphs.fn, glyphs.wf);
});

test("the default open tab is the home tab, and initialTab overrides it", async () => {
  const container = document.getElementById("root");
  assert.ok(container);

  for (const [props, expected] of [
    [{ appsOnly: true }, "Ready to use"],
    [{ appsOnly: true, initialTab: "workflows" }, "Workflows"],
    [{ appsOnly: true, initialTab: "functions" }, "Functions"],
  ] as const) {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(
          W6WUIProvider,
          { api: api as never, children: null } as never,
          React.createElement(StepBuilderModal, {
            onClose: () => {},
            onAdd: () => {},
            ...props,
          } as never),
        ),
      );
    });
    const active = document.querySelector(".w6w-stepbuilder-tab.active");
    assert.equal(
      (active?.textContent || "").trim(),
      expected,
      `initial tab for ${JSON.stringify(props)}`,
    );
    await act(async () => root.unmount());
  }
});
