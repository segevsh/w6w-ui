// Run (from packages/ui):
//   NODE_OPTIONS=--experimental-strip-types node --import ./src/test-jsx-loader.mjs \
//     --test src/components/__tests__/ServerResources.test.ts
//
// Mirrors IconButton.test.ts's JSDOM/`act` setup for the one interactive case
// (the rail's expand button); the static behaviour cases go through
// `renderToStaticMarkup`, which is enough for class names, text and polyline
// counts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";
import type { ServerResourceSample } from "../server-resources-format.ts";

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
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { renderToStaticMarkup } = await import("react-dom/server");
const { ServerResourcesBadge, ServerResourcesCard, ServerResourcesCardSmall, ServerResourcesRail } =
  await import("../ServerResources.tsx");
const { demoServerResourceSamples } = await import("../server-resources.fixture.ts");

const SAMPLES: ServerResourceSample[] = demoServerResourceSamples(60);

/** The pinned single sample the value vectors below are measured against. */
const PINNED: ServerResourceSample = {
  ts: "2026-09-29T00:00:00.000Z",
  cpus: 8,
  cpuLimit: 2,
  load1: 0.5,
  load5: 0.25,
  load15: 0.3,
  memoryTotal: 16000,
  memoryAvailable: 4000,
  memoryLimit: null,
  processRss: 1536,
  processHeapUsed: 1024,
  processHeapTotal: 2048,
};

const markup = (el: ReactElement): string => renderToStaticMarkup(el);
/** How many times `needle` occurs in `html`. */
const count = (html: string, needle: string): number => html.split(needle).length - 1;

async function mount(el: ReactElement) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(el);
  });
  return { container, root };
}

/** The four variants: their modifier class and a renderer for a given series. */
const VARIANTS: Array<{
  name: string;
  modifier: string;
  render: (samples: readonly ServerResourceSample[]) => ReactElement;
}> = [
  {
    name: "card",
    modifier: "card",
    render: (samples) => React.createElement(ServerResourcesCard, { samples }),
  },
  {
    name: "small",
    modifier: "small",
    render: (samples) => React.createElement(ServerResourcesCardSmall, { samples }),
  },
  {
    name: "rail",
    modifier: "rail",
    render: (samples) => React.createElement(ServerResourcesRail, { samples }),
  },
  {
    name: "badge",
    modifier: "badge",
    render: (samples) => React.createElement(ServerResourcesBadge, { samples }),
  },
];

test("S1 — every variant's root carries the base class plus its modifier", async () => {
  for (const variant of VARIANTS) {
    const { container, root } = await mount(variant.render(SAMPLES));
    const el = container.querySelector(".w6w-server-resources");
    assert.ok(el, `${variant.name} root missing`);
    assert.ok(
      el.classList.contains(`w6w-server-resources--${variant.modifier}`),
      `${variant.name} modifier missing`,
    );
    await act(async () => {
      root.unmount();
    });
  }
});

test("S2 — samples: [] still renders, shows an em dash and draws no polyline", () => {
  for (const variant of VARIANTS) {
    const html = markup(variant.render([]));
    assert.ok(html.length > 0, `${variant.name} rendered nothing`);
    assert.ok(html.includes("—"), `${variant.name} did not render an unknown value`);
    assert.equal(count(html, "<polyline"), 0, `${variant.name} drew a line with no samples`);
  }
});

test("S3 — card: default title, the three rows, the load line and 3 polylines", () => {
  const html = markup(React.createElement(ServerResourcesCard, { samples: SAMPLES }));
  assert.ok(html.includes("Server resources"));
  assert.ok(html.includes("CPU"));
  assert.ok(html.includes("Memory"));
  assert.ok(html.includes("Process"));
  assert.equal(count(html, "<polyline"), 3);
  assert.ok(/Load \d+\.\d\d \/ \d+\.\d\d \/ \d+\.\d\d/.test(html), "load line missing");
  assert.ok(!html.includes("Sampled every"), "interval line shown without intervalMs");
});

