/** React hook sequencing init/change calls to `W6WApi.resolveActionFields`. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DynamicContext,
  allowCustomOf,
  cacheKey,
  dynamicParams,
  fieldsOverlap,
  isCacheable,
  noFetchReason,
  planRequests,
  reconcileValue,
} from "./dynamic-fields.ts";
import { useOptionalW6WApi } from "./provider.tsx";
import type { ActionParam, ParamOption } from "./types.ts";

/** Per-field state the form renders from. */
export interface DynamicFieldState {
  options?: ParamOption[];
  loading: boolean;
  error?: string;
  /** Why the field is free text (no connection / unresolved refreshOn). */
  hint?: string;
  /** Flag for a kept value not in the returned list. */
  notInList?: string;
}

export interface UseDynamicFields {
  fields: Record<string, DynamicFieldState>;
  /** A pick committed `value` for `key` (select/Combobox/checkbox): one change call if any field refreshes on it. */
  commit(key: string, value: unknown): void;
  /** Focus entered `key`: remember the pre-edit form (the `previous` of a later blur commit). */
  focus(key: string): void;
  /** Focus left `key`: commit a text edit made since focus (never per keystroke). */
  blur(key: string): void;
  retry(key: string): void;
}

interface Remote {
  options?: ParamOption[];
  loading: boolean;
  error?: string;
}

interface Inflight {
  fields: string[];
  controller: AbortController;
}

