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
import { type PortsLookup, isInternalApp } from "./flow-types.ts";
import type { StepNode } from "./flow-utils.ts";
import type { W6WApi } from "./provider.tsx";
import type { ActionDef, TriggerSummary } from "./types.ts";

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

/**
 * The trigger definitions of every app a workflow's APP-TRIGGER nodes (`uses.trigger === true`)
 * use, so the editor can offer `trigger.event.<field>` from a trigger's declared `output` /
 * `sample` without a run. Same shape as {@link useAppActionDefs}: fetched once per app id
 * (`getAppTriggers`, optional on the api — absent means no claim), keyed on the sorted set of
 * app ids, best-effort, a failed fetch retried by a later change.
 */
export function useAppTriggerDefs(
  api: W6WApi,
  nodes: StepNode[],
): Record<string, TriggerSummary[]> {
  const [defs, setDefs] = useState<Record<string, TriggerSummary[]>>({});
  const requested = useRef(new Set<string>());
  const appIdsKey = JSON.stringify(
    [
      ...new Set(
        nodes.filter((n) => n.data.step.uses.trigger === true).map((n) => n.data.step.uses.app),
      ),
    ]
      .filter((app) => app && !isInternalApp(app))
      .sort(),
  );
  useEffect(() => {
    const load = api.getAppTriggers;
    if (typeof load !== "function") return;
    const missing = (JSON.parse(appIdsKey) as string[]).filter(
      (app) => !requested.current.has(app),
    );
    if (missing.length === 0) return;
    for (const app of missing) requested.current.add(app);
    Promise.all(
      missing.map(async (app) => {
        try {
          return [app, await load.call(api, app)] as const;
        } catch {
          requested.current.delete(app);
          return null;
        }
      }),
    ).then((res) => {
      const loaded = res.filter((r): r is readonly [string, TriggerSummary[]] => r !== null);
      if (loaded.length === 0) return;
      setDefs((prev) => ({ ...prev, ...Object.fromEntries(loaded) }));
    });
  }, [api, appIdsKey]);
  return defs;
}

/** Build a `PortsLookup` over the fetched catalog defs (`useAppActionDefs`' result). */
export function portsLookupFromDefs(defs: Record<string, ActionDef[]>): PortsLookup {
  return (app, action) => defs[app]?.find((d) => d.key === action)?.ports;
}