test("S4 — card: title override, intervalMs line, and dots when a value is unknown", () => {
  const html = markup(
    React.createElement(ServerResourcesCard, {
      samples: [PINNED],
      title: "Host",
      intervalMs: 5000,
    }),
  );
  assert.ok(html.includes("Host"));
  assert.ok(html.includes("Sampled every 5s"));

  // A sample with nothing measured reads as dashes, never as zeroes.
  const blanked = markup(
    React.createElement(ServerResourcesCard, {
      samples: [{ ...PINNED, load1: null, load5: null, load15: null, processRss: null }],
    }),
  );
  assert.ok(blanked.includes("Load — / — / —"));
});

test("S5 — small card: default title, both percentages and exactly one polyline", () => {
  const html = markup(React.createElement(ServerResourcesCardSmall, { samples: SAMPLES }));
  assert.ok(html.includes("Server"));
  assert.ok(html.includes("CPU"));
  assert.ok(html.includes("Memory"));
  assert.equal(count(html, "<polyline"), 1);

  // The pinned sample's two readings, through this variant too.
  const pinned = markup(React.createElement(ServerResourcesCardSmall, { samples: [PINNED] }));
  assert.ok(pinned.includes("25%"));
  assert.ok(pinned.includes("75%"));
});

test("S6 — rail: CPU and MEM, exactly two polylines, no button without onExpand", () => {
  const html = markup(React.createElement(ServerResourcesRail, { samples: SAMPLES }));
  assert.ok(html.includes("CPU"));
  assert.ok(html.includes("MEM"));
  assert.equal(count(html, "<polyline"), 2);
  assert.equal(count(html, "<button"), 0);

  // Both readings, with the pinned sample's values.
  const pinned = markup(React.createElement(ServerResourcesRail, { samples: [PINNED] }));
  assert.ok(pinned.includes("25%"));
  assert.ok(pinned.includes("75%"));
});

test("S7 — rail: onExpand renders one labelled button that calls back once", async () => {
  let calls = 0;
  const { container, root } = await mount(
    React.createElement(ServerResourcesRail, {
      samples: SAMPLES,
      onExpand: () => {
        calls += 1;
      },
    }),
  );
  const button = container.querySelector("button");
  assert.ok(button, "expand button missing");
  assert.equal(button.getAttribute("type"), "button");
  assert.equal(button.getAttribute("aria-label"), "Show server resources");
  assert.equal(container.querySelectorAll("button").length, 1);
  // Visibly labelled as well as aria-labelled — an unlabelled empty box is not
  // a legible affordance.
  assert.equal(button.textContent, "Details");
  await act(async () => {
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(calls, 1);
  await act(async () => {
    root.unmount();
  });
});

test("S8 — badge: one line of text, never an svg", () => {
  const html = markup(React.createElement(ServerResourcesBadge, { samples: SAMPLES }));
  assert.equal(count(html, "<svg"), 0);
  assert.equal(count(html, "<polyline"), 0);
  assert.ok(html.includes("·"));
});

test("S9 — pinned sample: 25% / 75% / 1.5 KiB, the load line, and the badge text", async () => {
  const card = markup(React.createElement(ServerResourcesCard, { samples: [PINNED] }));
  assert.ok(card.includes("25%"), "CPU percent missing");
  assert.ok(card.includes("75%"), "memory percent missing");
  assert.ok(card.includes("1.5 KiB"), "process RSS missing");
  assert.ok(card.includes("Load 0.50 / 0.25 / 0.30"), "load line missing");

  const { container, root } = await mount(
    React.createElement(ServerResourcesBadge, { samples: [PINNED] }),
  );
  assert.equal(container.textContent, "CPU 25% · MEM 75%");
  await act(async () => {
    root.unmount();
  });
});

test("S10 — badge with no samples: both readings are the em dash", async () => {
  const { container, root } = await mount(
    React.createElement(ServerResourcesBadge, { samples: [] }),
  );
  assert.equal(container.textContent, "CPU — · MEM —");
  await act(async () => {
    root.unmount();
  });
});
