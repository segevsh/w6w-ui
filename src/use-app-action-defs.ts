/**
 * The action definitions of every app a workflow's steps use, so the editor
 * can read each upstream step's declared output shape (`output-shape.ts`)
 * without running it.
 *
 * Fetched once per app id (`getAppActions`, i.e. `GET /apps/:id`) and kept for
 * the editor's lifetime. Keyed on the sorted SET of app ids rather than
 * `nodes`' identity — `nodes` is rebuilt on every drag and keystroke. Internal
 * `@w6w/*` apps are skipped: their shapes are static (`internalNodeDef`).
 * Best-effort per app: a failed fetch contributes nothing and never breaks
 * the picker.
 */
import { useEffect, useRef, useState } from "react";
import { isInternalApp } from "./flow-types.ts";
import type { StepNode } from "./flow-utils.ts";
import type { W6WApi } from "./provider.tsx";
import type { ActionDef } from "./types.ts";

export function useAppActionDefs(api: W6WApi, nodes: StepNode[]): Record<string, ActionDef[]> {
  const [defs, setDefs] = useState<Record<string, ActionDef[]>>({});
  // Apps already requested (loaded or in flight), so a re-run fetches only new ones.
  const requested = useRef(new Set<string>());
  const appIdsKey = JSON.stringify(
    [...new Set(nodes.map((n) => n.data.step.uses.app))]
      .filter((app) => app && !isInternalApp(app))
      .sort(),
  );
  useEffect(() => {
    const missing = (JSON.parse(appIdsKey) as string[]).filter(
      (app) => !requested.current.has(app),
    );
    if (missing.length === 0) return;
    for (const app of missing) requested.current.add(app);
    // Never canceled: an app's actions don't depend on which run of this effect
    // asked for them, so a result landing after a re-key is still right, and
    // dropping it would leave that app unloaded (it is already `requested`).
    Promise.all(
      missing.map(async (app) => {
        try {
          return [app, await api.getAppActions(app)] as const;
        } catch {
          requested.current.delete(app); // let a later change retry it
          return null;
        }
      }),
    ).then((res) => {
      const loaded = res.filter((r): r is readonly [string, ActionDef[]] => r !== null);
      if (loaded.length === 0) return;
      setDefs((prev) => ({ ...prev, ...Object.fromEntries(loaded) }));
    });
  }, [api, appIdsKey]);
  return defs;
}
