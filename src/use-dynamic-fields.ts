/** React hook sequencing init/change calls to `W6WApi.resolveActionFields`. */
import type { DynamicContext } from "./dynamic-fields.ts";
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
  /** Call when a key is committed (select/pick/blur). */
  commit(key: string, previous: Record<string, unknown>): void;
  retry(key: string): void;
}

export function useDynamicFields(
  _params: ActionParam[],
  _values: Record<string, unknown>,
  _dynamic: DynamicContext | undefined,
  _onChange: (next: Record<string, unknown>) => void,
): UseDynamicFields {
  throw new Error("not implemented");
}
