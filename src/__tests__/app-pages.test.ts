// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/app-pages.test.ts
//
// T2.1.1's C2/C3/C4 pure-logic coverage for `../app-pages.ts` — the bounded
// paged-picker reducer and the id-batch resolution helpers, no React/DOM.
// Each case is named for the mutant class it discriminates, per the
// contract's mutation table.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AppsPageState,
  appsPageReducer,
  dedupeAppend,
  excludeInternalApps,
  initialAppsPageState,
  isStalePageGeneration,
  mergeResolvedApps,
  nextIdBatch,
  sameAppsPageQuery,
} from "../app-pages.ts";
import type { AppSummary } from "../types.ts";

const app = (id: string, extra: Partial<AppSummary> = {}): AppSummary => ({
  id,
  displayName: id,
  ...extra,
});

// ── sameAppsPageQuery ────────────────────────────────────────────────────────

test("sameAppsPageQuery: q and category both must match, empty q is not undefined category", () => {
  assert.equal(sameAppsPageQuery({ q: "a" }, { q: "a" }), true);
  assert.equal(sameAppsPageQuery({ q: "a" }, { q: "b" }), false);
  assert.equal(sameAppsPageQuery({ q: "a", category: "ai" }, { q: "a" }), false);
  assert.equal(sameAppsPageQuery({ q: "" }, { q: "" }), true);
  assert.equal(sameAppsPageQuery({ q: "", category: "ai" }, { q: "", category: "ai" }), true);
});

// ── dedupeAppend ─────────────────────────────────────────────────────────────

test("dedupeAppend: appends only ids not already present, preserving incoming order", () => {
  const existing = [app("a"), app("b")];
  const merged = dedupeAppend(existing, [app("b"), app("c"), app("d")]);
  assert.deepEqual(
    merged.map((a) => a.id),
    ["a", "b", "c", "d"],
  );
});

test("dedupeAppend: identical input returns the SAME array reference (copy-safety, no-op)", () => {
  const existing = [app("a")];
  const merged = dedupeAppend(existing, [app("a")]);
  assert.equal(merged, existing);
});

test("dedupeAppend: never mutates the existing array", () => {
  const existing = [app("a")];
  const before = existing.slice();
  dedupeAppend(existing, [app("b")]);
  assert.deepEqual(existing, before);
});

// ── appsPageReducer: query-changed ──────────────────────────────────────────

test("query-changed resets apps/cursor and bumps generation for a genuinely new query", () => {
  const s0 = initialAppsPageState({ q: "" }, 0);
  const s1 = appsPageReducer(s0, {
    type: "page-loaded",
    generation: 0,
    apps: [app("a")],
    nextCursor: "c1",
    requestedCursor: undefined,
  });
  const s2 = appsPageReducer(s1, {
    type: "query-changed",
    query: { q: "sendgrid" },
    generation: 1,
  });
  assert.equal(s2.generation, 1);
  assert.deepEqual(s2.apps, []);
  assert.equal(s2.cursor, undefined);
  assert.equal(s2.status, "loading");
});

test("query-changed to the SAME query+generation is a no-op (identity-preserving)", () => {
  const s0 = initialAppsPageState({ q: "x" }, 2);
  const s1 = appsPageReducer(s0, { type: "query-changed", query: { q: "x" }, generation: 2 });
  assert.equal(s1, s0);
});

// ── appsPageReducer: page-loaded / generation guard ─────────────────────────

test("page-loaded from a STALE generation is dropped — a late response cannot overwrite a newer query", () => {
  const s0 = initialAppsPageState({ q: "" }, 5);
  const stale = appsPageReducer(s0, {
    type: "page-loaded",
    generation: 4,
    apps: [app("intruder")],
    nextCursor: undefined,
    requestedCursor: undefined,
  });
  assert.equal(stale, s0);
});

test("page-loaded with the CURRENT generation applies and clears loading", () => {
  const s0 = initialAppsPageState({ q: "" }, 0);
  const s1 = appsPageReducer(s0, {
    type: "page-loaded",
    generation: 0,
    apps: [app("a"), app("b")],
    nextCursor: "c1",
    requestedCursor: undefined,
  });
  assert.equal(s1.status, "ready");
  assert.deepEqual(
    s1.apps.map((a) => a.id),
    ["a", "b"],
  );
  assert.equal(s1.hasMore, true);
  assert.equal(s1.cursor, "c1");
});

test("page-loaded with an ABSENT nextCursor terminates pagination", () => {
  const s0 = initialAppsPageState({ q: "" }, 0);
  const s1 = appsPageReducer(s0, {
    type: "page-loaded",
    generation: 0,
    apps: [app("a")],
    nextCursor: undefined,
    requestedCursor: undefined,
  });
  assert.equal(s1.hasMore, false);
  assert.equal(s1.cursor, undefined);
});

// ── appsPageReducer: repeated/non-advancing cursor guard ────────────────────

test("a repeated/non-advancing cursor (server echoes the requested cursor back) is treated as terminal, not retried", () => {
  const s0: AppsPageState = {
    ...initialAppsPageState({ q: "" }, 0),
    status: "ready",
    cursor: "c1",
  };
  const s1 = appsPageReducer(s0, {
    type: "page-loaded",
    generation: 0,
    apps: [app("a")],
    nextCursor: "c1",
    requestedCursor: "c1",
  });
  assert.equal(s1.hasMore, false);
  assert.equal(s1.cursor, undefined);
});

test("a genuinely ADVANCING cursor is not confused with the repeated-cursor guard", () => {
  const s0: AppsPageState = {
    ...initialAppsPageState({ q: "" }, 0),
    status: "ready",
    cursor: "c1",
  };
  const s1 = appsPageReducer(s0, {
    type: "page-loaded",
    generation: 0,
    apps: [app("a")],
    nextCursor: "c2",
    requestedCursor: "c1",
  });
  assert.equal(s1.hasMore, true);
  assert.equal(s1.cursor, "c2");
});