export function useDynamicFields(
  params: ActionParam[],
  values: Record<string, unknown>,
  dynamic: DynamicContext | undefined,
  onChange: (next: Record<string, unknown>) => void,
): UseDynamicFields {
  const resolve = useOptionalW6WApi()?.resolveActionFields;
  const active = Boolean(dynamic && resolve);
  const [remote, setRemote] = useState<Record<string, Remote>>({});
  // Latest props, read by async continuations (never a stale closure).
  const latest = useRef({ params, values, dynamic, onChange, resolve });
  latest.current = { params, values, dynamic, onChange, resolve };
  const cache = useRef(new Map<string, ParamOption[]>());
  const inflight = useRef<Inflight[]>([]);

  const run = useCallback(
    (
      reason: "init" | "change",
      changed?: string[],
      previous?: Record<string, unknown>,
      only?: string,
      next?: Record<string, unknown>,
    ) => {
      const { params: ps, values: cur, dynamic: ctx, resolve: call } = latest.current;
      const vs = next ?? cur;
      if (!ctx || !call || !ctx.connectionId) return;
      const plan = planRequests(ps, vs, reason, changed, previous);
      if (!plan) return;
      const byKey = new Map(dynamicParams(ps).map((p) => [p.key, p]));
      const cleared: string[] = [];
      const cached: Record<string, Remote> = {};
      const fields: string[] = [];
      const appLabel = ctx.appName ?? ctx.appId;
      const apply = (key: string, options: ParamOption[]) => {
        const p = byKey.get(key);
        if (!p) return;
        const r = reconcileValue(vs[key], options, {
          allowCustom: allowCustomOf(p),
          reason,
          appLabel,
        });
        if (r.action === "clear") cleared.push(key);
      };
      for (const key of plan.fields) {
        if (only !== undefined && key !== only) continue;
        const p = byKey.get(key);
        if (!p) continue;
        const hit =
          only === undefined && isCacheable(p)
            ? cache.current.get(cacheKey(ctx, p, plan.form))
            : undefined;
        if (hit) {
          cached[key] = { options: hit, loading: false };
          apply(key, hit);
        } else fields.push(key);
      }
      const flush = (sync = false) => {
        if (cleared.length === 0) return;
        // Sync (cache) path clears against the just-committed form; async against the live one.
        const out = { ...(sync ? vs : latest.current.values) };
        for (const k of cleared) delete out[k];
        latest.current.onChange(out);
      };
      if (Object.keys(cached).length > 0) setRemote((r) => ({ ...r, ...cached }));
      if (fields.length === 0) {
        flush(true);
        return;
      }
      for (const f of inflight.current) {
        if (fieldsOverlap(f.fields, fields)) f.controller.abort();
      }
      const controller = new AbortController();
      const entry: Inflight = { fields, controller };
      inflight.current = [...inflight.current.filter((f) => !f.controller.signal.aborted), entry];
      setRemote((r) => {
        const n = { ...r };
        for (const k of fields) n[k] = { options: r[k]?.options, loading: true };
        return n;
      });
      const body = {
        ...plan,
        fields,
        connectionId: ctx.connectionId,
        ...(ctx.version !== undefined ? { version: ctx.version } : {}),
      };
      const done = (patch: Record<string, Remote>) => {
        inflight.current = inflight.current.filter((f) => f !== entry);
        setRemote((r) => ({ ...r, ...patch }));
      };
      Promise.resolve()
        .then(() => call(ctx.appId, ctx.actionKey, body, { signal: controller.signal }))
        .then((res) => {
          if (controller.signal.aborted) return;
          const patch: Record<string, Remote> = {};
          for (const key of fields) {
            const out = res?.fields?.[key];
            const p = byKey.get(key);
            if (!out || !p) {
              patch[key] = { loading: false };
            } else if (out.error) {
              patch[key] = { loading: false, error: out.error };
            } else {
              const options = Array.isArray(out.options) ? out.options : [];
              patch[key] = { loading: false, options };
              if (isCacheable(p)) cache.current.set(cacheKey(ctx, p, plan.form), options);
              apply(key, options);
            }
          }
          done(patch);
          flush();
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          const msg = e instanceof Error ? e.message : String(e);
          const patch: Record<string, Remote> = {};
          for (const key of fields) patch[key] = { loading: false, error: msg || "Request failed" };
          done(patch);
        });
    },
    [],
  );

  const ctxKey = dynamic
    ? JSON.stringify([dynamic.appId, dynamic.actionKey, dynamic.version, dynamic.connectionId])
    : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-init only on a context change
  useEffect(() => {
    if (!active) return;
    setRemote({});
    run("init");
    return () => {
      for (const f of inflight.current) f.controller.abort();
      inflight.current = [];
    };
  }, [ctxKey, active, run]);

  // Pre-edit form per focused key (a text edit commits on blur, against this).
  const snaps = useRef(new Map<string, Record<string, unknown>>());
  const commit = useCallback(
    (key: string, value: unknown) => {
      const previous = snaps.current.get(key) ?? latest.current.values;
      snaps.current.delete(key);
      run("change", [key], previous, undefined, { ...latest.current.values, [key]: value });
    },
    [run],
  );
  const focus = useCallback((key: string) => {
    if (!snaps.current.has(key)) snaps.current.set(key, latest.current.values);
  }, []);
  const blur = useCallback(
    (key: string) => {
      const previous = snaps.current.get(key);
      snaps.current.delete(key);
      if (!previous) return;
      const now = latest.current.values;
      if (JSON.stringify(previous[key]) === JSON.stringify(now[key])) return;
      run("change", [key], previous);
    },
    [run],
  );
  const retry = useCallback((key: string) => run("init", undefined, undefined, key), [run]);

  const fields = useMemo(() => {
    const out: Record<string, DynamicFieldState> = {};
    if (!active || !dynamic) return out;
    const appLabel = dynamic.appName ?? dynamic.appId;
    for (const p of dynamicParams(params)) {
      const why = noFetchReason(p, params, values, dynamic);
      if (why) {
        out[p.key] = { loading: false, hint: why.hint };
        continue;
      }
      const r = remote[p.key] ?? { loading: true };
      const st: DynamicFieldState = { ...r };
      if (r.options) {
        const rec = reconcileValue(values[p.key], r.options, {
          allowCustom: allowCustomOf(p),
          reason: "init",
          appLabel,
        });
        if (rec.action === "flag") st.notInList = rec.message;
      }
      out[p.key] = st;
    }
    return out;
  }, [active, dynamic, params, values, remote]);

  return { fields, commit, focus, blur, retry };
}
