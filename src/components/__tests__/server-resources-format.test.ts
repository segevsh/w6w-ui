// Run (from packages/ui):
//   NODE_OPTIONS=--experimental-strip-types node --import ./src/test-jsx-loader.mjs \
//     --test src/components/__tests__/server-resources-format.test.ts
//
// Pure module — no DOM needed, so this file is a plain `node:test` suite over
// the helpers' pinned vectors. Every number below was measured by running the
// formulas, not chosen to match the implementation.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServerResourceSample } from "../server-resources-format.ts";

const { formatBytes, formatPercent, cpuLoadFraction, memoryUsedFraction, sparklinePoints } =
  await import("../server-resources-format.ts");

/** A sample with every field unknown unless the case overrides it. */
function sample(overrides: Partial<ServerResourceSample> = {}): ServerResourceSample {
  return {
    ts: "2026-09-29T00:00:00.000Z",
    cpus: null,
    cpuLimit: null,
    load1: null,
    load5: null,
    load15: null,
    memoryTotal: null,
    memoryAvailable: null,
    memoryLimit: null,
    processRss: null,
    processHeapUsed: null,
    processHeapTotal: null,
    ...overrides,
  };
}

test("F1 — formatBytes: exact bytes below 1 KiB, one decimal per magnitude above", () => {
  assert.equal(formatBytes(null), "—");
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1023), "1023 B");
  assert.equal(formatBytes(1024), "1.0 KiB");
  assert.equal(formatBytes(1536), "1.5 KiB");
  assert.equal(formatBytes(16_777_216_000), "15.6 GiB");
  assert.equal(formatBytes(5 * 1024 ** 4), "5.0 TiB");
});

test("F2 — formatPercent: whole percent, never clamped", () => {
  assert.equal(formatPercent(null), "—");
  assert.equal(formatPercent(0), "0%");
  assert.equal(formatPercent(0.123), "12%");
  assert.equal(formatPercent(0.5), "50%");
  assert.equal(formatPercent(1.345), "135%");
});

test("F3 — cpuLoadFraction: load1 against cpuLimit, else cpus", () => {
  assert.equal(cpuLoadFraction(sample({ load1: 0.5, cpus: 8, cpuLimit: 2 })), 0.25);
  assert.equal(cpuLoadFraction(sample({ load1: 0.5, cpus: 8, cpuLimit: null })), 0.0625);
  assert.equal(cpuLoadFraction(sample({ load1: null, cpus: 8, cpuLimit: 2 })), null);
  assert.equal(cpuLoadFraction(sample({ load1: 0.5, cpus: 0, cpuLimit: null })), null);
  // An absent sample (an empty series) is not "0% busy" — it is unmeasured.
  assert.equal(cpuLoadFraction(undefined), null);
});

test("F4 — memoryUsedFraction: (total − available) / total", () => {
  assert.equal(memoryUsedFraction(sample({ memoryTotal: 16000, memoryAvailable: 4000 })), 0.75);
  assert.equal(memoryUsedFraction(sample({ memoryTotal: 0, memoryAvailable: 0 })), null);
  assert.equal(memoryUsedFraction(sample({ memoryTotal: 16000, memoryAvailable: null })), null);
  assert.equal(memoryUsedFraction(undefined), null);
});

test("F5 — sparklinePoints: positional x, inverted scaled y, two decimals", () => {
  assert.equal(sparklinePoints([0, 0.5, 1], 100, 20, 1), "0,20 50,10 100,0");
  assert.equal(sparklinePoints([null, 0.25, 2], 60, 10, 1), "30,7.5 60,0");
  // A single point is not a line.
  assert.equal(sparklinePoints([5], 100, 20, 1), "");
  assert.equal(sparklinePoints([], 100, 20, 1), "");
});

test("F6 — sparklinePoints: nulls are skipped but still advance the x axis", () => {
  assert.equal(sparklinePoints([1, null, 0], 100, 10, 1), "0,0 100,10");
});

test("F7 — sparklinePoints: values are clamped, and max ≤ 0 flattens to the baseline", () => {
  assert.equal(sparklinePoints([-3, 99], 10, 10, 1), "0,10 10,0");
  assert.equal(sparklinePoints([0, 1], 10, 10, 0), "0,10 10,10");
});
