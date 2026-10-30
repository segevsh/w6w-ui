/**
 * Helpers for composing a `json`/`group` param's value out of literal JSON and references.
 *
 * A reference inside a JSON value is a `{{ }}` template STRING, the one syntax the author sees
 * everywhere (core Workflow RFC amendment, 2026-10-29), resolved at any depth of a `with`
 * value (`w6w-workflow` engine `expr.ts`, `resolveRecorded`):
 *
 * - `"{{ <ref> }}"` — exactly one marker: the referenced value itself, type intact (an object
 *   stays an object);
 * - `"… {{ <ref> }} …"` — anything more: interpolated as text.
 *
 * So the composer inserts `"{{ ref }}"` (quoted) where a JSON value goes, and `{{ ref }}`
 * inside a string literal. A legacy `{ "$": "<ref>" }` binding is still read.
 */

import type { StepMeta, StepStartState } from "../provider.tsx";
import type { ExprValue } from "../types.ts";
import { parseResolvableText, parseRootAnchoredTemplate } from "./expression-template.ts";

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

/** The text to insert for `ref` at `pos` of `text`: a marker in a string, else a quoted one. */
export function refInsertion(text: string, pos: number, ref: string): string {
  const marker = `{{ ${ref} }}`;
  return insideJsonString(text, pos) ? marker : JSON.stringify(marker);
}

/**
 * The property name a reference gets when it is added to an object: its last meaningful
 * segment — `var.region` → `region`, `nodes.get_event.output.id` → `id`,
 * `nodes.get_event.output` → `get_event`, `nodes.get_event.meta` → `get_event_meta`.
 */
export function keyForRef(ref: string): string {
  const segs = ref.split(".").filter((s) => s !== "");
  const last = segs[segs.length - 1] ?? "value";
  if ((last === "output" || last === "meta") && segs.length >= 3) {
    return last === "meta" ? `${segs[segs.length - 2]}_meta` : segs[segs.length - 2];
  }
  return last;
}

/** The innermost unclosed `{`/`[` before `pos` (strings skipped), or `null` at top level. */
function openerBefore(text: string, pos: number): "{" | "[" | null {
  const stack: string[] = [];
  let inString = false;
  for (let i = 0; i < pos && i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  const top = stack[stack.length - 1];
  return top === "{" || top === "[" ? top : null;
}

/** A key not already used in `obj`: `key`, then `key_2`, `key_3`, … */
function freeKey(obj: Record<string, unknown> | null, key: string): string {
  if (!obj || !Object.hasOwn(obj, key)) return key;
  let n = 2;
  while (Object.hasOwn(obj, `${key}_${n}`)) n++;
  return `${key}_${n}`;
}

/**
 * Add a reference to a draft the author is working on — never replacing it. `pos` is the caret.
 *
 * - Inside a JSON string: `{{ ref }}`, interpolated.
 * - Where a value goes (after `:`, after `[`, or after `,` in an array): `"{{ ref }}"`.
 * - Where a property goes (after `{`, or after `,` in an object): `"key": "{{ ref }}"`.
 * - Anywhere else (the caret is not somewhere a value fits — e.g. it was never placed): a draft
 *   that is an object gets a new property at its end, an array a new element at its end.
 *   Otherwise the quoted marker goes at the caret.
 *
 * Returns the new text and the caret after the inserted reference.
 */
export function addRefToDraft(
  text: string,
  pos: number,
  ref: string,
): { text: string; caret: number } {
  const marker = `{{ ${ref} }}`;
  const quoted = JSON.stringify(marker);
  const at = (i: number, insert: string) => ({
    text: text.slice(0, i) + insert + text.slice(i),
    caret: i + insert.length,
  });
  if (insideJsonString(text, pos)) return at(pos, marker);

  let parsed: unknown;
  let ok = true;
  try {
    parsed = JSON.parse(text);
  } catch {
    ok = false;
  }
  const obj =
    ok && parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  const prop = () => `${JSON.stringify(freeKey(obj, keyForRef(ref)))}: ${quoted}`;

  const before = text.slice(0, pos).trimEnd();
  const prev = before[before.length - 1];
  const next = text.slice(pos).trimStart()[0];
  const opener = openerBefore(text, pos);
  if (prev === ":" || prev === "[" || (prev === "," && opener === "[")) {
    return at(pos, quoted + (prev !== ":" && next !== undefined && next !== "]" ? ", " : ""));
  }
  if (prev === "{" || (prev === "," && opener === "{")) {
    const sep = next !== undefined && next !== "}" ? ", " : "";
    return at(pos, (prev === "," ? " " : "") + prop() + sep);
  }

  if (ok && (obj || Array.isArray(parsed))) {
    const close = text.lastIndexOf(obj ? "}" : "]");
    const head = text.slice(0, close).trimEnd();
    const empty = head.endsWith(obj ? "{" : "[");
    const item = obj ? prop() : quoted;
    const gap = text.slice(head.length, close);
    if (gap.includes("\n")) {
      // Multi-line JSON: the new entry gets its own line, indented like its siblings.
      const indent = empty
        ? `${gap.slice(gap.lastIndexOf("\n") + 1)}  `
        : (/^\s*/.exec(head.slice(head.lastIndexOf("\n") + 1))?.[0] ?? "");
      const insert = `${empty ? "" : ","}\n${indent}${item}`;
      return { text: head + insert + text.slice(head.length), caret: head.length + insert.length };
    }
    const insert = `${empty ? "" : ","} ${item} `;
    const i = head.length;
    return { text: text.slice(0, i) + insert + text.slice(close), caret: i + insert.length - 1 };
  }
  return at(pos, quoted);
}

/**
 * A whole field typed as one bare `{{ ref }}` marker (not valid JSON, the quotes are missing)
 * — the template string `"{{ ref }}"` it means, or `null`. The ref must start at a known
 * run-scope root, the same set the engine resolves.
 */
const BARE_REF =
  /^\{\{\s*((?:var|vars|const|steps|nodes|trigger|foreach|inputs|output|documents)(?:\.[^\s{}]+)?)\s*\}\}$/;
export function bareRefBinding(text: string): string | null {
  const m = BARE_REF.exec(text.trim());
  return m ? `{{ ${m[1]} }}` : null;
}

/**
 * The ref a whole-value binding names — `"{{ ref }}"` (exactly one `var` marker, nothing
 * else), or a legacy `{ "$": "ref" }` — else `null`.
 */
export function wholeValueRef(value: unknown): string | null {
  if (typeof value === "string") {
    if (!value.includes("{{")) return null;
    const parts = parseRootAnchoredTemplate(value);
    return parts.length === 1 && parts[0].kind === "var" ? (parts[0].ref ?? null) : null;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { $?: unknown }).$ === "string"
  ) {
    return (value as { $: string }).$;
  }
  return null;
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
    const parts = parseResolvableText(value);
    if (!parts) return value;
    // Exactly one marker is the value itself, typed — as the engine resolves it.
    if (parts.length === 1 && parts[0].kind === "var") return resolveLeaf({ $: parts[0].ref });
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
