// Run: node --import ./src/test-jsx-loader.mjs --test src/components/__tests__/ExecutionHistory.test.ts  (Node 24)
//
// Mirrors `Copyable.test.ts`'s header (JSDOM + navigator + matchMedia +
// MutationObserver + IS_REACT_ACT_ENVIRONMENT) — the CodeMirror-specific
// Window/requestAnimationFrame trio `JsonEditor.copy.test.ts` needs is not
// required here: `ExecutionDetail` mounts `CodeBlock` (a plain `<pre><code>`
// plus `Copyable`'s plain DOM listeners), never a CodeMirror instance.
//
// One file for the three T2.2.2 components: they are one contract surface (the
// history view's filter bar, its aggregate strip and its detail pane) and they
// are exercised together here rather than split across three files that would
// each repeat this 50-line jsdom preamble.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";
import type { ExecutionDetailValue } from "../ExecutionDetail.tsx";
import type { ExecutionFilterValue } from "../ExecutionFilters.tsx";
import type { ExecutionLogStep } from "../ExecutionLogPanel.tsx";
import type { ExecutionStatsValue } from "../ExecutionStats.tsx";

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
const { ExecutionFilters } = await import("../ExecutionFilters.tsx");
const { ExecutionStats } = await import("../ExecutionStats.tsx");
const { ExecutionDetail } = await import("../ExecutionDetail.tsx");
const { formatDurationMs, formatExecutionTime } = await import("../execution-format.ts");

function mountRoot() {
  const container = document.getElementById("root");
  assert.ok(container);
  container.innerHTML = "";
  const root = createRoot(container);
  return { container, root };
}

async function render(element: ReactElement) {
  const { container, root } = mountRoot();
  await act(async () => {
    root.render(element);
  });
  return { container, root };
}

/** The element carrying `data-testid`, asserted present. */
function byTestId(container: HTMLElement, testid: string): Element {
  const el = container.querySelector(`[data-testid="${testid}"]`);
  assert.ok(el, `expected [data-testid="${testid}"] to be rendered`);
  return el;
}

function maybeByTestId(container: HTMLElement, testid: string): Element | null {
  return container.querySelector(`[data-testid="${testid}"]`);
}

/**
 * Absence is asserted on a BOOLEAN, never on the element itself: `assert.equal`
 * on a jsdom node builds a failure message by deeply inspecting it, and that
 * becomes a multi-minute traversal of jsdom's object graph the moment the
 * assertion fails — which is exactly when a mutation-testing run needs the
 * failure to be fast and readable.
 */
function assertAbsent(container: HTMLElement, testid: string, message?: string) {
  assert.ok(
    maybeByTestId(container, testid) === null,
    message ?? `expected no [data-testid="${testid}"]`,
  );
}

function text(el: Element | null | undefined): string {
  assert.ok(el, "expected element");
  return (el.textContent ?? "").trim();
}

/**
 * A `<select>` reports its change through React's SELECT branch, which listens
 * for `change`; a text-like `<input>` (search, date) goes through the
 * input/change branch, which listens for `input`. Setting `el.value` directly
 * would NOT fire either: React's value tracker would see no change, which is
 * why the write goes through the prototype's own setter first.
 */
async function setControl(el: Element, value: string) {
  const isSelect = el instanceof dom.window.HTMLSelectElement;
  const proto = isSelect
    ? dom.window.HTMLSelectElement.prototype
    : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  assert.ok(setter, "expected a native value setter on the control's prototype");
  setter.call(el, value);
  await act(async () => {
    el.dispatchEvent(new dom.window.Event(isSelect ? "change" : "input", { bubbles: true }));
  });
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
}

function optionValues(select: Element): string[] {
  return [...select.querySelectorAll("option")].map((o) => o.getAttribute("value") ?? "");
}

function optionLabels(select: Element): string[] {
  return [...select.querySelectorAll("option")].map((o) => text(o));
}

// ── A1 — ExecutionFilters ────────────────────────────────────────────────

