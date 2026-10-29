/**
 * Helpers for composing a `json`/`group` param's value out of literal JSON and references.
 *
 * A reference inside a JSON value takes one of the two forms the engine resolves at any depth
 * of a `with` value (`w6w-workflow` engine `expr.ts`, `resolveRecorded`):
 *
 * - `{ "$": "<ref>" }` — the referenced value itself, type intact (an object stays an object);
 * - `"… {{ <ref> }} …"` inside a JSON string — interpolated as text.
 *
 * So the composer inserts the first form where a JSON value goes, and the second inside a
 * string literal.
 */

import type { StepMeta, StepStartState } from "../provider.tsx";
import type { ExprValue } from "../types.ts";
import { parseRootAnchoredTemplate } from "./expression-template.ts";

/** True when `pos` sits inside a JSON string literal of `text` (after its opening quote). */
export function insideJsonString(text: string, pos: number): boolean {
  let inString = false;
  for (let i = 0; i < pos && i < text.length; i++) {
    const ch = text[i];
    if (inString && ch === "\\") {
      i++; // skip the escaped character
      continue;
    }
    if (ch === '"') inString = !inString;
  }
  return inString;
}

/** The text to insert for `ref` at `pos` of `text`: interpolation in a string, else a `$` object. */
export function refInsertion(text: string, pos: number, ref: string): string {
  return insideJsonString(text, pos) ? `{{ ${ref} }}` : `{ "$": ${JSON.stringify(ref)} }`;
}

/**
 * A whole field typed as one bare `{{ ref }}` marker (not valid JSON) — the binding
 * `{ $: ref }` it means, or `null`. The ref must start at a known run-scope root, the same
 * set the engine resolves.
 */
const BARE_REF =
  /^\{\{\s*((?:vars|steps|nodes|trigger|foreach|inputs|output|documents)(?:\.[^\s{}]+)?)\s*\}\}$/;
export function bareRefBinding(text: string): { $: string } | null {
  const m = BARE_REF.exec(text.trim());
  return m ? { $: m[1] } : null;
}

/**
 * The `steps` start state a preview resolves against, rebuilt from the host's flat sample
 * values: `steps.<id>.output` / `nodes.<id>.output` keys give a step's output, and
 * `steps.<id>.meta.<field>` keys its metadata.
 */
export function sampleStepsState(
  sampleValues: Record<string, unknown> | undefined,
): StepStartState {
  const steps: Record<string, { output?: unknown; meta?: StepMeta }> = {};
  for (const [ref, value] of Object.entries(sampleValues ?? {})) {
    const out = /^(?:steps|nodes)\.([^.]+)\.output$/.exec(ref);
    if (out) {
      steps[out[1]] = { ...steps[out[1]], output: value };
      continue;
    }
    const meta = /^(?:steps|nodes)\.([^.]+)\.meta\.([^.]+)$/.exec(ref);
    if (meta) {
      steps[meta[1]] ??= {};
      const s = steps[meta[1]];
      // A preview may know only some of the four fields; the resolver reads them by path.
      s.meta = { ...s.meta, [meta[2]]: value } as StepMeta;
    }
  }
  return { steps };
}

/**
 * Resolve a composed value the way the engine resolves a `with` value: a `{ "$": ref }` object
 * and a string holding rooted `{{ ref }}` markers are resolved by `resolveLeaf` wherever they
 * sit; other arrays and objects are walked. A string whose markers are not all rooted stays
 * literal, as in the engine. `resolveLeaf` is the ui's top-level resolver
 * (`resolveParamJson` against a scope), which reads only the value it is handed.
 */
export function resolveComposed(value: unknown, resolveLeaf: (leaf: unknown) => unknown): unknown {
  if (typeof value === "string") {
    if (!value.includes("{{")) return value;
    const parts = parseRootAnchoredTemplate(value);
    if (!parts.some((p) => p.kind !== "text")) return value;
    return resolveLeaf({ type: "expr", parts } satisfies ExprValue);
  }
  if (Array.isArray(value)) return value.map((v) => resolveComposed(v, resolveLeaf));
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === "$" && typeof (value as { $: unknown }).$ === "string") {
      return resolveLeaf(value);
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveComposed(v, resolveLeaf)]),
    );
  }
  return value;
}
