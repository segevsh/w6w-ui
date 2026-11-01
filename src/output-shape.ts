/**
 * An upstream step's output SHAPE — the field paths a later step can pick —
 * from the places one can come from. A real shape (a fresh test output, else
 * the persisted one) is the BASE and keeps every key; the app's declared
 * `output` (`core/rfcs/action.md` `OutputField[]`) annotates it and adds its
 * declared-only keys (muted). With no real shape the declared `output` drives
 * the keys alone, then keys inferred from the action's `sample`. With none of
 * these, the author has to run a test.
 *
 * Every field is a dot-separated PATH (`start.utc`), the spec's own notation
 * for nesting (`OutputField.key`: "Dot notation for nested paths"). That is
 * also exactly how the engine resolves a ref — JSONLogic `var` splits on `.`
 * (`core/packages/expr/src/jsonlogic.ts` `getVar`) — so `steps.<id>.output.<path>`
 * reaches the nested value. A segment that can't survive that split is dropped
 * by the picker (`isRefSafePath`).
 *
 * Pure and JSX-free so `node --test` exercises it directly.
 */

/** One pickable output field of a step. `key` is a dot path; `label` is display-only. */
export interface OutputFieldRef {
  key: string;
  label?: string;
  /** `true` — `key` is a dot path whose segments are checked one by one. */
  path: true;
  /**
   * `true` when a real (fresh/persisted) shape exists and this key came ONLY from the app's
   * declaration — the picker adds it muted, "declared by the app".
   */
  declaredOnly?: true;
}

/**
 * Where a step's offered fields came from: a fresh test output, the persisted test shape,
 * the app's declared `output`, or keys inferred from the app's `sample`.
 */
export type OutputShapeSource = "fresh" | "persisted" | "declared" | "sample";

/** How deep inference walks a sample/test value. Deeper paths stay reachable via the parent. */
const MAX_DEPTH = 3;
/** Cap on inferred fields per step, so a huge test payload can't flood the rail. */
const MAX_FIELDS = 100;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The fields an action's `output` declares, or `undefined` when it declares
 * none. A `DynamicOutput` (`{ source }`) is resolved by a hook the editor does
 * not run, so it counts as "nothing declared" and the test-run fallback applies.
 */
export function declaredOutputFields(output: unknown): OutputFieldRef[] | undefined {
  if (!Array.isArray(output)) return undefined;
  const fields: OutputFieldRef[] = [];
  const seen = new Set<string>();
  const add = (f: OutputFieldRef) => {
    if (seen.has(f.key)) return;
    seen.add(f.key);
    fields.push(f);
  };
  for (const f of output) {
    if (!isPlainObject(f) || typeof f.key !== "string" || f.key === "") continue;
    const label = typeof f.label === "string" && f.label !== "" ? f.label : undefined;
    add({ key: f.key, ...(label ? { label } : {}), path: true });
    // `items` (core/rfcs/action.md): one level of list-element fields, offered as the
    // element-index path `<key>.0.<itemKey>` the engine resolves (and the editor already
    // builds for an after-loop For each).
    if (f.type === "array" && Array.isArray(f.items)) {
      for (const it of f.items) {
        if (!isPlainObject(it) || typeof it.key !== "string" || it.key === "") continue;
        const il = typeof it.label === "string" && it.label !== "" ? it.label : undefined;
        add({ key: `${f.key}.0.${it.key}`, ...(il ? { label: il } : {}), path: true });
      }
    }
  }
  return fields.length > 0 ? fields : undefined;
}

/**
 * The item keys a declared array field's `items` lists (`undefined` when the key is not a
 * declared array field with items) — what a never-run For each over that array iterates.
 */
export function declaredItemFields(output: unknown, key: string): OutputFieldRef[] | undefined {
  if (!Array.isArray(output)) return undefined;
  const f = output.find((o) => isPlainObject(o) && o.key === key);
  if (!isPlainObject(f) || !Array.isArray(f.items)) return undefined;
  return declaredOutputFields([{ key, type: "array", items: f.items }])
    ?.filter((x) => x.key !== key)
    .map((x) => ({ ...x, key: x.key.slice(key.length + 3) }));
}

/**
 * Field paths inferred from a concrete value (an action's `sample` or a test
 * run's output): every key of a plain object, recursing into nested plain
 * objects up to {@link MAX_DEPTH}. Arrays and scalars are leaves. `undefined`
 * when the value isn't a plain object with at least one key.
 */
export function inferOutputFields(value: unknown): OutputFieldRef[] | undefined {
  if (!isPlainObject(value)) return undefined;
  const fields: OutputFieldRef[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string, depth: number) => {
    for (const [k, v] of Object.entries(obj)) {
      if (fields.length >= MAX_FIELDS) return;
      const key = prefix ? `${prefix}.${k}` : k;
      fields.push({ key, path: true });
      if (isPlainObject(v) && depth < MAX_DEPTH) walk(v, key, depth + 1);
    }
  };
  walk(value, "", 1);
  return fields.length > 0 ? fields : undefined;
}

/** The value at a dot path inside `value`, or `undefined` when any segment is missing. */
export function valueAtPath(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const seg of path.split(".")) {
    if (!isPlainObject(cur) || !(seg in cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

/** The subset of an action definition this module reads. */
export interface ActionShapeDef {
  output?: unknown;
  sample?: unknown;
}

/**
 * Resolve a step's offered fields. KEYS MERGE and never hide:
 * - with a real shape (the fresh test output, else the persisted one) every real key is
 *   offered; the app's declared `output` annotates matching keys (label) and its
 *   declared-only keys are appended with `declaredOnly: true`;
 * - with no real shape, the declared `output` drives the keys alone (`declared`), else
 *   the keys inferred from `sample` (`sample`).
 * `action` is the app action/trigger definition (`undefined` while its app is loading);
 * `fresh` / `persisted` are SEPARATE inputs so the tier stays visible.
 */
export function resolveOutputShape(
  action: ActionShapeDef | undefined,
  fresh: unknown,
  persisted?: unknown,
): { fields: OutputFieldRef[]; from: OutputShapeSource } | undefined {
  const declared = declaredOutputFields(action?.output);
  const freshFields = inferOutputFields(fresh);
  const realFields = freshFields ?? inferOutputFields(persisted);
  if (realFields) {
    const byKey = new Map((declared ?? []).map((d) => [d.key, d]));
    const have = new Set(realFields.map((f) => f.key));
    const merged: OutputFieldRef[] = realFields.map((f) => {
      const d = byKey.get(f.key);
      return d?.label ? { ...f, label: d.label } : f;
    });
    for (const d of declared ?? []) if (!have.has(d.key)) merged.push({ ...d, declaredOnly: true });
    return { fields: merged, from: freshFields ? "fresh" : "persisted" };
  }
  if (declared) return { fields: declared, from: "declared" };
  const fromSample = inferOutputFields(action?.sample);
  if (fromSample) return { fields: fromSample, from: "sample" };
  return undefined;
}