const EMPTY_FILTERS: ExecutionFilterValue = { status: "", kind: "", from: "", to: "", q: "" };
const FULL_FILTERS: ExecutionFilterValue = {
  status: "failed",
  kind: "workflow",
  from: "2026-09-01",
  to: "2026-09-30",
  q: "welcome",
};

test("A1 — search, status and both date bounds each carry an aria-label", async () => {
  const { container, root } = await render(
    React.createElement(ExecutionFilters, { value: EMPTY_FILTERS, onChange: () => {} }),
  );
  try {
    const controls = [
      "execution-filter-q",
      "execution-filter-status",
      "execution-filter-from",
      "execution-filter-to",
    ];
    for (const testid of controls) {
      const el = byTestId(container, testid);
      assert.ok(
        (el.getAttribute("aria-label") ?? "").length > 0,
        `${testid} must carry an aria-label of its own`,
      );
    }
    // The pinned element types: a search box and two date pickers.
    assert.equal(byTestId(container, "execution-filter-q").getAttribute("type"), "search");
    assert.equal(byTestId(container, "execution-filter-from").getAttribute("type"), "date");
    assert.equal(byTestId(container, "execution-filter-to").getAttribute("type"), "date");
  } finally {
    await act(async () => root.unmount());
  }
});

test("A1 — the kind select is absent unless showKind, and the search placeholder defaults", async () => {
  const without = await render(
    React.createElement(ExecutionFilters, { value: EMPTY_FILTERS, onChange: () => {} }),
  );
  try {
    assertAbsent(without.container, "execution-filter-kind");
    assert.equal(
      byTestId(without.container, "execution-filter-q").getAttribute("placeholder"),
      "Search by id or name",
    );
  } finally {
    await act(async () => without.root.unmount());
  }

  const withKind = await render(
    React.createElement(ExecutionFilters, {
      value: EMPTY_FILTERS,
      onChange: () => {},
      showKind: true,
      searchPlaceholder: "Filter runs…",
    }),
  );
  try {
    assert.ok(maybeByTestId(withKind.container, "execution-filter-kind"));
    assert.equal(
      byTestId(withKind.container, "execution-filter-q").getAttribute("placeholder"),
      "Filter runs…",
    );
  } finally {
    await act(async () => withKind.root.unmount());
  }
});

test("A1 — status options are Any status + the five run states, capitalised; kind is Any type + the three kinds", async () => {
  const { container, root } = await render(
    React.createElement(ExecutionFilters, {
      value: EMPTY_FILTERS,
      onChange: () => {},
      showKind: true,
    }),
  );
  try {
    const status = byTestId(container, "execution-filter-status");
    assert.deepEqual(optionValues(status), [
      "",
      "queued",
      "running",
      "succeeded",
      "failed",
      "canceled",
    ]);
    assert.deepEqual(optionLabels(status), [
      "Any status",
      "Queued",
      "Running",
      "Succeeded",
      "Failed",
      "Canceled",
    ]);

    const kind = byTestId(container, "execution-filter-kind");
    assert.deepEqual(optionValues(kind), ["", "function", "endpoint", "workflow"]);
    assert.deepEqual(optionLabels(kind), ["Any type", "Function", "Endpoint", "Workflow"]);
  } finally {
    await act(async () => root.unmount());
  }
});

