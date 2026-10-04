/**
 * The server-resources display family — four PURE PRESENTATIONAL variants over
 * the same array of samples: a large card, a small card, a left-rail strip and
 * a header badge.
 *
 * There is no data layer here, on purpose (plan.md §Pinned decisions: "no
 * transport in ui"): every variant is handed `samples` and renders the LAST
 * one, plus a sparkline drawn from the whole array. Nothing in this file reads
 * a network, a context or a host API — the caller owns the stream and the
 * operator gate.
 *
 * The sparkline is hand-rolled inline SVG rather than a chart dependency: a
 * polyline over ~60 points is a dozen lines of arithmetic (see
 * `sparklinePoints`), and `@w6w/ui` carrying recharts or d3 for it would be
 * unjustified weight for every consumer (D-5).
 *
 * An unknown value is never rendered as `0` — it is the em dash `formatBytes` /
 * `formatPercent` return for `null`. An unreported CPU reading must not read as
 * an idle node. The same applies to `samples: []`: every variant still renders
 * (all dashes, no line), so a caller never has to branch before mounting.
 */
import {
  type ServerResourceSample,
  cpuLoadFraction,
  formatBytes,
  formatPercent,
  memoryUsedFraction,
  sparklinePoints,
} from "./server-resources-format.ts";

export interface ServerResourcesProps {
  /**
   * The samples to render, oldest first. The LAST entry is the current reading;
   * the whole array is the sparkline's series. May be empty — then every value
   * reads `—` and no line is drawn.
   */
  samples: readonly ServerResourceSample[];
}

export interface ServerResourcesCardProps extends ServerResourcesProps {
  /** Heading text. Defaults to `Server resources`. */
  title?: string;
  /** The sampler's cadence, in ms. When given, the card shows `Sampled every Ns`. */
  intervalMs?: number;
}

export interface ServerResourcesRailProps extends ServerResourcesProps {
  /**
   * When given, the rail shows one button that asks the caller to open the full
   * view. The rail never opens anything itself — mounting is the caller's job.
   */
  onExpand?: () => void;
}

/** What an unknown value renders as — the same dash the format helpers return. */
const UNKNOWN = "—";

/** Sparkline geometry. The viewBox is 100 × 24 units, scaled by CSS. */
const SPARK_WIDTH = 100;
const SPARK_HEIGHT = 24;

/** The sparkline. Deliberately NOT the shared `Icon` (`../components/Icon.tsx`):
 *  nothing here is a fixed glyph — `points` is computed from the data, the
 *  viewBox is this chart's own 100 × 24 units (scaled by CSS) rather than a
 *  24 × 24 icon box, and the stroke is the accent token, not `currentColor`. */
function Sparkline({
  values,
  max,
  className,
}: {
  values: readonly (number | null)[];
  max: number;
  className: string;
}) {
  const points = sparklinePoints(values, SPARK_WIDTH, SPARK_HEIGHT, max);
  if (points === "") return null;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--w6w-accent)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * A fraction as a two-decimal string (`0.5` → `0.50`), or `—` when unknown.
 * The fixed precision is what keeps the three load averages visually aligned.
 */
function formatLoad(n: number | null): string {
  return n === null ? UNKNOWN : n.toFixed(2);
}

/**
 * The largest value a series of fractions is drawn against — at least 1, so a
 * quiet host draws a flat-ish line near the baseline instead of amplifying
 * its own noise to a full-height sawtooth.
 */
function fractionMax(values: readonly (number | null)[]): number {
  let max = 1;
  for (const v of values) if (v !== null && v > max) max = v;
  return max;
}

/** A labelled reading plus the sparkline of its series. */
function MetricRow({
  label,
  value,
  values,
  max,
}: {
  label: string;
  value: string;
  values: readonly (number | null)[];
  max: number;
}) {
  return (
    <li className="w6w-server-resources__row">
      <span className="w6w-server-resources__label">{label}</span>
      <span className="w6w-server-resources__value">{value}</span>
      <Sparkline className="w6w-server-resources__spark" values={values} max={max} />
    </li>
  );
}

/** The one-sample readings every variant shows, computed once per render. */
function readings(samples: readonly ServerResourceSample[]) {
  const last = samples[samples.length - 1];
  const cpuValues = samples.map((s) => cpuLoadFraction(s));
  const memoryValues = samples.map((s) => memoryUsedFraction(s));
  const rssValues = samples.map((s) => s.processRss);
  return { last, cpuValues, memoryValues, rssValues };
}

