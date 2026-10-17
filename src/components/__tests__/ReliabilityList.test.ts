// Run: node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/components/__tests__/ReliabilityList.test.ts
//
// Covers ReliabilityList and ReliabilityChart together. Neither is wrapped in a
// W6WUIProvider on purpose: mounting bare is the "no catalog request" proof at
// the ui layer (a `useW6WApi()` call would throw here).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { ReliabilityServiceView } from "../../reliability-board-layout.ts";

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
g.MouseEvent = dom.window.MouseEvent;
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
const { ReliabilityList } = await import("../ReliabilityList.tsx");
const { ReliabilityChart } = await import("../ReliabilityChart.tsx");

type Props = Record<string, unknown>;

async function mount(Component: unknown, props: Props) {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Component as never, props as never));
  });
  return { container, root };
}

function svc(over: Partial<ReliabilityServiceView> = {}): ReliabilityServiceView {
  return {
    appId: "io.w6w.example",
    displayName: "Example",
    state: "ok",
    calls: 100,
    errors: { e4xx: 0, e429: 0, eAuth: 0, e5xx: 0 },
    p95Ms: 120,
    ongoingOutageId: null,
    uptime: [{ day: "2026-07-01", state: "ok" }],
    vendorStatus: null,
    attention: "none",
    ...over,
  };
}

const href = (id: string) => `/reliability/${id}`;

const BAD = svc({ appId: "bad", displayName: "Bad", state: "down", attention: "now" });
const FINE = svc({ appId: "fine", displayName: "Fine" });

// ── navigation, each site separately ─────────────────────────────────────