test("A1 — each control reports exactly one change, carrying only its own field", async () => {
  // Every case starts from the same fully-populated value, so an implementation
  // that rebuilt the object (or spread the WRONG source) would drop a sibling
  // filter and fail here.
  const cases: Array<{ testid: string; next: string; expected: ExecutionFilterValue }> = [
    {
      testid: "execution-filter-q",
      next: "contact",
      expected: { ...FULL_FILTERS, q: "contact" },
    },
    {
      testid: "execution-filter-status",
      next: "queued",
      expected: { ...FULL_FILTERS, status: "queued" },
    },
    {
      testid: "execution-filter-kind",
      next: "endpoint",
      expected: { ...FULL_FILTERS, kind: "endpoint" },
    },
    {
      testid: "execution-filter-from",
      next: "2026-08-15",
      expected: { ...FULL_FILTERS, from: "2026-08-15" },
    },
    {
      testid: "execution-filter-to",
      next: "2026-10-01",
      expected: { ...FULL_FILTERS, to: "2026-10-01" },
    },
    // Back to "no filter" is a change like any other — only that field moves.
    {
      testid: "execution-filter-status",
      next: "",
      expected: { ...FULL_FILTERS, status: "" },
    },
  ];

  for (const { testid, next, expected } of cases) {
    const calls: ExecutionFilterValue[] = [];
    const { container, root } = await render(
      React.createElement(ExecutionFilters, {
        value: FULL_FILTERS,
        onChange: (v: ExecutionFilterValue) => calls.push(v),
        showKind: true,
      }),
    );
    try {
      await setControl(byTestId(container, testid), next);
      assert.equal(
        calls.length,
        1,
        `${testid} → ${next} must report exactly one change (no debounce, no batching)`,
      );
      assert.deepEqual(calls[0], expected);
    } finally {
      await act(async () => root.unmount());
    }
  }
});

test("A1 — Clear renders iff some field is set, and reports the fully-cleared value once", async () => {
  const cases: Array<ExecutionFilterValue> = [
    { ...EMPTY_FILTERS, q: "x" },
    { ...EMPTY_FILTERS, status: "failed" },
    { ...EMPTY_FILTERS, kind: "workflow" },
    { ...EMPTY_FILTERS, from: "2026-09-01" },
    { ...EMPTY_FILTERS, to: "2026-09-30" },
  ];
  for (const value of cases) {
    const { container, root } = await render(
      React.createElement(ExecutionFilters, { value, onChange: () => {} }),
    );
    try {
      assert.ok(
        maybeByTestId(container, "execution-filter-clear"),
        `Clear must render for ${JSON.stringify(value)}`,
      );
    } finally {
      await act(async () => root.unmount());
    }
  }

  const untouched = await render(
    React.createElement(ExecutionFilters, { value: EMPTY_FILTERS, onChange: () => {} }),
  );
  try {
    assertAbsent(untouched.container, "execution-filter-clear");
  } finally {
    await act(async () => untouched.root.unmount());
  }

  const calls: ExecutionFilterValue[] = [];
  const { container, root } = await render(
    React.createElement(ExecutionFilters, {
      value: FULL_FILTERS,
      onChange: (v: ExecutionFilterValue) => calls.push(v),
      showKind: true,
    }),
  );
  try {
    await click(byTestId(container, "execution-filter-clear"));
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { status: "", kind: "", from: "", to: "", q: "" });
  } finally {
    await act(async () => root.unmount());
  }
});

test("A1 — disabled disables every control, Clear included", async () => {
  const { container, root } = await render(
    React.createElement(ExecutionFilters, {
      value: FULL_FILTERS,
      onChange: () => {},
      showKind: true,
      disabled: true,
    }),
  );
  try {
    for (const testid of [
      "execution-filter-q",
      "execution-filter-status",
      "execution-filter-kind",
      "execution-filter-from",
      "execution-filter-to",
      "execution-filter-clear",
    ]) {
      assert.ok(
        (byTestId(container, testid) as HTMLInputElement).disabled,
        `${testid} must be disabled`,
      );
    }
  } finally {
    await act(async () => root.unmount());
  }
});

// ── A2 — ExecutionStats ──────────────────────────────────────────────────

const STATS: ExecutionStatsValue = {
  total: 128,
  succeeded: 96,
  failed: 21,
  canceled: 4,
  inFlight: 3,
  successRate: 0.6666666,
  avgDurationMs: 125400,
};

/** A card's shown value, from the pinned `data-stat-value` attribute. */
function statValue(container: HTMLElement, testid: string): string {
  const card = byTestId(container, testid);
  const value = card.querySelector("[data-stat-value]");
  assert.ok(value, `${testid} must carry a [data-stat-value] element`);
  assert.equal(
    text(value),
    value.getAttribute("data-stat-value"),
    "the attribute mirrors the text",
  );
  return value.getAttribute("data-stat-value") ?? "";
}

