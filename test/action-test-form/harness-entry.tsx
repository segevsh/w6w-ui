// action-test-form browser-gate harness entry. Mounts the REAL ActionTestForm
// (compiled from the source tree under test) into a real Chromium page via a
// plain `<W6WUIProvider api={...}>` stub — no jsdom, no network layer.
// Copied into `<tree>/src/__action_test_form_entry.tsx` and bundled with
// packages/ui's own esbuild by run.sh; the relative imports below therefore
// resolve against the tree under test ($UI_SRC), so a mutated copy of `src`
// changes what this renders. Adopted from T1.4.1 round 2's evaluator harness
// (`artifacts/T1.4.1-ungated-harness-entry.tsx` in the project folder) — this
// is the "v === 'full'" branch of that throwaway, made permanent.
import { createRoot } from "react-dom/client";
import { ActionTestForm } from "./ActionTestForm.tsx";
import { W6WUIProvider } from "./provider.tsx";
import type { ActionDef } from "./types.ts";

// `variant` fixture switch (T2.1.1). Default (no query) renders EXACTLY
// today's tree — the pre-existing M-popout-scroll guard depends on that not
// changing. Two new variants exercise defect 1 (the error box flush against
// the hint text): both `embedded`, both give `invokeAction` a REJECTING
// promise (every other method still never resolves — neither the saved-tests
// rail nor the run-history effect needs a real response to lay out), so
// clicking "Run action" reliably produces a `.w6w-result.w6w-error` box.
//   embedded-rail   — embedded + connectionId set → renders `savedTestsRail`
//                     → exercises `.w6w-tester-embedded-main` (the
//                     screenshot's own configuration).
//   embedded-norail — embedded, no connectionId → exercises
//                     `.w6w-tester-embedded-scroll` directly.
const variant = new URLSearchParams(location.search).get("variant");

// Fake API: every method returns a promise that never resolves, EXCEPT
// `invokeAction` on the two `embedded-*` variants, which rejects so the
// error box has something real to render.
// biome-ignore lint/suspicious/noExplicitAny: harness stub, intentionally untyped against W6WApi.
const api: any = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (
        (variant === "embedded-rail" || variant === "embedded-norail") &&
        prop === "invokeAction"
      ) {
        return () => Promise.reject(new Error("action-test-form harness: invokeAction rejected"));
      }
      return (..._args: unknown[]) => new Promise(() => {});
    },
  },
);

// 14 mixed-type params — a realistic first-party action's param count (e.g.
// followupboss/search-people.ts, youtube/search.ts run 15-23), enough to give
// the params pane real height and stress the "no clipped content" assertion.
const action: ActionDef = {
  key: "act",
  title: "Big Action",
  params: Array.from({ length: 14 }, (_, i) => ({
    key: `field_${i}`,
    label: `Field ${i}`,
    type: i % 5 === 0 ? "json" : i % 5 === 1 ? "text" : "string",
  })),
};

const mount = document.getElementById("root");
if (!mount) throw new Error("no #root to mount into");

const embedded = variant === "embedded-rail" || variant === "embedded-norail";
const connectionId = variant === "embedded-rail" ? "conn-1" : undefined;

createRoot(mount).render(
  <W6WUIProvider api={api}>
    <ActionTestForm
      appId="app-x"
      actions={[action]}
      action={action}
      embedded={embedded}
      connectionId={connectionId}
    />
  </W6WUIProvider>,
);

(window as unknown as { __mounted: boolean }).__mounted = true;
