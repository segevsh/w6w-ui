/**
 * The React-facing wrapper around `step-preview-state.ts`'s pure
 * {@link fetchSeedSources} — the one piece of the seed pipeline that must stay
 * a hook (it reaches for `useW6WApi()` + `useState`/`useEffect`), so it lives
 * apart from that JSX-free module. Every surface that offers upstream seed
 * chips mounts this SAME hook: the step editor's Test tab, the canvas ▶ Run
 * collect form, and `StepBuilderModal`'s add-step Test tab.
 */
import { useEffect, useState } from "react";
import type { ExpressionStepSource } from "./components/ExpressionOptions.tsx";
import { useW6WApi } from "./provider.tsx";
import { type SeedSource, fetchSeedSources } from "./step-preview-state.ts";

/**
 * Gather each graph ancestor's latest saved step-test so the incoming-state
 * control can offer it as a seed. **One implementation**, mounted by every
 * surface — the step editor's Test tab, the canvas ▶ Run collect form, and the
 * add-step builder's Test tab — so the `gate_1 · succeeded` chip behaves
 * identically on each.
 *
 * Driven by `upstreamSteps` (from `upstreamStateSources` /
 * `stepBuilderUpstreamSteps`), not a re-walked graph. Keyed on the *set* of
 * upstream ids rather than the array's identity: that array is rebuilt on
 * every node drag and every field edit, so keying on it would refetch on each
 * keystroke.
 */
export function useSeedSources(
  workflowId: string,
  upstreamSteps: ExpressionStepSource[],
  enabled: boolean,
): SeedSource[] {
  const api = useW6WApi();
  const [seedSources, setSeedSources] = useState<SeedSource[]>([]);
  const idsKey = JSON.stringify(upstreamSteps.map((s) => [s.id, s.label]));
  useEffect(() => {
    const ids = JSON.parse(idsKey) as [string, string][];
    if (!enabled || ids.length === 0) {
      setSeedSources([]);
      return;
    }
    let canceled = false;
    fetchSeedSources(
      (stepId) => api.listStepTests(workflowId, stepId),
      ids.map(([id, label]) => ({ id, label })),
    ).then((seeds) => {
      if (!canceled) setSeedSources(seeds);
    });
    return () => {
      canceled = true;
    };
  }, [api, workflowId, idsKey, enabled]);
  return seedSources;
}