const ALWAYS_ON: string[] = [
  "execution-stat-total",
  "execution-stat-success-rate",
  "execution-stat-failed",
  "execution-stat-avg-duration",
];

test("A2 — stats null renders — for every card, and no in-flight card", async () => {
  const { container, root } = await render(React.createElement(ExecutionStats, { stats: null }));
  try {
    assert.ok(byTestId(container, "execution-stats"));
    for (const testid of ALWAYS_ON) {
      assert.equal(statValue(container, testid), "—");
    }
    assertAbsent(
      container,
      "execution-stat-in-flight",
      "an unknown in-flight count renders no card",
    );
    assert.deepEqual(cardParts(container, "execution-stat-total"), ["—", "Executions"]);
  } finally {
    await act(async () => root.unmount());
  }
});

/** A card's visible text, value then label — used to pin the human labels. */
function cardParts(container: HTMLElement, testid: string): string[] {
  const card = byTestId(container, testid);
  return [...card.children].map((child) => text(child));
}

test("A2 — labels are the pinned ones, next to their value", async () => {
  const { container, root } = await render(React.createElement(ExecutionStats, { stats: STATS }));
  try {
    assert.deepEqual(cardParts(container, "execution-stat-total"), ["128", "Executions"]);
    assert.deepEqual(cardParts(container, "execution-stat-success-rate"), ["67%", "Success rate"]);
    assert.deepEqual(cardParts(container, "execution-stat-failed"), ["21", "Failed"]);
    assert.deepEqual(cardParts(container, "execution-stat-avg-duration"), [
      "2m 5s",
      "Avg duration",
    ]);
    assert.deepEqual(cardParts(container, "execution-stat-in-flight"), ["3", "In flight"]);
  } finally {
    await act(async () => root.unmount());
  }
});

test("A2 — success rate rounds to a whole percent, and is — when unknown", async () => {
  const cases: Array<[number | null, string]> = [
    [0.6666666666666666, "67%"],
    [0.5, "50%"],
    [1, "100%"],
    [0, "0%"],
    [0.004, "0%"],
    [0.995, "100%"],
    [null, "—"],
  ];
  for (const [rate, expected] of cases) {
    const { container, root } = await render(
      React.createElement(ExecutionStats, { stats: { ...STATS, successRate: rate } }),
    );
    try {
      assert.equal(statValue(container, "execution-stat-success-rate"), expected, `rate ${rate}`);
    } finally {
      await act(async () => root.unmount());
    }
  }
});

test("A2 — the counts are plain strings and the average goes through formatDurationMs", async () => {
  const { container, root } = await render(
    React.createElement(ExecutionStats, {
      stats: { ...STATS, total: 0, failed: 7, avgDurationMs: null },
    }),
  );
  try {
    assert.equal(statValue(container, "execution-stat-total"), "0");
    assert.equal(statValue(container, "execution-stat-failed"), "7");
    assert.equal(statValue(container, "execution-stat-avg-duration"), "—");
    assert.equal(formatDurationMs(null), statValue(container, "execution-stat-avg-duration"));
  } finally {
    await act(async () => root.unmount());
  }
});

test("A2 — the in-flight card exists only when there are runs in flight", async () => {
  for (const [inFlight, present] of [
    [3, true],
    [1, true],
    [0, false],
  ] as Array<[number, boolean]>) {
    const { container, root } = await render(
      React.createElement(ExecutionStats, { stats: { ...STATS, inFlight } }),
    );
    try {
      const card = maybeByTestId(container, "execution-stat-in-flight");
      assert.equal(card !== null, present, `inFlight ${inFlight}`);
      if (card) assert.equal(statValue(container, "execution-stat-in-flight"), String(inFlight));
    } finally {
      await act(async () => root.unmount());
    }
  }
});

