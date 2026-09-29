/**
 * Deterministic sample fixture for the server-resources stories and tests.
 *
 * It lives in its own module — mirroring `.storybook/fixtures.ts`'s role —
 * because three of the four variants' stories and the component test all want
 * the same "60 samples of a plausible, busy host" series, and a per-story copy
 * would drift.
 *
 * DETERMINISTIC BY CONSTRUCTION: the series is a sum of sines over the sample
 * index and the timestamps step from a fixed epoch. No `Math.random`, no
 * `Date.now` — a story's rendering must not change between builds, and a test
 * that asserted a coordinate against it would be worthless if it could.
 */
import type { ServerResourceSample } from "./server-resources-format.ts";

/** The server's default cadence, mirrored so the timestamps read realistically. */
const SAMPLE_INTERVAL_MS = 5000;
/** 2026-09-29T00:00:00Z — an arbitrary fixed instant, not "now". */
const BASE_TS_MS = Date.UTC(2026, 8, 29, 0, 0, 0);

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

/**
 * `count` samples, oldest first, of a host with 8 CPUs under a 2-CPU cgroup
 * limit and 16 GiB of RAM — so the CPU fraction is a fraction of the LIMIT
 * (load ≈ 0.5 of a 2-CPU budget reads ~25%) and the memory fraction moves
 * around 55%. Every series is non-flat, which is the point: a sparkline over a
 * constant is a straight line and proves nothing in a story.
 */
export function demoServerResourceSamples(count = 60): ServerResourceSample[] {
  const samples: ServerResourceSample[] = [];

  for (let i = 0; i < count; i++) {
    /** Slow, wide drift — shared by all three load averages. */
    const drift = Math.sin(i / 23) * 0.5;
    const memoryTotal = 16 * GIB;
    const memoryUsed = Math.min(0.9, 0.55 + Math.sin(i / 9) * 0.12);
    const processRss = (72 + Math.sin(i / 5) * 9) * MIB;
    const heapUsed = (38 + Math.sin(i / 4 + 1) * 5) * MIB;

    samples.push({
      ts: new Date(BASE_TS_MS + i * SAMPLE_INTERVAL_MS).toISOString(),
      cpus: 8,
      cpuLimit: 2,
      load1: Number((0.9 + Math.sin(i / 6) * 0.7 + drift).toFixed(2)),
      load5: Number((0.8 + Math.sin((i - 3) / 6) * 0.5 + drift).toFixed(2)),
      load15: Number((0.7 + Math.sin((i - 8) / 6) * 0.35 + drift).toFixed(2)),
      memoryTotal,
      memoryAvailable: Math.round(memoryTotal * (1 - memoryUsed)),
      memoryLimit: memoryTotal,
      processRss: Math.round(processRss),
      processHeapUsed: Math.round(heapUsed),
      processHeapTotal: Math.round(heapUsed * 1.4),
    });
  }

  return samples;
}
