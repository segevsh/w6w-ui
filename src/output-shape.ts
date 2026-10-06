/**
 * An upstream step's output SHAPE — the field paths a later step can pick —
 * from the three places one can come from, in precedence order:
 *
 * 1. **Declared** — the app action's `output` (`core/rfcs/action.md`
 *    `OutputField[]`), so a downstream step can reference `get-event`'s
 *    `name.text` before anything has run.
 * 2. **Sample** — the action's `sample` value, when it declares no `output`.
 * 3. **Test run** — the step's last saved test output, when the action
 *    declares neither. With none of the three, the author has to run a test.
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
}

/** Where a step's offered fields came from. */
export type OutputShapeSource = "declared" | "sample" | "test";

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
  for (const f of output) {
    if (!isPlainObject(f) || typeof f.key !== "string" || f.key === "") continue;
    const label = typeof f.label === "string" && f.label !== "" ? f.label : undefined;
    fields.push(label ? { key: f.key, label, path: true } : { key: f.key, path: true });
  }
  return fields.length > 0 ? fields : undefined;
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
 * Resolve a step's offered fields by the precedence above. `action` is the
 * app action definition (`undefined` while its app's actions are loading, or
 * for a node that has none); `testOutput` is the step's last saved test output.
 */
export function resolveOutputShape(
  action: ActionShapeDef | undefined,
  testOutput: unknown,
): { fields: OutputFieldRef[]; from: OutputShapeSource } | undefined {
  const declared = declaredOutputFields(action?.output);
  if (declared) return { fields: declared, from: "declared" };
  const fromSample = inferOutputFields(action?.sample);
  if (fromSample) return { fields: fromSample, from: "sample" };
  const fromTest = inferOutputFields(testOutput);
  if (fromTest) return { fields: fromTest, from: "test" };
  return undefined;
}