/**
 * The large variant: three readings (CPU, memory, process RSS), each with its
 * own sparkline, plus the load averages and — when the caller knows it — the
 * sampling cadence. This is the Console/Modal body.
 */
export function ServerResourcesCard({
  samples,
  title = "Server resources",
  intervalMs,
}: ServerResourcesCardProps) {
  const { last, cpuValues, memoryValues, rssValues } = readings(samples);

  return (
    <section className="w6w-server-resources w6w-server-resources--card" aria-label={title}>
      <h3 className="w6w-server-resources__title">{title}</h3>
      <ul className="w6w-server-resources__rows">
        <MetricRow
          label="CPU"
          value={formatPercent(cpuLoadFraction(last))}
          values={cpuValues}
          max={fractionMax(cpuValues)}
        />
        <MetricRow
          label="Memory"
          value={formatPercent(memoryUsedFraction(last))}
          values={memoryValues}
          max={1}
        />
        <MetricRow
          label="Process"
          value={formatBytes(last?.processRss ?? null)}
          values={rssValues}
          max={fractionMax(rssValues)}
        />
      </ul>
      <p className="w6w-server-resources__meta">
        {`Load ${formatLoad(last?.load1 ?? null)} / ${formatLoad(last?.load5 ?? null)} / ${formatLoad(
          last?.load15 ?? null,
        )}`}
      </p>
      {intervalMs !== undefined && (
        <p className="w6w-server-resources__meta">{`Sampled every ${intervalMs / 1000}s`}</p>
      )}
    </section>
  );
}

/**
 * The small variant: CPU and memory only, one sparkline (CPU). For a compact
 * surface that has room for a headline and a shape, but not for a third
 * reading or the load breakdown.
 */
export function ServerResourcesCardSmall({ samples, title = "Server" }: ServerResourcesCardProps) {
  const { last, cpuValues } = readings(samples);

  return (
    <section className="w6w-server-resources w6w-server-resources--small" aria-label={title}>
      <h3 className="w6w-server-resources__title">{title}</h3>
      <ul className="w6w-server-resources__rows">
        <MetricRow
          label="CPU"
          value={formatPercent(cpuLoadFraction(last))}
          values={cpuValues}
          max={fractionMax(cpuValues)}
        />
        <li className="w6w-server-resources__row">
          <span className="w6w-server-resources__label">Memory</span>
          <span className="w6w-server-resources__value">
            {formatPercent(memoryUsedFraction(last))}
          </span>
        </li>
      </ul>
    </section>
  );
}

/**
 * The left-rail variant: a stacked CPU and MEM reading, each with a sparkline,
 * sized to fit a ~200 px column. When the caller passes `onExpand` it also
 * shows the single "show me the rest" button; without one it is read-only
 * decoration and renders no interactive element at all.
 */
export function ServerResourcesRail({ samples, onExpand }: ServerResourcesRailProps) {
  const { last, cpuValues, memoryValues } = readings(samples);

  return (
    <aside className="w6w-server-resources w6w-server-resources--rail">
      <div className="w6w-server-resources__rail-row">
        <span className="w6w-server-resources__label">CPU</span>
        <span className="w6w-server-resources__value">{formatPercent(cpuLoadFraction(last))}</span>
        <Sparkline
          className="w6w-server-resources__spark"
          values={cpuValues}
          max={fractionMax(cpuValues)}
        />
      </div>
      <div className="w6w-server-resources__rail-row">
        <span className="w6w-server-resources__label">MEM</span>
        <span className="w6w-server-resources__value">
          {formatPercent(memoryUsedFraction(last))}
        </span>
        <Sparkline className="w6w-server-resources__spark" values={memoryValues} max={1} />
      </div>
      {onExpand !== undefined && (
        <button
          type="button"
          className="w6w-server-resources__expand"
          aria-label="Show server resources"
          onClick={onExpand}
        >
          Details
        </button>
      )}
    </aside>
  );
}

/**
 * The header badge: one line, `CPU <pct> · MEM <pct>`, no sparkline (a badge is
 * a fixed-height strip of text, and a line there would be unreadable). The
 * whole string is a single text node so assistive tech reads it as one phrase.
 */
export function ServerResourcesBadge({ samples }: ServerResourcesProps) {
  const last = samples[samples.length - 1];
  const cpu = formatPercent(cpuLoadFraction(last));
  const mem = formatPercent(memoryUsedFraction(last));

  return (
    <span className="w6w-server-resources w6w-server-resources--badge">
      {`CPU ${cpu} · MEM ${mem}`}
    </span>
  );
}
