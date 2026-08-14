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

// Fake API: every method returns a promise that never resolves. Neither the
// action select (controlled via `action`) nor opening the pop-out needs a
// real network call to lay out — `connectionId` is left unset, so the
// saved-tests/run-history effects never fire.
// biome-ignore lint/suspicious/noExplicitAny: harness stub, intentionally untyped against W6WApi.
const api: any = new Proxy(
  {},
  {
    get: () => (..._args: unknown[]) => new Promise(() => {}),
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

createRoot(mount).render(
  <W6WUIProvider api={api}>
    <ActionTestForm appId="app-x" actions={[action]} action={action} />
  </W6WUIProvider>,
);

(window as unknown as { __mounted: boolean }).__mounted = true;
