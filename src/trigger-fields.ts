import type { ActionParam } from "./types.ts";

/**
 * One field configured on a manual (`@w6w/trigger`) or webhook (`@w6w/webhook`)
 * trigger — the `fields` param stores an array of these *definitions*
 * (`{ key, type, default, required }`), not values. The Test tab derives a
 * fillable form from them (see `TriggerFillForm`).
 */
export interface TriggerFieldDef {
  key?: string;
  /** Declared value type — maps to an existing `ParamsForm` widget. */
  type?: string;
  /** Author-declared default (stored as text on the trigger config). */
  default?: unknown;
  required?: boolean;
}

/** Read a trigger's `fields` param value as an array of field definitions. */
export function asFieldDefs(fields: unknown): TriggerFieldDef[] {
  return Array.isArray(fields) ? (fields as TriggerFieldDef[]) : [];
}

/** Map a field def's declared type onto one of the `ParamsForm` scalar widgets. */
export function fieldWidget(type: string | undefined): ActionParam["type"] {
  return type === "number" || type === "boolean" || type === "json" ? type : "string";
}

/**
 * Coerce a field's author-declared default (stored as text) into a value of the
 * field's declared type, so the derived form seeds a sensible starting value and
 * the required gate sees it as filled. Returns `undefined` for an empty/invalid
 * default (the operator then supplies the value).
 */
export function coerceDefault(type: string | undefined, raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === "boolean") return raw === true || raw === "true";
  if (type === "json") {
    try {
      return JSON.parse(String(raw));
    } catch {
      return undefined;
    }
  }
  return String(raw);
}

/**
 * Project a trigger's `fields` definitions into a `ParamsForm`-compatible param
 * list — one input per declared field, keyed by the field's `key`, rendered with
 * the existing per-type widget. Unnamed fields are skipped.
 */
export function fieldsToParams(defs: TriggerFieldDef[]): ActionParam[] {
  return defs
    .filter((f) => typeof f.key === "string" && f.key.trim() !== "")
    .map((f) => ({
      key: f.key as string,
      label: f.key as string,
      type: fieldWidget(f.type),
      required: !!f.required,
    }));
}

/** Seed the fill-form values from each declared field's (coerced) default. */
export function seedValues(defs: TriggerFieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of defs) {
    if (typeof f.key !== "string" || f.key.trim() === "") continue;
    const v = coerceDefault(f.type, f.default);
    if (v !== undefined) out[f.key] = v;
  }
  return out;
}
