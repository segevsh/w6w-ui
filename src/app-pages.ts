/**
 * Pure state/normalization helpers behind the bounded app-picker paths
 * (`AppPicker`'s paged mode, `StepBuilderModal`'s Apps/AI/Triggers tabs and
 * its "Ready to use" connected-id batching). No React, no fetch, no I/O — a
 * `.ts` module so `node --test` loads it with no JSX/browser harness, per
 * this task's contract.
 *
 * Two independent state machines live here, because the two loading shapes
 * are genuinely different problems:
 *
 * - {@link AppsPageState} / {@link appsPageReducer} — ONE outstanding
 *   server-paged request at a time (search / category / "load more"),
 *   generation-guarded so a late response from an abandoned query can never
 *   overwrite a newer one.
 * - {@link nextIdBatch} / {@link mergeResolvedApps} — bounded, order-stable
 *   resolution of a fixed id LIST (connected app ids), a few ids per batch,
 *   with no cursor at all.
 */
import { isInternalApp } from "./flow-types.ts";
import type { AppSummary } from "./types.ts";

// ── Paged search/category/load-more state machine ──────────────────────────

/** The user-controlled inputs that identify a distinct page fetch. */
export interface AppsPageQuery {
  /** Trimmed search text; `""` means no search term. */
  q: string;
  /** Server-side category filter (e.g. `"ai"` for the AI tab), or absent. */
  category?: string;
}

/**
 * Two queries are the same fetch target when both fields match exactly
 * (empty-string `q` included) — used to short-circuit a reducer action that
 * would otherwise restart an identical in-flight query.
 */
export function sameAppsPageQuery(a: AppsPageQuery, b: AppsPageQuery): boolean {
  return a.q === b.q && (a.category ?? "") === (b.category ?? "");
}

export type AppsPageStatus = "loading" | "loading-more" | "ready" | "error";

export interface AppsPageState {
  query: AppsPageQuery;
  /**
   * Bumped every time the query changes (new search/category/tab). A
   * response tagged with an older generation is stale and MUST be dropped by
   * the caller before dispatching — {@link isStalePageGeneration} is the
   * check; the reducer itself also refuses a stale `page-loaded`/`page-failed`
   * defensively, so a caller that forgets the check still cannot corrupt state.
   */
  generation: number;
  status: AppsPageStatus;
  /** Every app fetched so far for the CURRENT query, in server order, deduped by id. */
  apps: AppSummary[];
  /** Cursor to send on the NEXT "load more"; absent once the server has no more pages. */
  cursor?: string;
  hasMore: boolean;
  error?: string;
}

export function initialAppsPageState(query: AppsPageQuery, generation = 0): AppsPageState {
  return { query, generation, status: "loading", apps: [], hasMore: false };
}

export type AppsPageAction =
  /** A new search/category/tab was selected — resets `apps`/`cursor` and starts a fresh fetch. */
  | { type: "query-changed"; query: AppsPageQuery; generation: number }
  /** The user asked for more results on the CURRENT query. No-op unless `status==="ready" && hasMore`. */
  | { type: "load-more" }
  /**
   * One page arrived. `requestedCursor` is the cursor that page was fetched
   * WITH (undefined for a first page) — compared against the server's own
   * `nextCursor` to catch a server that echoes back the same cursor forever
   * (a repeated/non-advancing cursor is treated as "no more pages", never
   * retried, so it can neither loop nor duplicate a request).
   */
  | {
      type: "page-loaded";
      generation: number;
      apps: AppSummary[];
      nextCursor?: string;
      requestedCursor?: string;
    }
  | { type: "page-failed"; generation: number; error: string };

/**
 * Dedupe-append: every app in `incoming` not already present (by `id`) in
 * `existing`, in `incoming`'s own order, appended after `existing`.
 * Immutable — always returns a new array, and existing entries in `existing`
 * are shared references, never mutated, so a caller that kept the old array
 * around still sees the original values (copy-safety for cache reads).
 */