test("issue card — getHref gives a real anchor, onOpen still fires, never preventDefault", async () => {
  const calls: string[] = [];
  const { container } = await mount(ReliabilityList, {
    services: [BAD],
    showChart: false,
    getHref: href,
    onOpen: (id: string, e: { defaultPrevented: boolean }) => {
      calls.push(`${id}:${e.defaultPrevented}`);
    },
  });
  const card = container.querySelector("a.w6w-rel-issue-card");
  assert.ok(card, "issue card is an anchor");
  assert.equal(card.getAttribute("href"), "/reliability/bad");
  await act(async () => {
    card.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.deepEqual(calls, ["bad:false"]);
});

test("table service cell — getHref gives a real anchor, onOpen still fires", async () => {
  const calls: string[] = [];
  const { container } = await mount(ReliabilityList, {
    services: [FINE],
    showChart: false,
    getHref: href,
    onOpen: (id: string) => calls.push(id),
  });
  const a = container.querySelector("td.w6w-rel-td-service a.w6w-rel-open");
  assert.ok(a, "service cell is an anchor");
  assert.equal(a.getAttribute("href"), "/reliability/fine");
  await act(async () => {
    a.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.deepEqual(calls, ["fine"]);
});

test("chart point — getHref gives an SVG anchor, onOpen still fires", async () => {
  const calls: string[] = [];
  const { container } = await mount(ReliabilityChart, {
    services: [FINE],
    getHref: href,
    onOpen: (id: string) => calls.push(id),
  });
  const a = container.querySelector("svg a.w6w-rel-scatter-point-link");
  assert.ok(a, "point is an svg anchor");
  assert.equal(a.getAttribute("href"), "/reliability/fine");
  await act(async () => {
    a.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.deepEqual(calls, ["fine"]);
});

test("chart point — onOpen alone is clickable but not a link", async () => {
  const calls: string[] = [];
  const { container } = await mount(ReliabilityChart, {
    services: [FINE],
    onOpen: (id: string) => calls.push(id),
  });
  assert.equal(container.querySelector("a"), null);
  const g1 = container.querySelector("g[role=button]");
  assert.ok(g1);
  await act(async () => {
    g1.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(calls, ["fine"]);
});

test("neither getHref nor onOpen — no anchor anywhere", async () => {
  const { container } = await mount(ReliabilityList, {
    services: [BAD, FINE],
    showChart: true,
  });
  assert.equal(container.querySelectorAll("a").length, 0);
  assert.equal(container.querySelectorAll("button").length, 0);
  assert.ok(container.querySelector(".w6w-rel-issue-card"));
  assert.ok(container.querySelector("svg"));
});

// ── content ─────────────────────────────────────────────────────────────

test("renders with no provider and hands the inline icon fields to AppIcon", async () => {
  const { container } = await mount(ReliabilityList, {
    services: [svc({ iconSrc: "https://cdn.example/icon.png", brandColor: "#123456" })],
    showChart: false,
  });
  const img = container.querySelector("td.w6w-rel-td-service img");
  assert.ok(img, "AppIcon renders the inline iconSrc");
  assert.equal(img.getAttribute("src"), "https://cdn.example/icon.png");
});

test("vendor null reads 'not published'; vendor unknown reads 'Unavailable'", async () => {
  const a = await mount(ReliabilityList, { services: [svc()], showChart: false });
  assert.match(a.container.textContent ?? "", /not published/);
  const b = await mount(ReliabilityList, {
    services: [svc({ vendorStatus: { state: "unknown", message: "probe failed" } })],
    showChart: false,
  });
  assert.match(b.container.textContent ?? "", /Unavailable/);
  assert.doesNotMatch(b.container.textContent ?? "", /not published/);
});

test("all-clear reads `state` only — a vendor incident (attention now) does not suppress it", async () => {
  const withVendor = svc({
    attention: "now",
    vendorStatus: { state: "down", message: "vendor outage" },
  });
  const a = await mount(ReliabilityList, { services: [withVendor], showChart: false });
  assert.match(a.container.textContent ?? "", /All clear/);
  const b = await mount(ReliabilityList, { services: [BAD, FINE], showChart: false });
  assert.doesNotMatch(b.container.textContent ?? "", /All clear/);
  const c = await mount(ReliabilityList, { services: [svc({ calls: 0 })], showChart: false });
  assert.doesNotMatch(c.container.textContent ?? "", /All clear/);
});

test("a known down day renders in its own uptime cell", async () => {
  const uptime = Array.from({ length: 10 }, (_, i) => ({
    day: `2026-07-${String(i + 1).padStart(2, "0")}`,
    state: i === 6 ? ("down" as const) : ("ok" as const),
  }));
  const { container } = await mount(ReliabilityList, {
    services: [svc({ uptime })],
    showChart: false,
  });
  const cells = [...container.querySelectorAll("[class*='w6w-uptime-cell-']")];
  const down = cells.flatMap((c, i) => (/w6w-uptime-cell-down/.test(c.className) ? [i] : []));
  assert.deepEqual(down, [6]);
});

test("the column label uses days, defaulting to window.days then 30", async () => {
  const win = { from: "2026-07-01", to: "2026-07-31", days: 14 };
  const a = await mount(ReliabilityList, { services: [FINE], showChart: false });
  assert.match(a.container.textContent ?? "", /Last 30 days/);
  const b = await mount(ReliabilityList, { services: [FINE], showChart: false, window: win });
  assert.match(b.container.textContent ?? "", /Last 14 days/);
  const c = await mount(ReliabilityList, {
    services: [FINE],
    showChart: false,
    window: win,
    days: 7,
  });
  assert.match(c.container.textContent ?? "", /Last 7 days/);
});

test("compact caps cards and rows, honours limit, links only when given a target", async () => {
  const many = Array.from({ length: 8 }, (_, i) =>
    svc({ appId: `n${i}`, displayName: `N${i}`, state: "down", attention: "now" }),
  );
  const a = await mount(ReliabilityList, { services: many, compact: true });
  assert.equal(a.container.querySelectorAll(".w6w-rel-issue-card").length, 3);
  assert.equal(a.container.querySelectorAll("tbody tr").length, 5);
  assert.doesNotMatch(a.container.textContent ?? "", /view all/);
  assert.equal(a.container.querySelector("svg"), null, "chart off when compact");
  const b = await mount(ReliabilityList, {
    services: many,
    compact: true,
    limit: 2,
    showAllHref: "/reliability",
    showChart: true,
  });
  assert.equal(b.container.querySelectorAll("tbody tr").length, 2);
  assert.ok(b.container.querySelector("svg"));
  assert.match(b.container.textContent ?? "", /Show all services →/);
  const more = [...b.container.querySelectorAll("a")].filter((x) => x.textContent === "view all →");
  assert.equal(more.length, 2);
  assert.equal(more[0]?.getAttribute("href"), "/reliability");
});

test("no <h1>; chart empty state when nothing is timed", async () => {
  const a = await mount(ReliabilityList, { services: [BAD, FINE] });
  assert.equal(a.container.querySelector("h1"), null);
  const b = await mount(ReliabilityChart, { services: [svc({ p95Ms: null })] });
  assert.match(b.container.textContent ?? "", /No timed calls/);
});

// ── CSS contract ────────────────────────────────────────────────────────

test("every static w6w- className is defined in the committed styles.css", async () => {
  const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  const many = [
    svc({
      attention: "now",
      state: "down",
      ongoingOutageId: "o1",
      vendorStatus: { state: "degraded", message: "slow" },
    }),
    svc({ appId: "r", attention: "recent", calls: 0, p95Ms: null }),
    FINE,
  ];
  const html: string[] = [];
  for (const [C, p] of [
    [ReliabilityList, { services: many, showChart: true, getHref: href, onOpen: () => {} }],
    [ReliabilityList, { services: [FINE], compact: true, showAllHref: "/x" }],
    [ReliabilityChart, { services: many, getHref: href }],
  ] as const) {
    html.push((await mount(C, p as Props)).container.innerHTML);
  }
  const classes = new Set<string>();
  for (const m of html.join("").matchAll(/class="([^"]*)"/g)) {
    for (const c of (m[1] ?? "").split(/\s+/)) if (c.startsWith("w6w-rel-")) classes.add(c);
  }
  assert.ok(classes.size > 20, `expected to see the board's classes, saw ${classes.size}`);
  for (const c of classes) {
    // Dynamic state variants are defined as a family; check the literal token.
    assert.ok(new RegExp(`\\.${c}(?![\\w-])`).test(css), `.${c} is not defined in styles.css`);
  }
});