test("A2 — label renders above the cards; omitted ⇒ no node", async () => {
  const labelled = await render(
    React.createElement(ExecutionStats, { stats: STATS, label: "Last 7 days" }),
  );
  try {
    assert.equal(
      text(labelled.container.querySelector(".w6w-execution-stats-label")),
      "Last 7 days",
    );
  } finally {
    await act(async () => labelled.root.unmount());
  }

  const bare = await render(React.createElement(ExecutionStats, { stats: STATS }));
  try {
    assert.ok(
      bare.container.querySelector(".w6w-execution-stats-label") === null,
      "an omitted label renders no node",
    );
  } finally {
    await act(async () => bare.root.unmount());
  }
});

// ── A3 — ExecutionDetail ─────────────────────────────────────────────────

const STEPS: ExecutionLogStep[] = [
  {
    id: "step-1",
    label: "Fetch contact",
    status: "succeeded",
    startedAt: "2026-09-22T10:00:00Z",
    finishedAt: "2026-09-22T10:00:01Z",
  },
  { id: "step-2", label: "Send welcome email", status: "failed" },
];

const SUCCEEDED: ExecutionDetailValue = {
  id: "run_01J8Z3K4",
  kind: "function",
  callableName: "fetch-contact",
  status: "succeeded",
  startedAt: "2026-09-22T10:00:00Z",
  finishedAt: "2026-09-22T10:00:01.254Z",
  durationMs: 1254,
  input: { contactId: "c_123" },
  output: { email: "ada@example.com" },
};

test("A3 — no execution + loading renders the loading branch; no execution and not loading does not", async () => {
  const loading = await render(
    React.createElement(ExecutionDetail, { execution: null, loading: true }),
  );
  try {
    assert.equal(text(byTestId(loading.container, "execution-detail-loading")), "Loading…");
    assert.equal(loading.container.querySelectorAll(".w6w-execution-detail-name").length, 0);
  } finally {
    await act(async () => loading.root.unmount());
  }

  const idle = await render(React.createElement(ExecutionDetail, { execution: null }));
  try {
    assertAbsent(idle.container, "execution-detail-loading");
  } finally {
    await act(async () => idle.root.unmount());
  }
});

test("A3 — an execution renders the name, the status pill, the raw id and the timing", async () => {
  const { container, root } = await render(
    React.createElement(ExecutionDetail, { execution: SUCCEEDED }),
  );
  try {
    assert.ok(byTestId(container, "execution-detail"));
    assert.equal(text(container.querySelector(".w6w-execution-detail-name")), "fetch-contact");
    assert.ok(container.querySelector(".w6w-step-pill-succeeded"));
    assert.equal(text(byTestId(container, "execution-detail-id")), "run_01J8Z3K4");
    assert.equal(byTestId(container, "execution-detail-id").tagName, "CODE");

    const timing = container.querySelector(".w6w-execution-detail-timing");
    const values = [...(timing?.querySelectorAll("dd") ?? [])].map((dd) => text(dd));
    assert.deepEqual(values, [
      formatExecutionTime("2026-09-22T10:00:00Z"),
      formatExecutionTime("2026-09-22T10:00:01.254Z"),
      "1.3 s",
    ]);
    const labels = [...(timing?.querySelectorAll("dt") ?? [])].map((dt) => text(dt));
    assert.deepEqual(labels, ["Started", "Finished", "Duration"]);
  } finally {
    await act(async () => root.unmount());
  }
});

test("A3 — a run that has not finished reads — for Finished and Duration", async () => {
  const { container, root } = await render(
    React.createElement(ExecutionDetail, {
      execution: { ...SUCCEEDED, status: "running", finishedAt: null, durationMs: null },
    }),
  );
  try {
    assert.ok(container.querySelector(".w6w-step-pill-running"));
    const values = [...container.querySelectorAll(".w6w-execution-detail-timing dd")].map((dd) =>
      text(dd),
    );
    assert.deepEqual(values.slice(1), ["—", "—"]);
  } finally {
    await act(async () => root.unmount());
  }
});

