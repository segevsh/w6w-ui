// Run: node --import ./src/test-jsx-loader.mjs --test src/components/__tests__/ExecutionList.test.ts  (Node 24)
//
// Mirrors `Copyable.test.ts`'s header (JSDOM + navigator + matchMedia +
// MutationObserver + IS_REACT_ACT_ENVIRONMENT) — the CodeMirror-specific
// Window/requestAnimationFrame trio `JsonEditor.copy.test.ts` needs is not
// required here: this file mounts `ExecutionList`/`ListItem`/`StepStatusPill`,
// none of which touch CodeMirror.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { ExecutionListItem, ExecutionListProps } from "../ExecutionList.tsx";
import type { ExecutionStatus, StepStatus, StepStatusPillProps } from "../StepStatusPill.tsx";

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
const { ExecutionList } = await import("../ExecutionList.tsx");
const { StepStatusPill } = await import("../StepStatusPill.tsx");
const { formatDurationMs, formatExecutionTime } = await import("../execution-format.ts");

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

async function renderPill(props: StepStatusPillProps) {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(React.createElement(StepStatusPill, props));
  });
  const html = container.innerHTML;
  await act(async () => {
    root.unmount();
  });
  return html;
}

async function renderList(props: ExecutionListProps) {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(React.createElement(ExecutionList, props));
  });
  return { container, root };
}

/** The `ListItem`'s own box for row `i` — the clickable `<button>` when
 * `onSelect` was given, the non-interactive `<div>` otherwise. */
function rowBox(row: Element): Element {
  const box = row.querySelector(".w6w-list-item");
  assert.ok(box, "row must wrap a ListItem");
  return box;
}

function text(el: Element | null): string {
  assert.ok(el, "expected element");
  return (el.textContent ?? "").trim();
}

function rows(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('[data-testid="execution-row"]')];
}

function item(over: Partial<ExecutionListItem> & { id: string }): ExecutionListItem {
  return {
    kind: "function",
    callableName: "fetch-contact",
    status: "succeeded",
    startedAt: "2026-09-22T10:00:00Z",
    durationMs: 1534,
    ...over,
  };
}

// ── A2 — the formatters ──────────────────────────────────────────────────