export function dedupeAppend(existing: AppSummary[], incoming: AppSummary[]): AppSummary[] {
  const seen = new Set(existing.map((a) => a.id));
  const added: AppSummary[] = [];
  for (const app of incoming) {
    if (seen.has(app.id)) continue;
    seen.add(app.id);
    added.push(app);
  }
  return added.length === 0 ? existing : [...existing, ...added];
}

/**
 * The paged-picker reducer. Every transition is a pure function of
 * `(state, action)` — no timers, no fetch; the caller performs the actual
 * request and feeds the result back in as `page-loaded`/`page-failed`.
 */
export function appsPageReducer(state: AppsPageState, action: AppsPageAction): AppsPageState {
  switch (action.type) {
    case "query-changed": {
      if (action.generation === state.generation && sameAppsPageQuery(action.query, state.query)) {
        return state;
      }
      return initialAppsPageState(action.query, action.generation);
    }
    case "load-more": {
      if (state.status !== "ready" || !state.hasMore) return state;
      return { ...state, status: "loading-more" };
    }
    case "page-loaded": {
      // A late arrival from an abandoned generation is dropped outright — the
      // reducer is the last line of defense even if a caller forgot to check
      // `isStalePageGeneration` before dispatching.
      if (action.generation !== state.generation) return state;
      const apps = dedupeAppend(state.apps, action.apps);
      // A server that echoes the same cursor back (or a caller that mistakenly
      // resends the current cursor) can never advance — treat it as terminal
      // rather than retrying it, which is the one shape that would loop.
      const nonAdvancing =
        action.nextCursor !== undefined && action.nextCursor === action.requestedCursor;
      const hasMore = Boolean(action.nextCursor) && !nonAdvancing;
      return {
        ...state,
        status: "ready",
        apps,
        cursor: hasMore ? action.nextCursor : undefined,
        hasMore,
        error: undefined,
      };
    }
    case "page-failed": {
      if (action.generation !== state.generation) return state;
      // Errors keep whatever was already loaded (retry-in-place), and are
      // distinguished from "loaded zero results" by `status === "error"` plus
      // a non-empty `error`, never by an empty `apps` array alone.
      return { ...state, status: "error", error: action.error };
    }
    default:
      return state;
  }
}

/** Whether a response tagged `generation` is stale against `state` — check before dispatching. */
export function isStalePageGeneration(state: AppsPageState, generation: number): boolean {
  return generation !== state.generation;
}

/**
 * Reserved `@w6w/*` pseudo-apps are never a pickable catalog entry (mirrors
 * `AppPicker`'s existing exclusion) — factored out so the paged path and the
 * id-batch path apply the exact same rule.
 */
export function excludeInternalApps(apps: readonly AppSummary[]): AppSummary[] {
  return apps.filter((a) => !isInternalApp(a.id));
}

// ── Bounded id-batch resolution (connected/"Ready to use" apps) ────────────

/**
 * The next batch of ids to resolve: up to `batchSize` entries from `ids`,
 * preserving `ids`' own order, skipping anything already in `requested`.
 * Returns `[]` once every id has been requested — the caller's signal to stop
 * showing "load more". Never re-requests an id already in `requested`, even
 * across repeated calls with a growing `requested` set (idempotent given the
 * same two inputs).
 */
export function nextIdBatch(
  ids: readonly string[],
  requested: ReadonlySet<string>,
  batchSize: number,
): string[] {
  if (batchSize <= 0) return [];
  const batch: string[] = [];
  for (const id of ids) {
    if (requested.has(id)) continue;
    batch.push(id);
    if (batch.length >= batchSize) break;
  }
  return batch;
}

/**
 * Merge a batch of resolved summaries into the accumulated visible list,
 * preserving `ids`' overall order (not fetch-arrival order) and silently
 * dropping any id with no entry in `resolved` — the caller's contract for a
 * missing/404 id (see `useReadyToUse`'s id-batch rewrite): omitted, not shown
 * as an error.
 */
export function mergeResolvedApps(
  ids: readonly string[],
  resolved: ReadonlyMap<string, AppSummary>,
): AppSummary[] {
  const out: AppSummary[] = [];
  for (const id of ids) {
    const app = resolved.get(id);
    if (app) out.push(app);
  }
  return out;
}