test("A3 — input/output sections are gated on `undefined`, never on truthiness", async () => {
  const cases: Array<{
    label: string;
    input?: unknown;
    output?: unknown;
    present: string[];
    absent: string[];
  }> = [
    {
      label: "neither given",
      present: [],
      absent: ["execution-detail-input", "execution-detail-output"],
    },
    {
      label: "input present",
      input: { a: 1 },
      present: ["execution-detail-input"],
      absent: ["execution-detail-output"],
    },
    {
      label: "input is null",
      input: null,
      present: ["execution-detail-input"],
      absent: [],
    },
    {
      label: "output is null",
      output: null,
      present: ["execution-detail-output"],
      absent: [],
    },
    {
      label: "output is false",
      output: false,
      present: ["execution-detail-output"],
      absent: [],
    },
    {
      label: "output is an empty array",
      output: [],
      present: ["execution-detail-output"],
      absent: [],
    },
  ];

  for (const { label, input, output, present, absent } of cases) {
    const { container, root } = await render(
      React.createElement(ExecutionDetail, {
        execution: { ...SUCCEEDED, input, output },
      }),
    );
    try {
      for (const testid of present) {
        assert.ok(maybeByTestId(container, testid), `${label}: ${testid} must render`);
      }
      for (const testid of absent) {
        assertAbsent(container, testid, `${label}: ${testid} must not render`);
      }
    } finally {
      await act(async () => root.unmount());
    }
  }
});

test("A3 — a payload section renders pretty-printed JSON through CodeBlock", async () => {
  const { container, root } = await render(
    React.createElement(ExecutionDetail, {
      execution: { ...SUCCEEDED, input: { contactId: "c_123", nested: { a: [1, 2] } } },
    }),
  );
  try {
    const section = byTestId(container, "execution-detail-input");
    assert.ok(section.querySelector(".w6w-code-block"), "expected CodeBlock's own className");
    assert.equal(text(section.querySelector("strong")), "Input");
    assert.ok(
      text(section.querySelector(".w6w-code-block")).includes('"contactId": "c_123"'),
      "the JSON is pretty-printed (2-space indent), not minified",
    );
  } finally {
    await act(async () => root.unmount());
  }

  const nullOutput = await render(
    React.createElement(ExecutionDetail, {
      execution: { ...SUCCEEDED, input: undefined, output: null },
    }),
  );
  try {
    const block = byTestId(nullOutput.container, "execution-detail-output").querySelector(
      ".w6w-code-block",
    );
    assert.equal(text(block), "null", "a null output renders the JSON literal, not an empty block");
  } finally {
    await act(async () => nullOutput.root.unmount());
  }
});

test("A3 — the error section is gated on a non-null error (the reverse gate)", async () => {
  const cases: Array<[unknown, boolean]> = [
    [undefined, false],
    [null, false],
    [{ code: "INVALID_EMAIL", message: "nope" }, true],
    ["boom", true],
    [false, true],
    [0, true],
  ];
  for (const [error, present] of cases) {
    const { container, root } = await render(
      React.createElement(ExecutionDetail, {
        execution: { ...SUCCEEDED, status: "failed", error },
      }),
    );
    try {
      assert.equal(
        maybeByTestId(container, "execution-detail-error") !== null,
        present,
        `error ${JSON.stringify(error) ?? "undefined"}`,
      );
    } finally {
      await act(async () => root.unmount());
    }
  }

  const withError = await render(
    React.createElement(ExecutionDetail, {
      execution: { ...SUCCEEDED, status: "failed", error: { code: "INVALID_EMAIL" } },
    }),
  );
  try {
    assert.ok(
      text(byTestId(withError.container, "execution-detail-error")).includes("INVALID_EMAIL"),
    );
  } finally {
    await act(async () => withError.root.unmount());
  }
});