test("A2 — formatDurationMs matches every pinned example", () => {
  const cases: Array<[number | null | undefined, string]> = [
    [0, "0 ms"],
    [999, "999 ms"],
    [1000, "1.0 s"],
    [1534, "1.5 s"],
    [60000, "1m 0s"],
    [125400, "2m 5s"],
    [null, "—"],
    [undefined, "—"],
    [Number.NaN, "—"],
    [-1, "—"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(formatDurationMs(input), expected, `formatDurationMs(${String(input)})`);
  }
});

test("A2 — formatExecutionTime formats a real instant and passes an unparseable one through", () => {
  const iso = "2026-09-22T10:00:00Z";
  const formatted = formatExecutionTime(iso);
  assert.notEqual(formatted, iso, "a parseable instant must be formatted, not echoed");
  assert.match(formatted, /2026/, "the formatted string carries the year");
  assert.match(formatted, /\d{1,2}:\d{2}/, "the formatted string carries a time, not just a date");
  assert.equal(
    formatExecutionTime("not a date at all"),
    "not a date at all",
    "an unparseable string is returned unchanged — never `Invalid Date`",
  );
});

// ── A1 — the two run states on the pill ──────────────────────────────────

test("A1 — the pill renders queued/canceled with their own modifier class and label", async () => {
  const queued = await renderPill({ state: "queued" });
  assert.match(queued, /w6w-step-pill-queued/);
  assert.match(queued, />Queued</);

  const canceled = await renderPill({ state: "canceled" });
  assert.match(canceled, /w6w-step-pill-canceled/);
  assert.match(canceled, />Canceled</);
});

test("A1 — every step state keeps rendering (the widened prop did not displace them)", async () => {
  for (const state of ["pending", "running", "succeeded", "failed", "skipped"] as StepStatus[]) {
    const html = await renderPill({ state });
    assert.match(html, new RegExp(`w6w-step-pill-${state}`));
    assert.doesNotMatch(html, /w6w-step-pill-label"><\/span>/, `${state} has a visible label`);
  }
});

// ── A3 — ExecutionList ───────────────────────────────────────────────────

test("A3 — rows render in the given order, one <li> per item, each carrying its id", async () => {
  const items = [item({ id: "a" }), item({ id: "b", status: "running" }), item({ id: "c" })];
  const { container, root } = await renderList({ items });
  try {
    assert.ok(container.querySelector('[data-testid="execution-list"]'));
    const rendered = rows(container);
    assert.deepEqual(
      rendered.map((r) => r.getAttribute("data-execution-id")),
      ["a", "b", "c"],
      "order is exactly the order given — never re-sorted",
    );
    for (const r of rendered) assert.equal(r.tagName, "LI");
    // The icon slot is the status pill for that row's own status.
    assert.ok(rows(container)[1].querySelector(".w6w-step-pill-running"));
    assert.ok(rows(container)[0].querySelector(".w6w-step-pill-succeeded"));
  } finally {
    await act(async () => root.unmount());
  }
});

test("A3 — without showCallable: title is the start time, subtitle the run id, trailing the duration", async () => {
  const items = [item({ id: "run_1", startedAt: "2026-09-22T10:00:00Z", durationMs: 125400 })];
  const { container, root } = await renderList({ items });
  try {
    const row = rows(container)[0];
    assert.equal(
      text(row.querySelector(".w6w-list-item-title")),
      formatExecutionTime("2026-09-22T10:00:00Z"),
    );
    assert.equal(text(row.querySelector(".w6w-list-item-subtitle")), "run_1");
    assert.equal(text(row.querySelector(".w6w-list-item-trailing")), "2m 5s");
  } finally {
    await act(async () => root.unmount());
  }
});

test("A3 — with showCallable: title is the callable name, subtitle is kind + start time", async () => {
  const items = [
    item({ id: "run_1", kind: "workflow", callableName: "welcome-email" }),
    item({ id: "run_2", kind: "endpoint", callableName: "POST /v1/contacts", durationMs: null }),
  ];
  const { container, root } = await renderList({ items, showCallable: true });
  try {
    const [first, second] = rows(container);
    assert.equal(text(first.querySelector(".w6w-list-item-title")), "welcome-email");
    assert.equal(
      text(first.querySelector(".w6w-list-item-subtitle")),
      `Workflow · ${formatExecutionTime("2026-09-22T10:00:00Z")}`,
    );
    assert.equal(text(second.querySelector(".w6w-list-item-title")), "POST /v1/contacts");
    assert.match(text(second.querySelector(".w6w-list-item-subtitle")), /^Endpoint · /);
    assert.equal(text(second.querySelector(".w6w-list-item-trailing")), "—");
  } finally {
    await act(async () => root.unmount());
  }
});

test("A3 — selectedId marks exactly that row active (`aria-pressed`), and only there", async () => {
  const items = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];
  const { container, root } = await renderList({ items, selectedId: "b", onSelect: () => {} });
  try {
    const pressed = rows(container).map((r) => rowBox(r).getAttribute("aria-pressed"));
    assert.deepEqual(pressed, ["false", "true", "false"]);
    assert.ok(rowBox(rows(container)[1]).className.includes("active"));
  } finally {
    await act(async () => root.unmount());
  }
});

test("A3 — clicking a row calls onSelect exactly once, with that row's id", async () => {
  const items = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];
  const calls: string[] = [];
  const { container, root } = await renderList({ items, onSelect: (id) => calls.push(id) });
  try {
    const box = rowBox(rows(container)[1]);
    assert.equal(box.tagName, "BUTTON");
    await act(async () => {
      box.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(calls, ["b"]);
  } finally {
    await act(async () => root.unmount());
  }
});

test("A3 — without onSelect the rows are not interactive", async () => {
  const { container, root } = await renderList({ items: [item({ id: "a" })] });
  try {
    const box = rowBox(rows(container)[0]);
    assert.equal(box.tagName, "DIV");
    assert.equal(box.getAttribute("aria-pressed"), null);
    assert.equal(container.querySelectorAll("button").length, 0, "no pager, no clickable row");
  } finally {
    await act(async () => root.unmount());
  }
});

test("A3 — the empty branch shows the default and the overridden label", async () => {
  const { container, root } = await renderList({ items: [] });
  try {
    const empty = container.querySelector('[data-testid="execution-list-empty"]');
    assert.equal(text(empty), "No executions yet.");
    assert.equal(container.querySelector('[data-testid="execution-list-loading"]'), null);
    assert.equal(container.querySelectorAll("ul").length, 0);
  } finally {
    await act(async () => root.unmount());
  }
});

test("A3 — emptyLabel overrides the empty text (as a node)", async () => {
  const { container, root } = await renderList({
    items: [],
    emptyLabel: React.createElement("em", null, "Nothing ran"),
  });
  try {
    const empty = container.querySelector('[data-testid="execution-list-empty"]');
    assert.equal(text(empty), "Nothing ran");
    assert.ok(empty?.querySelector("em"));
  } finally {
    await act(async () => root.unmount());
  }
});

test("A3 — loading with no items shows the loading branch; loading WITH items still shows the rows", async () => {
  const first = await renderList({ items: [], loading: true });
  try {
    const loading = first.container.querySelector('[data-testid="execution-list-loading"]');
    assert.equal(text(loading), "Loading…");
    assert.equal(first.container.querySelector('[data-testid="execution-list-empty"]'), null);
  } finally {
    await act(async () => first.root.unmount());
  }

  const second = await renderList({ items: [item({ id: "a" })], loading: true });
  try {
    assert.equal(rows(second.container).length, 1);
    assert.equal(
      second.container.querySelector('[data-testid="execution-list-loading"]'),
      null,
      "a page with rows is rendered even while a refresh is in flight",
    );
  } finally {
    await act(async () => second.root.unmount());
  }
});

test("A3 — no pager without either callback; the pager's disabled state and callbacks follow the flags", async () => {
  const bare = await renderList({ items: [item({ id: "a" })], hasPrev: true, hasNext: true });
  try {
    assert.equal(bare.container.querySelector('[data-testid="execution-list-prev"]'), null);
    assert.equal(bare.container.querySelector('[data-testid="execution-list-next"]'), null);
  } finally {
    await act(async () => bare.root.unmount());
  }

  const calls: string[] = [];
  const paged = await renderList({
    items: [item({ id: "a" })],
    hasPrev: false,
    hasNext: true,
    onPrev: () => calls.push("prev"),
    onNext: () => calls.push("next"),
    selectedId: null,
  });
  try {
    const prev = paged.container.querySelector<HTMLButtonElement>(
      '[data-testid="execution-list-prev"]',
    );
    const next = paged.container.querySelector<HTMLButtonElement>(
      '[data-testid="execution-list-next"]',
    );
    assert.ok(prev && next);
    assert.equal(text(prev), "Previous");
    assert.equal(text(next), "Next");
    assert.equal(prev.disabled, true, "hasPrev false ⇒ Previous disabled");
    assert.equal(next.disabled, false, "hasNext true ⇒ Next enabled");
    await act(async () => {
      next.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(calls, ["next"], "a disabled Previous reports nothing");
  } finally {
    await act(async () => paged.root.unmount());
  }
});

test("A3 — the pager is offered from the empty and loading branches too", async () => {
  for (const loading of [true, false]) {
    const { container, root } = await renderList({
      items: [],
      loading,
      hasPrev: true,
      onPrev: () => {},
    });
    try {
      const prev = container.querySelector<HTMLButtonElement>(
        '[data-testid="execution-list-prev"]',
      );
      const next = container.querySelector<HTMLButtonElement>(
        '[data-testid="execution-list-next"]',
      );
      assert.ok(prev && next, "a host that can page back needs the control on an empty page");
      assert.equal(prev.disabled, false);
      assert.equal(next.disabled, true, "no `hasNext` ⇒ Next stays disabled");
    } finally {
      await act(async () => root.unmount());
    }
  }
});

test("A3 — all five ExecutionStatus values render their own pill inside their row", async () => {
  const statuses: ExecutionStatus[] = ["queued", "running", "succeeded", "failed", "canceled"];
  const items = statuses.map((status, i) => item({ id: `run_${i}`, status }));
  const { container, root } = await renderList({ items, onSelect: () => {} });
  try {
    const rendered = rows(container);
    statuses.forEach((status, i) => {
      assert.ok(
        rendered[i].querySelector(`.w6w-step-pill-${status}`),
        `row ${i} carries the ${status} pill`,
      );
    });
  } finally {
    await act(async () => root.unmount());
  }
});