// ── appsPageReducer: load-more ──────────────────────────────────────────────

test("load-more is a no-op unless status is ready AND hasMore is true", () => {
  const loading = initialAppsPageState({ q: "" }, 0);
  assert.equal(appsPageReducer(loading, { type: "load-more" }), loading);

  const readyNoMore: AppsPageState = {
    ...initialAppsPageState({ q: "" }, 0),
    status: "ready",
    hasMore: false,
  };
  assert.equal(appsPageReducer(readyNoMore, { type: "load-more" }), readyNoMore);
});

test("load-more transitions ready+hasMore into loading-more, without touching apps yet", () => {
  const s0: AppsPageState = {
    ...initialAppsPageState({ q: "" }, 0),
    status: "ready",
    apps: [app("a")],
    hasMore: true,
    cursor: "c1",
  };
  const s1 = appsPageReducer(s0, { type: "load-more" });
  assert.equal(s1.status, "loading-more");
  assert.deepEqual(s1.apps, s0.apps);
});

test("appending duplicate ids from a load-more response dedupes rather than doubling the list", () => {
  const s0: AppsPageState = {
    ...initialAppsPageState({ q: "" }, 0),
    status: "loading-more",
    apps: [app("a")],
    cursor: "c1",
  };
  const s1 = appsPageReducer(s0, {
    type: "page-loaded",
    generation: 0,
    apps: [app("a"), app("b")],
    nextCursor: undefined,
    requestedCursor: "c1",
  });
  assert.deepEqual(
    s1.apps.map((a) => a.id),
    ["a", "b"],
  );
});

// ── appsPageReducer: page-failed ─────────────────────────────────────────────

test("page-failed preserves already-loaded apps and is distinct from an empty successful page", () => {
  const s0: AppsPageState = {
    ...initialAppsPageState({ q: "" }, 0),
    status: "ready",
    apps: [app("a")],
  };
  const failed = appsPageReducer(s0, {
    type: "page-failed",
    generation: 0,
    error: "network_error",
  });
  assert.equal(failed.status, "error");
  assert.equal(failed.error, "network_error");
  assert.deepEqual(failed.apps, [app("a")]);

  const emptySuccess = appsPageReducer(s0, {
    type: "page-loaded",
    generation: 0,
    apps: [],
    nextCursor: undefined,
    requestedCursor: undefined,
  });
  assert.equal(emptySuccess.status, "ready");
  assert.equal(emptySuccess.error, undefined);
});

test("page-failed from a stale generation is dropped, exactly like page-loaded", () => {
  const s0 = initialAppsPageState({ q: "" }, 3);
  const stale = appsPageReducer(s0, { type: "page-failed", generation: 2, error: "boom" });
  assert.equal(stale, s0);
});

test("isStalePageGeneration matches the reducer's own generation guard", () => {
  const s0 = initialAppsPageState({ q: "" }, 7);
  assert.equal(isStalePageGeneration(s0, 7), false);
  assert.equal(isStalePageGeneration(s0, 6), true);
});

// ── excludeInternalApps ──────────────────────────────────────────────────────

test("excludeInternalApps drops @w6w/* pseudo-apps and keeps everything else", () => {
  const apps = [app("@w6w/control"), app("sendgrid"), app("@w6w/http")];
  assert.deepEqual(
    excludeInternalApps(apps).map((a) => a.id),
    ["sendgrid"],
  );
});

// ── nextIdBatch ───────────────────────────────────────────────────────────────

test("nextIdBatch takes up to batchSize ids, in the original id-list order, skipping already-requested", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const first = nextIdBatch(ids, new Set(), 2);
  assert.deepEqual(first, ["a", "b"]);
  const second = nextIdBatch(ids, new Set(first), 2);
  assert.deepEqual(second, ["c", "d"]);
  const third = nextIdBatch(ids, new Set([...first, ...second]), 2);
  assert.deepEqual(third, ["e"]);
  const fourth = nextIdBatch(ids, new Set(ids), 2);
  assert.deepEqual(fourth, []);
});

test("nextIdBatch is idempotent for the same (ids, requested) pair — never re-requests", () => {
  const ids = ["a", "b", "c"];
  const requested = new Set(["a"]);
  assert.deepEqual(nextIdBatch(ids, requested, 5), ["b", "c"]);
  assert.deepEqual(nextIdBatch(ids, requested, 5), ["b", "c"]);
});

test("nextIdBatch with batchSize <= 0 requests nothing", () => {
  assert.deepEqual(nextIdBatch(["a"], new Set(), 0), []);
  assert.deepEqual(nextIdBatch(["a"], new Set(), -1), []);
});

// ── mergeResolvedApps ─────────────────────────────────────────────────────────

test("mergeResolvedApps preserves the ORIGINAL id-list order, not resolution/arrival order", () => {
  const ids = ["c", "a", "b"];
  const resolved = new Map([
    ["a", app("a")],
    ["b", app("b")],
    ["c", app("c")],
  ]);
  assert.deepEqual(
    mergeResolvedApps(ids, resolved).map((a) => a.id),
    ["c", "a", "b"],
  );
});

test("mergeResolvedApps silently OMITS an id with no resolved entry (missing/404), not an error placeholder", () => {
  const ids = ["a", "missing", "b"];
  const resolved = new Map([
    ["a", app("a")],
    ["b", app("b")],
  ]);
  assert.deepEqual(
    mergeResolvedApps(ids, resolved).map((a) => a.id),
    ["a", "b"],
  );
});
