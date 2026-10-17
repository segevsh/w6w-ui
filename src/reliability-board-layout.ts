/**
 * How the reliability board arranges itself — the decisions that are arithmetic
 * rather than markup, kept pure (no React, no DOM) so they test without a DOM
 * and so `@w6w/embed` can import them beside the components.
 *
 * **None of these decide a STATE.** Every state read below arrived already
 * decided by the server; nothing here compares a ratio, applies a threshold to
 * call data, or invents a fifth word. What these decide is where a row is PUT,
 * which is presentation.
 */

/** The four words the server uses for a health verdict. */
export type ReliabilityViewState = "ok" | "degraded" | "down" | "unknown";

/**
 * The row shape the reliability components render — owned by `@w6w/ui` so it
 * imports nothing from the SDK. The SDK's `ReliabilityService` assigns to it
 * structurally; the generic functions below keep the caller's richer row type.
 */
export interface ReliabilityServiceView {
  appId: string;
  displayName: string;
  /** Inline icon fields — the board never asks a catalog for them. */
  iconSrc?: string;
  iconSrcDark?: string;
  brandColor?: string;
  /** "Did YOUR calls succeed". */
  state: ReliabilityViewState;
  calls: number;
  errors: { e4xx: number; e429: number; eAuth: number; e5xx: number };
  p95Ms: number | null;
  ongoingOutageId: string | null;
  /** One entry per calendar day, oldest first, exactly as the server sent it. */
  uptime: readonly { day: string; state: ReliabilityViewState }[];
  /** "What does the vendor say about itself"; `null` when no public check exists. */
  vendorStatus: { state: ReliabilityViewState; message: string | null } | null;
  /** The server's tier for the row — read, never re-derived. */
  attention: "now" | "recent" | "none";
}

/** One point of the performance scatter — a service with both a call volume and a measured p95. */
export interface PerformancePoint {
  appId: string;
  displayName: string;
  calls: number;
  p95Ms: number;
  state: ReliabilityViewState;
  /** Total errors across all four kinds — drives the point's size, not its position. */
  errorCount: number;
}

/**
 * Every service with at least one timed call, as a (calls, p95) point — what
 * the performance chart plots. Excludes `p95Ms: null`: there is no Y position
 * for a service with nothing timed.
 */
export function performancePoints(services: readonly ReliabilityServiceView[]): PerformancePoint[] {
  const points: PerformancePoint[] = [];
  for (const s of services) {
    if (s.p95Ms === null) continue;
    points.push({
      appId: s.appId,
      displayName: s.displayName,
      calls: s.calls,
      p95Ms: s.p95Ms,
      state: s.state,
      errorCount: s.errors.e4xx + s.errors.e429 + s.errors.eAuth + s.errors.e5xx,
    });
  }
  return points;
}

/**
 * Does this service want the reader's attention? READS the tier the server
 * sent (`attention`), never re-derives it from `state` or `vendorStatus`: the
 * server's `boardRank` is the one implementation, and a second copy here would
 * drift. `now` and `recent` both count; they differ in tense only.
 */
export function needsAttention(service: Pick<ReliabilityServiceView, "attention">): boolean {
  return service.attention === "now" || service.attention === "recent";
}

/** The board in its three groups, each keeping the server's own ordering. */
export interface BoardPartition<T extends ReliabilityServiceView = ReliabilityServiceView> {
  /** Broken right now, on either signal. */
  now: T[];
  /** Clear now, but this window holds a failed stretch or an open advisory. */
  recent: T[];
  /** Everything else, in the server's recency order. */
  clear: T[];
}

/**
 * Group the board without reordering within any group. Bucketing is not
 * sorting: each group comes out in the order it arrived. An unrecognised
 * `attention` value falls to `clear` rather than throwing — a client can be
 * older than the server that answered it.
 */
export function partitionBoard<T extends ReliabilityServiceView>(
  services: readonly T[],
): BoardPartition<T> {
  const groups: BoardPartition<T> = { now: [], recent: [], clear: [] };
  for (const s of services) {
    if (s.attention === "now") groups.now.push(s);
    else if (s.attention === "recent") groups.recent.push(s);
    else groups.clear.push(s);
  }
  return groups;
}

/**
 * The uptime strip's cells for one service — the server's own array, in the
 * order it arrived (oldest first). A passthrough on purpose: no sort, no
 * reverse, no gap filling. The strip has no date axis, so a reversed array is
 * visually plausible and would silently move an outage to the wrong end.
 */
export function uptimeDays(service: Pick<ReliabilityServiceView, "uptime">): {
  day: string;
  state: ReliabilityViewState;
}[] {
  return service.uptime.map((entry) => ({ day: entry.day, state: entry.state }));
}

/** Compact mode shows at most this many needs-attention cards, `now` filling first. */
export const ATTENTION_DISPLAY_CAP = 3;
/** Compact mode shows this many table rows unless the caller passes `limit`. */
export const RECENT_DISPLAY_CAP = 5;

/** What the board shows and what a display cap hid. */
export interface BoardDisplay<T extends ReliabilityServiceView = ReliabilityServiceView> {
  /** TRUE total of attention rows (the whole input, not the capped slice). */
  attentionCount: number;
  shownNow: T[];
  shownRecent: T[];
  hiddenAttentionCount: number;
  /** Table rows in the server's order, every attention tier included. */
  shownTable: T[];
  hiddenTableCount: number;
}

/**
 * Apply the display caps to the complete board. Compact: ≤ 3 attention cards
 * (`now` first, `recent` tops up) and `limit ?? 5` table rows; otherwise
 * uncapped. Hidden counts are computed from the full input, so they are real.
 */
export function displayBoard<T extends ReliabilityServiceView>(
  services: readonly T[],
  opts: { compact?: boolean; limit?: number } = {},
): BoardDisplay<T> {
  const compact = opts.compact ?? false;
  const { now, recent } = partitionBoard(services);
  const attentionCount = now.length + recent.length;
  const shownNow = compact ? now.slice(0, ATTENTION_DISPLAY_CAP) : now;
  const shownRecent = compact
    ? recent.slice(0, Math.max(0, ATTENTION_DISPLAY_CAP - shownNow.length))
    : recent;
  const shownTable = compact ? services.slice(0, opts.limit ?? RECENT_DISPLAY_CAP) : [...services];
  return {
    attentionCount,
    shownNow,
    shownRecent,
    hiddenAttentionCount: attentionCount - shownNow.length - shownRecent.length,
    shownTable,
    hiddenTableCount: services.length - shownTable.length,
  };
}
