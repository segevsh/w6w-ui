import { type ReactNode, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { deriveCategories, matchesCategories } from "./app-categories.ts";
import {
  type AppsPageQuery,
  appsPageReducer,
  excludeInternalApps,
  initialAppsPageState,
} from "./app-pages.ts";
import { AppIcon } from "./components/AppIcon.tsx";
import { useW6WApi } from "./provider.tsx";
import type { AppSummary, ThemeMode } from "./types.ts";

/**
 * Category-filter chip row collapse budget (D-1a: "collapsed to a fixed
 * count budget with a `+N more` toggle", "≈2 rows"). An implementation
 * constant, not part of the public API.
 */
const CHIP_VISIBLE_BUDGET = 8;

/**
 * Default bounded page size for the paged loading path (T2.1.1 A2: "Apps/AI
 * request one page (limit at most 60)"). Also the default for any other
 * paged-mode caller of this component that does not override `pageLimit`.
 */
const DEFAULT_PAGE_LIMIT = 60;

/** How long to wait after the last keystroke before firing a server search. */
const SEARCH_DEBOUNCE_MS = 300;

export interface AppPickerProps {
  /** Fired when the user picks an app card. */
  onSelectApp: (app: AppSummary) => void;
  theme?: ThemeMode;
  /** Optional pre-filter over the app list (e.g. only connectable apps). Applied CLIENT-side, on top of whatever page/list was fetched — never widens a fetch, only narrows what's shown. */
  filter?: (app: AppSummary) => boolean;
  /** Search-box placeholder. Defaults to "Search apps…". */
  searchPlaceholder?: string;
  /** Message shown when the (filtered) app list is empty. */
  emptyMessage?: string;
  /** Render the search input. Defaults to `true`; the connected-apps list opts out. */
  search?: boolean;
  /** Rendered beneath `emptyMessage` in the empty state (e.g. a "Browse all apps" button). */
  emptyAction?: ReactNode;
  /**
   * Supply the catalog instead of letting the picker fetch it. For a caller
   * that already holds the list — and, more to the point, that decides
   * membership from fields this package's {@link AppSummary} does not carry
   * (`supportsOAuth`, `owner`): passing the decided list keeps ONE list and one
   * loading/error state, where `filter` would mean a second `listApps()` whose
   * result can disagree with the caller's. `null` is "still loading" and
   * renders the same placeholder the internal fetch does. Supplying a list
   * (including `null`) always suppresses BOTH the legacy eager fetch and the
   * bounded paged fetch below.
   */
  apps?: AppSummary[] | null;
  /**
   * Render an opt-in category-filter chip row, derived from the VISIBLE
   * catalog's own `categories` values (never the full RFC vocabulary — see
   * `app-categories.ts`). Defaults to `false`. Only {@link AddConnectionModal}
   * turns this on today — both `StepBuilderModal` picker call sites already
   * narrow their catalog through `filter`, so a second filter layer there
   * would be redundant.
   */
  categoryFilter?: boolean;
  /**
   * Server-side `category` param for the bounded paged fetch (e.g. `"ai"` for
   * the AI tab) — sent to `W6WApi.listAppsPage`, never applied client-side.
   * Ignored when `apps` is supplied or the host has no `listAppsPage`.
   */
  category?: string;
  /** Bounded page size for the paged fetch. Defaults to {@link DEFAULT_PAGE_LIMIT} (60). */
  pageLimit?: number;
}

/**
 * Searchable grid of app cards (icon + name + id + version) — the shared app picker used
 * by both the step builder and the add-connection modal.
 *
 * **Three loading modes**, chosen automatically and mutually exclusive:
 *
 * 1. `apps` supplied (including `null`) — the caller owns loading; this
 *    component only renders.
 * 2. `apps` omitted and the host implements `W6WApi.listAppsPage` — bounded
 *    server-paged loading: one page per search/category, explicit
 *    "Load more", debounced search, cancellation on query change/unmount
 *    (T2.1.1 A2). This is the path every current call site in this package
 *    reaches once its host wires the optional method.
 * 3. `apps` omitted and the host has ONLY the legacy `W6WApi.listApps` —
 *    unchanged eager full-catalog fetch, preserved byte-for-byte for
 *    backward compatibility with an older/imported provider (C6).
 */
export function AppPicker({
  onSelectApp,
  theme,
  filter,
  searchPlaceholder,
  emptyMessage,
  search = true,
  emptyAction,
  apps: providedApps,
  categoryFilter = false,
  category,
  pageLimit = DEFAULT_PAGE_LIMIT,
}: AppPickerProps) {
  const api = useW6WApi();
  // `undefined` means "not supplied" — a supplied `null` is a caller whose own
  // fetch has not resolved yet, which must NOT start a second one.
  const supplied = providedApps !== undefined;
  // Capability detection is `typeof === "function"` ONLY — never inferred
  // from a runtime response shape. A response this component cannot use (not
  // an array of apps), on a first page or a load-more alike, is a retryable
  // safe error (A6), never evidence that the optional method "isn't really
  // implemented": that conflation previously let one transiently-malformed
  // response permanently and silently revert a genuinely bounded host to the
  // unbounded `listApps()` for the rest of the component's lifetime, tainting
  // every tab sharing this mounted instance (T2.1.1 ROUND 2). A host that
  // truly lacks `listAppsPage` must answer `undefined` for it, not a callable
  // stub that returns the wrong shape — see the fixed test fixtures this
  // package's own suites now use (`StepBuilderModal.connection-only/
  // homepage-tabs/template-node.test.ts`) rather than working around a
  // stub's shape in production semantics.
  const paged = !supplied && typeof api.listAppsPage === "function";

  // ── Mode 3: legacy eager full-catalog fetch (unchanged, plus the fallback above) ──
  const [fetchedApps, setFetchedApps] = useState<AppSummary[] | null>(null);
  const [legacyError, setLegacyError] = useState<string | null>(null);

  useEffect(() => {
    if (supplied || paged) return;
    let canceled = false;
    api
      .listApps()
      .then((r) => !canceled && setFetchedApps(r))
      .catch((e) => !canceled && setLegacyError((e as Error).message));
    return () => {
      canceled = true;
    };
  }, [api, supplied, paged]);

  // ── Mode 2: bounded paged fetch ────────────────────────────────────────────
  const [pageState, dispatch] = useReducer(
    appsPageReducer,
    initialAppsPageState({ q: "", category }, 0),
  );
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // Mirrors `pageState.generation` synchronously — an async `.then`/`.catch`
  // callback closes over the generation IT was issued with, and compares
  // against this ref (not the React state, which the callback's own closure
  // cannot see update) to decide whether its own result is still wanted.
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    (query: AppsPageQuery, generation: number, cursor: string | undefined) => {
      const listAppsPage = api.listAppsPage;
      if (!listAppsPage) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      listAppsPage({
        q: query.q || undefined,
        category: query.category,
        cursor,
        limit: pageLimit,
        compact: true,
        signal: controller.signal,
      })
        .then((page) => {
          if (generationRef.current !== generation) return; // stale: a newer query/unmount won
          if (!page || !Array.isArray((page as { apps?: unknown }).apps)) {
            // A6: a malformed envelope — first page or "load more" alike — is
            // always a safe, retryable error, never a crash and never treated
            // as proof the optional method "isn't really implemented" (that
            // capability question is `typeof api.listAppsPage === "function"`
            // alone, checked once above `paged`'s definition). Already-shown
            // apps (if any) are preserved.
            dispatch({
              type: "page-failed",
              generation,
              error: "The server returned a malformed apps page.",
            });
            return;
          }
          dispatch({
            type: "page-loaded",
            generation,
            apps: page.apps,
            nextCursor: page.nextCursor,
            requestedCursor: cursor,
          });
        })
        .catch((e: unknown) => {
          if (generationRef.current !== generation) return;
          // Our own cancellation (query change / unmount) — not a user-facing
          // error; the newer request (or nothing, on unmount) owns the state.
          if (e instanceof Error && e.name === "AbortError") return;
          dispatch({ type: "page-failed", generation, error: (e as Error).message });
        });
    },
    [api, pageLimit],
  );

  // Debounce the search box; cancelled on every keystroke and on unmount.
  useEffect(() => {
    if (!paged) return;
    const t = setTimeout(() => setDebouncedQuery(inputValue.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [inputValue, paged]);

  // A new debounced query or a new `category` (e.g. the AI tab reusing this
  // same mounted component after Apps→AI) starts a fresh bounded fetch and
  // aborts whatever the previous one was still waiting on.
  useEffect(() => {
    if (!paged) return;
    const generation = ++generationRef.current;
    const query: AppsPageQuery = { q: debouncedQuery, category };
    dispatch({ type: "query-changed", query, generation });
    fetchPage(query, generation, undefined);
    return () => {
      abortRef.current?.abort();
    };
  }, [paged, debouncedQuery, category, fetchPage]);

  // Abort any still-pending request when the component itself unmounts (tab
  // switch away, modal close) even if no new query/category fired above.
  useEffect(() => {
    if (!paged) return;
    return () => abortRef.current?.abort();
  }, [paged]);

  const loadMore = () => {
    if (!paged || pageState.status !== "ready" || !pageState.hasMore) return;
    const generation = generationRef.current;
    dispatch({ type: "load-more" });
    fetchPage(pageState.query, generation, pageState.cursor);
  };

  const retry = () => {
    if (!paged) return;
    fetchPage(pageState.query, generationRef.current, pageState.cursor);
  };

  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [catsExpanded, setCatsExpanded] = useState(false);

  // Single layout owner for all exits below, so the panel never resizes
  // between error/loading/empty and the loaded list — see `.w6w-apppicker-host`.
  const host = (body: ReactNode) => <div className="w6w-apppicker-host">{body}</div>;

  // ── Resolve the raw app list for the active mode ───────────────────────────
  let rawApps: AppSummary[] | null;
  let fatalError: string | null = null;
  let loadingMore = false;
  let hasMore = false;
  let pageError: string | null = null;
  // Paged-only: true while a query change (search/category, INCLUDING the
  // very first mount) has reset `apps` and is awaiting its first page. Unlike
  // the non-paged modes' one-time `rawApps === null`, this must NOT hide the
  // search box/chip row on every subsequent search — only the initial mount
  // has no shell to preserve; every later keystroke should keep the input (and
  // whatever was already on screen) interactive while the new page loads.
  let pagedInitialLoading = false;

  if (supplied) {
    rawApps = providedApps ?? null;
  } else if (paged) {
    rawApps = pageState.apps;
    pagedInitialLoading = pageState.status === "loading";
    loadingMore = pageState.status === "loading-more";
    hasMore = pageState.hasMore;
    if (pageState.status === "error") {
      if (pageState.apps.length === 0) fatalError = pageState.error ?? "Failed to load apps.";
      else pageError = pageState.error ?? "Failed to load apps.";
    }
  } else {
    rawApps = fetchedApps;
    fatalError = legacyError;
  }

  if (!paged && fatalError) return host(<div className="w6w-result w6w-error">{fatalError}</div>);
  if (!paged && rawApps === null) {
    return host(<p className="w6w-muted w6w-small">Loading apps…</p>);
  }
  rawApps ??= [];

  // Reserved `@w6w/*` pseudo-apps are added via the builder's "Controls" tab, not
  // as connectable apps — keep them out of this grid even after they register.
  const connectable = excludeInternalApps(rawApps);
  const base = filter ? connectable.filter(filter) : connectable;

  // Non-paged modes (supplied / legacy eager fetch) preserve the ORIGINAL,
  // pre-T2.1.1 behavior byte-for-byte: a truly empty candidate list is an
  // early return with no search box at all — there is nothing a search could
  // ever surface. Paged mode never takes this branch: a bounded first page
  // that filtered down to nothing may still have more pages behind a search
  // or "Load more", so the search box (and the rest of the shell) must stay
  // reachable — see the `visible.length === 0` branches below instead.
  if (!paged && base.length === 0) {
    return host(
      <div className="w6w-stack">
        <p className="w6w-muted w6w-small">
          {emptyMessage ?? "No apps registered yet. Register one from the Apps page first."}
        </p>
        {emptyAction}
      </div>,
    );
  }

  // Category chips (opt-in — P4/P6): derived from `base`, the VISIBLE
  // catalog post the `filter` prop and pre-search, never from the raw `apps`
  // fetch and never from the RFC's full slug vocabulary — a category with no
  // apps behind it here is a dead end. In paged mode this is necessarily
  // scoped to the currently-loaded page(s), not the whole catalog. Chips over
  // the collapse budget stay hidden unless already selected (P5), so toggling
  // a selection never makes its own chip disappear.
  const chips = categoryFilter ? deriveCategories(base) : [];
  const withinBudget = chips.slice(0, CHIP_VISIBLE_BUDGET);
  const pinnedOverflow = chips
    .slice(CHIP_VISIBLE_BUDGET)
    .filter((c) => selectedCats.includes(c.slug));
  const collapsedChips = [...withinBudget, ...pinnedOverflow];
  const hiddenChipCount = chips.length - collapsedChips.length;
  const displayedChips = catsExpanded ? chips : collapsedChips;
  const toggleCat = (slug: string) =>
    setSelectedCats((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  const clearCats = () => setSelectedCats([]);

  // Composition order (P4): the `filter` prop already ran (-> `base`); the
  // category-chip selection composes next; the search query runs last —
  // except in paged mode, where the search already happened server-side and
  // re-filtering locally on the (possibly stale, mid-debounce) input value
  // would just hide correct results for a beat.
  const catFiltered =
    categoryFilter && selectedCats.length > 0
      ? base.filter((a) => matchesCategories(a, selectedCats))
      : base;

  const sorted = paged
    ? catFiltered
    : [...catFiltered].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
      );
  // `q` drives LOCAL filtering only — empty in paged mode, since the server
  // already applied `inputValue` as its own `q` param. `searchActive` drives
  // message text and is always the user's real input, in every mode.
  const q = paged ? "" : inputValue.trim().toLowerCase();
  const searchActive = inputValue.trim().length > 0;
  const visible = q
    ? sorted.filter(
        (a) => a.displayName.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
      )
    : sorted;
  // A7: a category selection narrowed the list to nothing, distinct from the
  // search-only empty state below (and distinct from either alone: the
  // message names whichever of the two is actually active).
  const categoryEmpty = categoryFilter && selectedCats.length > 0 && visible.length === 0;

  return host(
    <div className="w6w-stepbuilder-apps">
      {search && (
        <input
          type="text"
          className="w6w-stepbuilder-search"
          placeholder={searchPlaceholder ?? "Search apps…"}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          aria-label="Search apps"
        />
      )}
      {categoryFilter && chips.length > 0 && (
        <div className="w6w-apppicker-cats">
          {displayedChips.map((c) => (
            <button
              key={c.slug}
              type="button"
              className="w6w-apppicker-chip"
              aria-pressed={selectedCats.includes(c.slug)}
              aria-label={`Filter by ${c.label}`}
              onClick={() => toggleCat(c.slug)}
            >
              {c.label} <span className="w6w-muted">({c.count})</span>
            </button>
          ))}
          {!catsExpanded && hiddenChipCount > 0 && (
            <button
              type="button"
              className="w6w-btn w6w-btn-ghost w6w-btn-sm"
              onClick={() => setCatsExpanded(true)}
            >
              +{hiddenChipCount} more
            </button>
          )}
          {catsExpanded && chips.length > CHIP_VISIBLE_BUDGET && (
            <button
              type="button"
              className="w6w-btn w6w-btn-ghost w6w-btn-sm"
              onClick={() => setCatsExpanded(false)}
            >
              Show less
            </button>
          )}
          {selectedCats.length > 0 && (
            <button type="button" className="w6w-btn w6w-btn-ghost w6w-btn-sm" onClick={clearCats}>
              Clear
            </button>
          )}
        </div>
      )}
      {paged && pagedInitialLoading ? (
        <p className="w6w-muted w6w-small">Loading apps…</p>
      ) : paged && fatalError ? (
        <div className="w6w-result w6w-error">
          {fatalError}{" "}
          <button type="button" className="w6w-btn w6w-btn-ghost w6w-btn-sm" onClick={retry}>
            Retry
          </button>
        </div>
      ) : visible.length === 0 && !hasMore ? (
        categoryEmpty ? (
          <div className="w6w-stack">
            <p className="w6w-muted w6w-small">
              {searchActive
                ? `No apps match “${inputValue}” in the selected categories.`
                : "No apps match the selected categories."}
            </p>
            <button
              type="button"
              className="w6w-btn w6w-btn-ghost w6w-btn-sm"
              onClick={() => {
                setSelectedCats([]);
                setInputValue("");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : !paged ? (
          // Original, unchanged text: reachable here only with a non-empty
          // query (an empty-query empty result was already handled by the
          // `base.length === 0` early return above, for this non-paged path).
          <p className="w6w-muted w6w-small">No apps match “{inputValue}”.</p>
        ) : (
          <div className="w6w-stack">
            <p className="w6w-muted w6w-small">
              {searchActive
                ? `No apps match “${inputValue}”.`
                : (emptyMessage ??
                  "No apps registered yet. Register one from the Apps page first.")}
            </p>
            {!searchActive && emptyAction}
          </div>
        )
      ) : (
        <>
          {visible.length === 0 && hasMore ? (
            // A page loaded but every entry was filtered out client-side
            // (internal/rejected/non-trigger/etc.) — never auto-drain the
            // next page to fill this in; the user's own "Load more" click is
            // the only thing allowed to fetch further.
            <p className="w6w-muted w6w-small">
              No matching apps on this page yet — try “Load more”.
            </p>
          ) : (
            <div className="w6w-stepbuilder-list w6w-apppicker-grid w6w-stepbuilder-scroll">
              {visible.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="w6w-stepbuilder-item w6w-apppicker-card"
                  onClick={() => onSelectApp(a)}
                >
                  <AppIcon
                    src={a.iconSvg}
                    srcDark={a.iconSvgDark}
                    brandColor={a.brandColor}
                    name={a.displayName}
                    theme={theme}
                    size={24}
                  />
                  <span className="w6w-stepbuilder-item-main">
                    <strong>{a.displayName}</strong>
                    {/* The id is secondary metadata under the NAME, and it is the one
                        field on this card with no length bound (`vendor-app-…`, a
                        `@`-scoped id, a long slug), so it truncates rather than
                        widening the card or wrapping to a second line — the tile's
                        geometry is fixed by the grid, not by its longest id. */}
                    <code className="w6w-apppicker-card-id">{a.id}</code>
                    {a.version && <span className="w6w-apppicker-card-version">v{a.version}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
          {paged && pageError && (
            <div className="w6w-result w6w-error w6w-small">
              {pageError}{" "}
              <button type="button" className="w6w-btn w6w-btn-ghost w6w-btn-sm" onClick={retry}>
                Retry
              </button>
            </div>
          )}
          {paged && hasMore && !pageError && (
            <button
              type="button"
              className="w6w-btn w6w-btn-ghost w6w-btn-sm w6w-apppicker-load-more"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading more…" : "Load more"}
            </button>
          )}
        </>
      )}
    </div>,
  );
}
