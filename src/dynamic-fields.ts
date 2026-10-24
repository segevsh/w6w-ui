/**
 * Pure decisions for form-resolved dynamic options (no React). The hook in
 * `use-dynamic-fields.ts` only sequences; everything decidable lives here.
 */
import {
  type ActionParam,
  type ParamOption,
  type ResolveFieldsBody,
  isExprValue,
  isFormResolvedOptions,
  isSecretValue,
} from "./types.ts";

/** Dynamic-field context a ParamsForm host passes. */
export interface DynamicContext {
  appId: string;
  actionKey: string;
  version?: string;
  connectionId?: string;
  appName?: string;
}

/** Form values split per D-5: resolvable go to `form`, expression/secret/`$`-object keys to `unresolved`. */
export interface FormSplit {
  form: Record<string, unknown>;
  unresolved: string[];
}

/** One planned call: the body minus `connectionId`/`version` (the hook adds them). */
export type PlannedRequest = Pick<
  ResolveFieldsBody,
  "reason" | "form" | "previous" | "changed" | "fields" | "unresolved"
>;

/** Outcome of reconciling a stored value against a returned option list. */
export interface Reconciled {
  action: "keep" | "flag" | "clear";
  /** Hint to show when `action === "flag"`. */
  message?: string;
}

/** Section children write flat at the enclosing level; other `children` are left alone. */
function flat(list: ActionParam[]): ActionParam[] {
  const out: ActionParam[] = [];
  for (const p of list) {
    out.push(p);
    if (p.type === "section" && p.children) out.push(...flat(p.children));
  }
  return out;
}

/** D-5: expression, secret, or a plain object with own key `$` can't be sent as a literal. */
export function isUnresolvedValue(v: unknown): boolean {
  if (isExprValue(v) || isSecretValue(v)) return true;
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.prototype.hasOwnProperty.call(v, "$")
  );
}

function allowCustomOf(p: ActionParam): boolean {
  return (p as { config?: { allowCustom?: boolean } }).config?.allowCustom === true;
}

/** Params that request form-resolved options (top level + sections only). */
export function dynamicParams(params: ActionParam[]): ActionParam[] {
  return flat(params).filter((p) => isFormResolvedOptions(p.options));
}

function refreshOnOf(p: ActionParam): string[] {
  return isFormResolvedOptions(p.options) ? (p.options.refreshOn ?? []) : [];
}

/**
 * Split flattened `values` (entered, else declared default) into `form` and
 * `unresolved` (expression, secret, or plain object with own key `$`).
 */
export function splitForm(params: ActionParam[], values: Record<string, unknown>): FormSplit {
  const form: Record<string, unknown> = {};
  const unresolved: string[] = [];
  for (const p of flat(params)) {
    if (p.type === "section") continue;
    const v = values[p.key] !== undefined ? values[p.key] : p.default;
    if (v === undefined) continue;
    if (isUnresolvedValue(v)) unresolved.push(p.key);
    else form[p.key] = v;
  }
  return { form, unresolved };
}

/**
 * Plan the call for `reason`. `init`: every resolveFields field whose
 * `refreshOn` keys are all resolved. `change`: only fields whose `refreshOn`
 * contains `changed[0]` (and whose keys are all resolved). Returns null when no call is due.
 * `previous` (raw pre-commit values) is split the same way and sent as `previous`.
 */
export function planRequests(
  params: ActionParam[],
  values: Record<string, unknown>,
  reason: "init" | "change",
  changed?: string[],
  previous?: Record<string, unknown>,
): PlannedRequest | null {
  const { form, unresolved } = splitForm(params, values);
  const bad = new Set(unresolved);
  const fields = dynamicParams(params)
    .filter((p) => {
      const on = refreshOnOf(p);
      if (reason === "change" && !(changed ?? []).some((k) => on.includes(k))) return false;
      return on.every((k) => !bad.has(k));
    })
    .map((p) => p.key);
  if (fields.length === 0) return null;
  const req: PlannedRequest = { reason, form, fields, unresolved };
  if (reason === "change") {
    req.changed = [...(changed ?? [])];
    req.previous = splitForm(params, previous ?? {}).form;
  }
  return req;
}

/** Cache key `(app, version, action, connection, field, refreshOn values)`. */
export function cacheKey(
  ctx: DynamicContext,
  param: ActionParam,
  form: Record<string, unknown>,
): string {
  return JSON.stringify([
    ctx.appId,
    ctx.version ?? null,
    ctx.actionKey,
    ctx.connectionId ?? null,
    param.key,
    refreshOnOf(param).map((k) => form[k] ?? null),
  ]);
}

/** Only `cache: "none"` opts out of the in-memory cache. */
export function isCacheable(param: ActionParam): boolean {
  return !(isFormResolvedOptions(param.options) && param.options.cache === "none");
}

/** True when two requests' `fields` share a key (the newer aborts the older). */
export function fieldsOverlap(a: readonly string[], b: readonly string[]): boolean {
  return a.some((k) => b.includes(k));
}

/**
 * Why a dynamic field is NOT requested (A6), with the hint to show, or null
 * when it is requestable.
 */
export function noFetchReason(
  param: ActionParam,
  params: ActionParam[],
  values: Record<string, unknown>,
  ctx: Pick<DynamicContext, "connectionId">,
): { reason: "no-connection" | "unresolved-dependency"; hint: string } | null {
  if (!ctx.connectionId) {
    return { reason: "no-connection", hint: "Connect an account to load choices" };
  }
  const bad = new Set(splitForm(params, values).unresolved);
  const k = refreshOnOf(param).find((key) => bad.has(key));
  if (k === undefined) return null;
  const label = flat(params).find((p) => p.key === k)?.label ?? k;
  return {
    reason: "unresolved-dependency",
    hint: `Options unavailable while ${label} is an expression`,
  };
}

/** D-6: keep / flag / clear a stored value given the returned options. */
export function reconcileValue(
  value: unknown,
  options: ParamOption[],
  opts: { allowCustom: boolean; reason: "init" | "change"; appLabel: string },
): Reconciled {
  if (value === undefined || value === null || value === "") return { action: "keep" };
  if (isUnresolvedValue(value)) return { action: "keep" };
  if (options.some((o) => o.value === value || String(o.value) === String(value))) {
    return { action: "keep" };
  }
  if (opts.reason === "change" && !opts.allowCustom) return { action: "clear" };
  return { action: "flag", message: `Not in the list returned by ${opts.appLabel}` };
}

export { allowCustomOf };
