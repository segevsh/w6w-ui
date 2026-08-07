/**
 * Fold a param's resolved {@link ResolvedSegment}s into the one JSON value the
 * Test tab's code view shows (A6). Distinct from both existing serializers:
 * `resolve-params.ts` stops at the per-segment array (what `ResolvedParams`
 * renders as chips + badges), and `flow-utils.ts`'s `stepToJson`/`paramsToJson`
 * serialize the raw stored step/`with` — the schema-shaped envelope this view
 * must never leak (a `{type:"expr",parts:[…]}` blob, or worse, `ciphertext`).
 *
 * No React, no JSX — a pure, `node --test`-covered module, mirroring the
 * `resolve-params.ts` precedent this sits beside.
 */
import { type ResolveScope, type ResolvedSegment, resolveParamValue } from "./resolve-params.ts";

/**
 * Fold ONE segment into its JSON token. `value === undefined` on a `resolved`
 * segment folds to `"<not set>"`, never to an omitted key — `JSON.stringify`
 * drops `undefined` keys on its own, and a silently missing key is exactly the
 * D-6 defect (blank-indistinguishable-from-null) this module exists to avoid.
 */
function foldOne(seg: ResolvedSegment): unknown {
  switch (seg.status) {
    case "resolved":
      return seg.value === undefined ? "<not set>" : seg.value;
    case "unresolved":
      return `<unresolved: ${seg.ref}>`;
    case "not-evaluated":
      return "<not evaluated>";
    case "masked":
      return seg.ref ? `<masked: ${seg.ref}>` : "<masked>";
  }
}

/** Render one segment as TEXT for the multi-segment concatenation case. */
function foldOneAsText(seg: ResolvedSegment): string {
  if (seg.status === "resolved" && seg.value !== undefined) {
    return typeof seg.value === "string" ? seg.value : JSON.stringify(seg.value);
  }
  return String(foldOne(seg));
}

/**
 * Fold a param's full segment array (the shape {@link resolveParamValue}
 * returns) into ONE JSON value, per A6's pinned table: a single segment folds
 * to its own token/value; multiple segments (a multipart `ExprValue`)
 * concatenate into one string, each `resolved` part contributing its text
 * (strings as-is, non-strings `JSON.stringify`d) and every other part
 * contributing its placeholder token.
 */
export function foldResolvedSegments(segments: ResolvedSegment[]): unknown {
  if (segments.length === 1) return foldOne(segments[0]);
  return segments.map(foldOneAsText).join("");
}

/** Resolve + fold one param VALUE against `scope` in a single call. */
export function resolveParamJson(value: unknown, scope: ResolveScope): unknown {
  return foldResolvedSegments(resolveParamValue(value, scope));
}

/**
 * A `vars`-typed param's configured rows, folded into one object keyed by
 * each row's own `key` (`"(no key)"` when blank — mirrors `ResolvedVarsRow`'s
 * fallback), each row's `value` folded by the same rules as any other param.
 */
export function resolveVarsJson(
  rows: Array<{ key?: string; value: unknown }>,
  scope: ResolveScope,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    out[row.key || "(no key)"] = resolveParamJson(row.value, scope);
  }
  return out;
}
