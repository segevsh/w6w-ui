/**
 * Pure decisions for form-resolved dynamic options (no React). The hook in
 * `use-dynamic-fields.ts` only sequences; everything decidable lives here.
 */
import type { ActionParam, ParamOption, ResolveFieldsBody } from "./types.ts";

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

/**
 * Split flattened `values` (entered, else declared default) into `form` and
 * `unresolved` (expression, secret, or plain object with own key `$`).
 */
export function splitForm(_params: ActionParam[], _values: Record<string, unknown>): FormSplit {
  throw new Error("not implemented");
}

/**
 * Plan the call for `reason`. `init`: every resolveFields field whose
 * `refreshOn` keys are all resolved. `change`: only fields whose `refreshOn`
 * contains `changed[0]`. Returns null when no call is due.
 */
export function planRequests(
  _params: ActionParam[],
  _values: Record<string, unknown>,
  _reason: "init" | "change",
  _changed?: string[],
  _previous?: Record<string, unknown>,
): PlannedRequest | null {
  throw new Error("not implemented");
}

/** Cache key `(app, version, action, connection, field, refreshOn values)`. */
export function cacheKey(
  _ctx: DynamicContext,
  _param: ActionParam,
  _form: Record<string, unknown>,
): string {
  throw new Error("not implemented");
}

/** D-6: keep / flag / clear a stored value given the returned options. */
export function reconcileValue(
  _value: unknown,
  _options: ParamOption[],
  _opts: { allowCustom: boolean; reason: "init" | "change"; appLabel: string },
): Reconciled {
  throw new Error("not implemented");
}
