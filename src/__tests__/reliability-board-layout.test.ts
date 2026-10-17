// Run: node --experimental-strip-types --test src/__tests__/reliability-board-layout.test.ts
//
// The board's arrangement decisions — which group a row lands in, which points
// the chart plots, what the compact caps hide. The TIER is the SERVER's
// decision; what these pin is that the client READS it rather than re-deriving
// it, and that nothing reorders or invents data.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ReliabilityServiceView,
  displayBoard,
  needsAttention,
  partitionBoard,
  performancePoints,
  uptimeDays,
} from "../reliability-board-layout.ts";

/** A green service; every case below is this with one field moved. */
function svc(over: Partial<ReliabilityServiceView> = {}): ReliabilityServiceView {
  return {
    appId: "io.w6w.example",
    displayName: "Example",
    state: "ok",
    calls: 100,
    errors: { e4xx: 0, e429: 0, eAuth: 0, e5xx: 0 },
    p95Ms: 120,
    ongoingOutageId: null,
    uptime: [],
    vendorStatus: null,
    attention: "none",
    ...over,
  };
}

test("performancePoints — excludes services with no measured p95", () => {
  const services = [
    svc({ appId: "a", p95Ms: 200, calls: 300 }),
    svc({ appId: "b", p95Ms: null, calls: 0 }),
    svc({ appId: "c", p95Ms: 50, calls: 90 }),
  ];
  assert.deepEqual(
    performancePoints(services).map((r) => r.appId),
    ["a", "c"],
  );
});

test("performancePoints — carries calls, p95, state and a summed error count", () => {
  const services = [
    svc({
      appId: "a",
      p95Ms: 200,
      calls: 300,
      state: "degraded",
      errors: { e4xx: 3, e429: 1, eAuth: 0, e5xx: 2 },
    }),
  ];
  assert.deepEqual(performancePoints(services), [
    {
      appId: "a",
      displayName: "Example",
      calls: 300,
      p95Ms: 200,
      state: "degraded",
      errorCount: 6,
    },
  ]);
});

test("performancePoints — sums all four error kinds (1/2/4/8 → 15)", () => {
  const [p] = performancePoints([svc({ errors: { e4xx: 1, e429: 2, eAuth: 4, e5xx: 8 } })]);
  assert.equal(p?.errorCount, 15);
});

test("performancePoints — the degenerate case", () => {
  assert.deepEqual(performancePoints([]), []);
  assert.deepEqual(performancePoints([svc({ p95Ms: null })]), []);
});

test("needsAttention — reads the tier the server sent, both attention tiers", () => {
  assert.equal(needsAttention(svc({ attention: "now" })), true);
  assert.equal(needsAttention(svc({ attention: "recent" })), true);
  assert.equal(needsAttention(svc({ attention: "none" })), false);
});

test("needsAttention — never re-derives the tier from the two state fields", () => {
  assert.equal(
    needsAttention(svc({ attention: "none", state: "down", ongoingOutageId: "out_1" })),
    false,
    "the client must not promote a row the server ranked clear",
  );
  assert.equal(
    needsAttention(svc({ attention: "now", state: "ok", vendorStatus: null })),
    true,
    "the client must not demote a row the server ranked urgent",
  );
});

test("partitionBoard — three groups, none reordered", () => {
  const services = [
    svc({ appId: "a", attention: "now" }),
    svc({ appId: "b", attention: "none" }),
    svc({ appId: "c", attention: "recent" }),
    svc({ appId: "d", attention: "now" }),
    svc({ appId: "e", attention: "none" }),
  ];
  const { now, recent, clear } = partitionBoard(services);
  assert.deepEqual(
    now.map((s) => s.appId),
    ["a", "d"],
  );
  assert.deepEqual(
    recent.map((s) => s.appId),
    ["c"],
  );
  assert.deepEqual(
    clear.map((s) => s.appId),
    ["b", "e"],
  );
  assert.equal(now.length + recent.length + clear.length, services.length);
});

test("partitionBoard — an unrecognised tier falls to `clear` rather than throwing", () => {
  const odd = svc({ appId: "x", attention: "brand-new-tier" as never });
  const { now, recent, clear } = partitionBoard([odd]);
  assert.deepEqual([now.length, recent.length, clear.length], [0, 0, 1]);
});

