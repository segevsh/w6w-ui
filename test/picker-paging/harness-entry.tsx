// picker-paging browser-gate harness entry (T2.1.1 C2). Mounts the REAL
// StepBuilderModal (compiled from the source tree under test) into a real
// Chromium page via a plain <W6WUIProvider api={...}> stub implementing
// `listAppsPage`/`listAppsByIds` against an in-memory 2,000-app synthetic
// catalog with REAL pagination/search/category math — no network layer, no
// jsdom, mirroring `test/picker-layout/harness-entry.tsx`'s shape. Copied
// into `<tree>/src/__picker_paging_entry.tsx` and bundled with packages/ui's
// own esbuild by run.sh; the relative imports below therefore resolve
// against the tree under test ($UI_SRC), so a mutated copy of `src` changes
// what this renders.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { StepBuilderModal } from "./StepBuilderModal.tsx";
import { W6WUIProvider } from "./provider.tsx";

const params = new URLSearchParams(location.search);
const N = Number(params.get("n") || "2000");
const DELAY = Number(params.get("delay") || "0");
// A page that would otherwise be empty (filtered/no match) instead answers a
// malformed envelope — proves the malformed/retry path end-to-end, real DOM.
const MALFORMED = params.get("malformed") === "1";
// Once the FIRST "load more" page is requested, every subsequent page keeps
// answering the SAME `nextCursor` it was asked with — a broken backend that
// never advances — for the repeated-cursor guard's real-browser proof.
const REPEAT_CURSOR = params.get("repeatCursor") === "1";
// A client-side filter that rejects EVERY app on every page — proves a
// bounded page that filters down to nothing does not auto-drain the next
// page (A2), real DOM, real "Load more" affordance.
const REJECT_ALL = params.get("rejectAll") === "1";
const APPS_ONLY = true;

// Every 3rd app carries "ai" (mirrors picker-layout's own convention), so
// the AI tab and Apps tab are provably different subsets. App 1337
// ("findme-1337") is deliberately placed FAR beyond any single page's bound,
// so a real server-side `q` search — never a client-side scan of an
// already-fetched page — is the only way to reach it (I7's "search reaches
// a fixture app beyond the initial page", A7).
function catsFor(i: number): string[] {
  return i % 3 === 0 ? ["ai"] : ["general"];
}

interface FixtureApp {
  id: string;
  displayName: string;
  version: string;
  categories: string[];
}

const CATALOG: FixtureApp[] = [];
for (let i = 0; i < N; i++) {
  CATALOG.push({
    id: i === 1337 ? "findme-1337" : `vendor-app-${i}`,
    displayName: i === 1337 ? "Find Me" : `App ${i}`,
    version: "1.0.0",
    categories: catsFor(i),
  });
}

const wait = <T,>(v: T) =>
  DELAY > 0 ? new Promise<T>((r) => setTimeout(r, DELAY)).then(() => v) : Promise.resolve(v);

/** Records every call, for the test to assert request counts/params against. */
const calls: Array<{ q?: string; category?: string; cursor?: string; limit?: number }> = [];

function listAppsPage(options?: {
  q?: string;
  category?: string;
  cursor?: string;
  limit?: number;
  compact?: boolean;
  signal?: AbortSignal;
}) {
  const opts = options ?? {};
  calls.push({ q: opts.q, category: opts.category, cursor: opts.cursor, limit: opts.limit });
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    if (opts.signal) {
      if (opts.signal.aborted) return onAbort();
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    wait(null).then(() => {
      if (opts.signal?.aborted) return; // already rejected via the listener above
      let filtered = CATALOG;
      if (opts.category) filtered = filtered.filter((a) => a.categories.includes(opts.category as string));
      if (opts.q?.trim()) {
        const q = opts.q.trim().toLowerCase();
        filtered = filtered.filter(
          (a) => a.id.toLowerCase().includes(q) || a.displayName.toLowerCase().includes(q),
        );
      }
      const limit = opts.limit && opts.limit > 0 ? opts.limit : 60;
      const offset = opts.cursor ? Number(opts.cursor) : 0;

      if (MALFORMED && opts.cursor) {
        // Only a LOAD-MORE page (cursor set) answers malformed — never the
        // first page of a generation, which AppPicker treats as "the
        // optional method is not really implemented" and falls back to
        // `listApps()` rather than showing an error (see AppPicker.tsx's own
        // `pagedUnsupported` fallback). A host that already proved it CAN
        // answer correctly (the first page loaded) misbehaving mid-session
        // is the genuinely-malformed case this flag exercises.
        resolve([] as unknown);
        return;
      }

      const page = filtered.slice(offset, offset + limit);
      const hasMore = offset + limit < filtered.length;
      let nextCursor: string | undefined = hasMore ? String(offset + limit) : undefined;
      if (REPEAT_CURSOR && opts.cursor) {
        // Once ANY cursor was supplied, keep echoing it back — a broken,
        // non-advancing backend.
        nextCursor = opts.cursor;
      }
      resolve({ apps: page, nextCursor });
    });
  });
}

function listAppsByIds(ids: readonly string[]) {
  const set = new Set(ids);
  return wait(CATALOG.filter((a) => set.has(a.id)));
}

const listApps = () => wait(CATALOG.slice(0, 200));
const listConnections = () => wait([]);
const getAppActions = () => wait([{ key: "act", title: "Action", params: [] }]);
const listFunctions = () => wait([]);
const listWorkflows = () => wait([]);

const api: unknown = new Proxy(
  {
    listApps,
    listAppsPage,
    listAppsByIds,
    listConnections,
    getAppActions,
    listFunctions,
    listWorkflows,
  },
  {
    get(t: Record<string, unknown>, k: string) {
      if (k in t) return t[k];
      return () => Promise.resolve([]);
    },
  },
);

const onAdd = (step: unknown) => {
  (window as unknown as { __lastAdd?: unknown }).__lastAdd = step;
  return "stub_step";
};

/** A real, closeable mount — `onClose` actually unmounts the modal (PG9
 *  needs a REAL close, not a no-op, to prove an in-flight request cannot
 *  crash or render after the picker itself is gone). */
function Harness() {
  const [openState, setOpenState] = useState(true);
  if (!openState) return <div data-testid="closed">closed</div>;
  return (
    <StepBuilderModal
      onClose={() => setOpenState(false)}
      onAdd={onAdd}
      appsOnly={APPS_ONLY}
      callables={[]}
      appsFilter={REJECT_ALL ? () => false : undefined}
    />
  );
}

const mount = document.getElementById("root");
if (!mount) throw new Error("no #root to mount into");
// biome-ignore lint/suspicious/noExplicitAny: the harness stub is intentionally untyped against W6WApi.
createRoot(mount).render(
  <W6WUIProvider api={api as any}>
    <Harness />
  </W6WUIProvider>,
);
(window as unknown as { __mounted: boolean; __calls: typeof calls }).__mounted = true;
(window as unknown as { __calls: typeof calls }).__calls = calls;
