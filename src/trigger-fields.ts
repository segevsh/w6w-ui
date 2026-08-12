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

/**
 * Map a field def's declared type onto one of the `ParamsForm` scalar
 * widgets. `object`/`array` (a `WorkflowVariable`'s type union,
 * `w6w-workflow/packages/types/mod.ts:40-45` — this seam is also reused for
 * T1.1.5's run-page form) render as the `json` widget, same as an explicit
 * `json` declaration: there is no dedicated object/array widget, and `json`
 * is the one that round-trips a structured value without flattening it to
 * text. Verified inert for the trigger `fields` editor itself: its type
 * `<select>` offers exactly `string|number|boolean|json`
 * (`flow-types.ts:343-353`), so no editor-authored trigger field can reach
 * these two arms — only a call site that hands in `WorkflowVariable.type`
 * can.
 */
export function fieldWidget(type: string | undefined): ActionParam["type"] {
  if (type === "object" || type === "array") return "json";
  return type === "number" || type === "boolean" || type === "json" ? type : "string";
}

/**
 * Coerce a field's author-declared default into a value of the field's
 * declared type, so the derived form seeds a sensible starting value and the
 * required gate sees it as filled. Returns `undefined` for an empty/invalid
 * default (the operator then supplies the value).
 *
 * A trigger field's default is stored as **text** and needs parsing; a
 * `WorkflowVariable`'s default is stored as a **real JSON value already**
 * (T1.1.5) — coercing it through `String(...)` would flatten `{a:1}` to the
 * literal text `"[object Object]"` and `[1,2]` to `"1,2"`, and re-parsing
 * `String({a:1})` as JSON fails outright (`coerceDefault("json", {a:1})` used
 * to return `undefined`, silently dropping the default). So an already-object
 * or already-array `raw` is returned unchanged, before any type-specific
 * branch runs — this holds regardless of `type`, because the value needs no
 * coercion either way.
 */
export function coerceDefault(type: string | undefined, raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "object") return raw;
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
