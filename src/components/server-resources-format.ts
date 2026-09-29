/**
 * Pure formatting + geometry helpers for the server-resources family, kept in
 * their own module so they carry no React and can be unit-tested on their own.
 *
 * `ServerResourceSample` is a thin LOCAL copy of the sampler's wire sample
 * (`plan.md` §Pinned wire) — the same deliberate duplication `UptimeStrip.tsx`
 * keeps of the health union, and for the same reason: it keeps `@w6w/ui` a
 * pure-presentation leaf with no transport/spec coupling, so nothing here has
 * to move when the server's payload grows a field.
 *
 * Every helper is TOTAL: an unknown number is never rendered as `0`, it is
 * rendered as an em dash. A node whose CPU reading is missing must not read as
 * an idle node.
 */

/** One sample of the host's resource usage, exactly as the server sends it. */
export interface ServerResourceSample {
  /** ISO-8601 instant the sample was taken. */
  ts: string;
  cpus: number | null;
  cpuLimit: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  memoryTotal: number | null;
  memoryAvailable: number | null;
  memoryLimit: number | null;
  processRss: number | null;
  processHeapUsed: number | null;
  processHeapTotal: number | null;
}

/** What an unknown value renders as. Never `0`, never an empty cell. */
const UNKNOWN = "—";

/** Binary magnitude suffixes, index-aligned with the 1024ᵏ divisor. */
const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

/**
 * A byte count as a short human string: exact bytes below 1 KiB (`1023 B`),
 * one decimal place per binary magnitude from KiB up (`1.5 KiB`, `15.6 GiB`).
 * `null` (nothing measured) is `—`.
 */
export function formatBytes(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return UNKNOWN;
  if (n < 1024) return `${Math.round(n)} B`;

  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

/**
 * A 0…1-ish fraction as a whole-percent string (`0.123` → `12%`). Not clamped:
 * a load above the CPU count is real and reads `135%`. `null` is `—`.
 */
export function formatPercent(f: number | null): string {
  if (f === null || !Number.isFinite(f)) return UNKNOWN;
  return `${Math.round(f * 100)}%`;
}

/**
 * `load1` against the effective CPU budget — the container's `cpuLimit` when
 * the server set one, otherwise the host CPU count. `null` when either operand
 * is unknown or the divisor is ≤ 0 (a zero-CPU budget is not "0% busy", it is
 * "not measurable").
 */
export function cpuLoadFraction(s: ServerResourceSample | undefined): number | null {
  if (s === undefined) return null;
  if (s.load1 === null) return null;
  const divisor = s.cpuLimit ?? s.cpus;
  if (divisor === null || divisor <= 0) return null;
  return s.load1 / divisor;
}

/**
 * Used memory as a fraction of total: `(memoryTotal − memoryAvailable) /
 * memoryTotal`. `null` when either operand is unknown or the total is ≤ 0.
 */
export function memoryUsedFraction(s: ServerResourceSample | undefined): number | null {
  if (s === undefined) return null;
  const { memoryTotal, memoryAvailable } = s;
  if (memoryTotal === null || memoryAvailable === null) return null;
  if (memoryTotal <= 0) return null;
  return (memoryTotal - memoryAvailable) / memoryTotal;
}

/** `v` pinned into `[lo, hi]`. */
function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  return v > hi ? hi : v;
}

/**
 * The `points` attribute of a sparkline polyline, hand-drawn — this package
 * has no chart dependency on purpose (D-5), and a polyline over ~60 samples
 * does not justify one.
 *
 * The x axis is positional (`i / (n − 1) · width`), so a gap in the series
 * still advances the line; `y` is inverted (SVG grows downward) and scaled
 * against `max`. Nulls are SKIPPED, not plotted as zero, and a series of fewer
 * than two values has no line at all (`""` — a single point is not a shape).
 * `max ≤ 0` flattens the line along the baseline rather than dividing by it.
 *
 * Every coordinate is rounded to two decimals so the attribute stays short and
 * a snapshot of it stays readable.
 */
export function sparklinePoints(
  values: readonly (number | null)[],
  width: number,
  height: number,
  max: number,
): string {
  const n = values.length;
  if (n < 2) return "";

  const points: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null) continue;
    const x = (i / (n - 1)) * width;
    const y = max <= 0 ? height : height - (clamp(v, 0, max) / max) * height;
    points.push(`${Number(x.toFixed(2))},${Number(y.toFixed(2))}`);
  }
  return points.join(" ");
}