test("partitionBoard — the degenerate groups", () => {
  assert.deepEqual(partitionBoard([]), { now: [], recent: [], clear: [] });
  const allBad = [svc({ appId: "a", attention: "now" }), svc({ appId: "b", attention: "now" })];
  assert.equal(partitionBoard(allBad).clear.length, 0);
  assert.equal(partitionBoard(allBad).now.length, 2);
  const allGood = [svc({ appId: "a" }), svc({ appId: "b" })];
  assert.equal(partitionBoard(allGood).now.length, 0);
  assert.equal(partitionBoard(allGood).clear.length, 2);
});

test("partitionBoard — groups by `attention` ONLY when state and attention disagree", () => {
  const services = [
    svc({ appId: "down-none", state: "down", attention: "none" }),
    svc({ appId: "ok-now", state: "ok", attention: "now" }),
    svc({ appId: "z-now", attention: "now", displayName: "Zed" }),
    svc({ appId: "a-now", attention: "now", displayName: "Aaa" }),
  ];
  const { now, clear } = partitionBoard(services);
  assert.deepEqual(
    now.map((s) => s.appId),
    ["ok-now", "z-now", "a-now"],
    "server order preserved inside the group (nothing sorts)",
  );
  assert.deepEqual(
    clear.map((s) => s.appId),
    ["down-none"],
    "state:down with attention:none stays out of the attention group",
  );
});

test("partitionBoard — keeps the caller's richer row type", () => {
  const rich = [{ ...svc({ attention: "now" }), extra: 7 }];
  assert.equal(partitionBoard(rich).now[0]?.extra, 7);
});

test("uptimeDays — passes the server's order through; a down day keeps its own cell", () => {
  const uptime = Array.from({ length: 30 }, (_, i) => ({
    day: `2026-07-${String(i + 1).padStart(2, "0")}`,
    state: i === 21 ? ("down" as const) : ("ok" as const),
  }));
  const days = uptimeDays(svc({ uptime }));
  assert.equal(days.length, 30);
  assert.deepEqual(days[21], { day: "2026-07-22", state: "down" });
  assert.deepEqual(
    days.flatMap((d, i) => (d.state === "down" ? [i] : [])),
    [21],
  );
  assert.deepEqual(days, uptime);
});

function many(now: number, recent: number, clear: number): ReliabilityServiceView[] {
  const out: ReliabilityServiceView[] = [];
  const add = (n: number, attention: ReliabilityServiceView["attention"], tag: string) => {
    for (let i = 0; i < n; i++) out.push(svc({ appId: `${tag}${i}`, attention }));
  };
  add(clear, "none", "c");
  add(recent, "recent", "r");
  add(now, "now", "n");
  return out;
}

test("displayBoard — compact caps attention at 3 with `now` first and true hidden counts", () => {
  const d = displayBoard(many(2, 3, 4), { compact: true });
  assert.deepEqual(
    d.shownNow.map((s) => s.appId),
    ["n0", "n1"],
  );
  assert.deepEqual(
    d.shownRecent.map((s) => s.appId),
    ["r0"],
  );
  assert.equal(d.attentionCount, 5);
  assert.equal(d.hiddenAttentionCount, 2);
  assert.equal(d.shownTable.length, 5);
  assert.equal(d.hiddenTableCount, 4);
  const many4 = displayBoard(many(4, 0, 0), { compact: true });
  assert.equal(many4.shownNow.length, 3);
  assert.equal(many4.hiddenAttentionCount, 1);
});

test("displayBoard — compact table honours `limit`", () => {
  const d = displayBoard(many(0, 0, 9), { compact: true, limit: 2 });
  assert.equal(d.shownTable.length, 2);
  assert.equal(d.hiddenTableCount, 7);
});

test("displayBoard — full board is uncapped", () => {
  const d = displayBoard(many(5, 5, 5));
  assert.equal(d.shownNow.length, 5);
  assert.equal(d.shownRecent.length, 5);
  assert.equal(d.hiddenAttentionCount, 0);
  assert.equal(d.shownTable.length, 15);
  assert.equal(d.hiddenTableCount, 0);
  assert.equal(displayBoard(many(5, 5, 5), { limit: 1 }).shownTable.length, 15);
});
