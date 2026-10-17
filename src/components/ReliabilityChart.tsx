import type { ReactElement, MouseEvent as ReactMouseEvent } from "react";
import { type ReliabilityServiceView, performancePoints } from "../reliability-board-layout.ts";

/**
 * The performance chart — call volume × p95 latency, one point per API. One
 * axis never tells the whole story: a slow service nobody calls much matters
 * less than a slow service taking most of the traffic, so this is a real 2-axis
 * scatter, not a bar-per-app list.
 *
 * Ring colour carries exec status via the `--w6w-health-*` tokens (same as the
 * table's pills) and dot size carries the error count. Rows arrive with every
 * field they need; the chart makes no request.
 *
 * Navigation is the host's: with `getHref` each point is a real SVG `<a href>`;
 * a click calls `onOpen(appId, event)` and is never `preventDefault`ed here.
 * Neither given ⇒ points are not links.
 *
 * A fixed `viewBox` with a matching CSS `aspect-ratio` keeps points circular.
 * The y-axis runs INVERTED — 0ms at the top, the max at the bottom — so "up"
 * reads as "better" the same way "right" (more calls) does: the top-right
 * corner is fast AND heavily used.
 */
const WIDTH = 640;
const HEIGHT = 340;
const PAD = { top: 16, right: 24, bottom: 40, left: 56 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 5, 10];
  for (const step of steps) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

function ticks(max: number, count = 5): number[] {
  return Array.from({ length: count + 1 }, (_, i) => Math.round((max * i) / count));
}

export interface ReliabilityChartProps<T extends ReliabilityServiceView = ReliabilityServiceView> {
  services: readonly T[];
  /** Real `<a href>` on each point when given. */
  getHref?: (appId: string) => string;
  /** Called on a point click; the host decides whether to `preventDefault`. */
  onOpen?: (appId: string, event: ReactMouseEvent<Element>) => void;
}

export function ReliabilityChart<T extends ReliabilityServiceView>({
  services,
  getHref,
  onOpen,
}: ReliabilityChartProps<T>): ReactElement {
  const points = performancePoints(services);

  if (points.length === 0) {
    return <p className="w6w-muted w6w-small">No timed calls in this window yet.</p>;
  }

  const maxCalls = niceMax(Math.max(...points.map((p) => p.calls)));
  const maxP95 = niceMax(Math.max(...points.map((p) => p.p95Ms)));
  const maxErrors = Math.max(1, ...points.map((p) => p.errorCount));

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (calls: number) => PAD.left + (calls / maxCalls) * plotW;
  // Inverted on purpose — lower p95 (faster) sits HIGHER on the plot.
  const y = (p95: number) => PAD.top + (p95 / maxP95) * plotH;
  // 16px..30px icon diameter, scaled by error share.
  const iconSize = (errors: number) => 16 + (errors / maxErrors) * 14;

  const xTicks = ticks(maxCalls);
  const yTicks = ticks(maxP95);
  const yAxisTitleX = 18;
  const yAxisTitleY = PAD.top + plotH / 2;

  return (
    <div className="w6w-rel-scatter">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        role="img"
        aria-label="API performance: calls versus p95 latency, one point per API"
      >
        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          className="w6w-rel-scatter-plot-bg"
        />

        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="w6w-rel-scatter-grid"
            />
            <text x={PAD.left - 8} y={y(t)} className="w6w-rel-scatter-axis-label" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={`x-${t}`}
            x={x(t)}
            y={HEIGHT - PAD.bottom + 18}
            className="w6w-rel-scatter-axis-label"
            textAnchor="middle"
          >
            {t}
          </text>
        ))}

        {/* Anchored on its own pivot so the rotation never leaves the viewBox. */}
        <text
          x={yAxisTitleX}
          y={yAxisTitleY}
          className="w6w-rel-scatter-axis-title"
          textAnchor="middle"
          transform={`rotate(-90, ${yAxisTitleX}, ${yAxisTitleY})`}
        >
          p95 (ms)
        </text>
        <text
          x={PAD.left + plotW / 2}
          y={HEIGHT - 4}
          className="w6w-rel-scatter-axis-title"
          textAnchor="middle"
        >
          calls in this window
        </text>

        {points.map((p) => {
          const size = iconSize(p.errorCount);
          const cx = x(p.calls);
          const cy = y(p.p95Ms);
          const dots = (
            <>
              <circle
                cx={cx}
                cy={cy}
                r={size / 2 + 2.5}
                className={`w6w-rel-scatter-ring w6w-rel-scatter-ring-${p.state}`}
              >
                <title>
                  {p.displayName} — {p.calls} calls, {p.p95Ms} ms p95, {p.errorCount} errors
                </title>
              </circle>
              <circle
                cx={cx}
                cy={cy}
                r={size / 2}
                className={`w6w-rel-scatter-point w6w-rel-scatter-point-${p.state}`}
              />
            </>
          );
          if (getHref) {
            return (
              <a
                key={p.appId}
                href={getHref(p.appId)}
                className="w6w-rel-scatter-point-link"
                onClick={onOpen ? (e) => onOpen(p.appId, e) : undefined}
              >
                {dots}
              </a>
            );
          }
          if (onOpen) {
            return (
              <g
                key={p.appId}
                // biome-ignore lint/a11y/useSemanticElements: an SVG group cannot be a <button>
                role="button"
                tabIndex={0}
                className="w6w-rel-scatter-point-link"
                onClick={(e) => onOpen(p.appId, e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    (e.currentTarget as unknown as HTMLElement).dispatchEvent(
                      new MouseEvent("click", { bubbles: true }),
                    );
                  }
                }}
              >
                {dots}
              </g>
            );
          }
          return <g key={p.appId}>{dots}</g>;
        })}
      </svg>
      <p className="w6w-muted w6w-small w6w-rel-scatter-note">
        Up is faster, right is more calls — top-right is the best outcome. Icon size is the error
        count in this window; ring colour is exec status.
      </p>
    </div>
  );
}