test("A3 — steps render through ExecutionLogPanel, gated on `undefined`", async () => {
  const without = await render(
    React.createElement(ExecutionDetail, { execution: { ...SUCCEEDED, steps: undefined } }),
  );
  try {
    assertAbsent(without.container, "execution-detail-steps");
  } finally {
    await act(async () => without.root.unmount());
  }

  const empty = await render(
    React.createElement(ExecutionDetail, { execution: { ...SUCCEEDED, steps: [] } }),
  );
  try {
    const section = byTestId(empty.container, "execution-detail-steps");
    assert.ok(text(section).includes("No steps ran."), "emptyLabel is passed down to the panel");
    assert.equal(section.querySelectorAll(".w6w-execution-log-row").length, 0);
  } finally {
    await act(async () => empty.root.unmount());
  }

  const full = await render(
    React.createElement(ExecutionDetail, { execution: { ...SUCCEEDED, steps: STEPS } }),
  );
  try {
    const section = byTestId(full.container, "execution-detail-steps");
    const rows = [...section.querySelectorAll(".w6w-execution-log-row")];
    assert.equal(rows.length, 2);
    assert.ok(text(rows[0]).includes("Fetch contact"));
    assert.ok(section.querySelector(".w6w-step-pill-failed"), "the failed step keeps its pill");
  } finally {
    await act(async () => full.root.unmount());
  }
});

test("A3 — the two controls render iff their callback is given, and call it once", async () => {
  const bare = await render(React.createElement(ExecutionDetail, { execution: SUCCEEDED }));
  try {
    assertAbsent(bare.container, "execution-detail-open-editor");
    assertAbsent(bare.container, "execution-detail-close");
  } finally {
    await act(async () => bare.root.unmount());
  }

  // Each control is gated on ITS OWN callback, not on the presence of the
  // control row: a host that only offers "Close" must not get an editor button
  // it never wired up (and vice versa).
  const closeOnly = await render(
    React.createElement(ExecutionDetail, { execution: SUCCEEDED, onClose: () => {} }),
  );
  try {
    assertAbsent(closeOnly.container, "execution-detail-open-editor");
    assert.ok(maybeByTestId(closeOnly.container, "execution-detail-close"));
  } finally {
    await act(async () => closeOnly.root.unmount());
  }

  const editorOnly = await render(
    React.createElement(ExecutionDetail, { execution: SUCCEEDED, onOpenInEditor: () => {} }),
  );
  try {
    assertAbsent(editorOnly.container, "execution-detail-close");
    assert.ok(maybeByTestId(editorOnly.container, "execution-detail-open-editor"));
  } finally {
    await act(async () => editorOnly.root.unmount());
  }

  let opened = 0;
  let closed = 0;
  const { container, root } = await render(
    React.createElement(ExecutionDetail, {
      execution: SUCCEEDED,
      onOpenInEditor: () => {
        opened += 1;
      },
      onClose: () => {
        closed += 1;
      },
    }),
  );
  try {
    const open = byTestId(container, "execution-detail-open-editor");
    assert.equal(text(open), "Open in visual editor");
    await click(open);
    assert.equal(opened, 1);

    const close = byTestId(container, "execution-detail-close");
    assert.equal(close.getAttribute("aria-label"), "Close");
    await click(close);
    assert.equal(closed, 1);
  } finally {
    await act(async () => root.unmount());
  }
});

test("A3 — errorMessage renders as an alert, in every branch", async () => {
  const withExecution = await render(
    React.createElement(ExecutionDetail, {
      execution: SUCCEEDED,
      errorMessage: "Could not refresh this execution.",
    }),
  );
  try {
    const alert = byTestId(withExecution.container, "execution-detail-error-message");
    assert.equal(alert.getAttribute("role"), "alert");
    assert.equal(text(alert), "Could not refresh this execution.");
    assert.ok(
      maybeByTestId(withExecution.container, "execution-detail-input"),
      "the run still renders",
    );
  } finally {
    await act(async () => withExecution.root.unmount());
  }

  const whileLoading = await render(
    React.createElement(ExecutionDetail, {
      execution: null,
      loading: true,
      errorMessage: "Failed.",
    }),
  );
  try {
    assert.equal(
      text(byTestId(whileLoading.container, "execution-detail-error-message")),
      "Failed.",
    );
    assert.ok(byTestId(whileLoading.container, "execution-detail-loading"));
  } finally {
    await act(async () => whileLoading.root.unmount());
  }

  const without = await render(React.createElement(ExecutionDetail, { execution: SUCCEEDED }));
  try {
    assertAbsent(without.container, "execution-detail-error-message");
  } finally {
    await act(async () => without.root.unmount());
  }
});
