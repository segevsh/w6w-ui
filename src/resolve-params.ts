/**
 * Resolve a step's configured param VALUES against a test scope — the
 * "what will this expression actually produce" the Test tab shows, distinct
 * from `ParamsForm`/`ExpressionInput` which only ever EDIT the stored value.
 *
 * Greenfield by contract: `components/expression-template.ts`'s `renderResult`
 * is the only existing "resolve a var ref against sample values" function, but
 * it collapses "ref not in scope" and "ref resolved to an empty value" to the
 * same `out += ""` INSIDE its per-part loop — the distinction this module
 * exists to preserve is already gone by the time it returns. This file shares
 * no code with it and is not imported by it (0 lines touched there, verified
 * by `git diff --numstat` in the result).
 *
 * No React, no JSX — a pure, `node --test`-covered module, mirroring the
 * `step-preview-state.ts` / `trigger-fields.ts` precedent. `StepStartState` is
 * imported type-only (erased at runtime, same idiom `step-preview-state.ts:16`
 * already uses), so this file never actually loads `provider.tsx`'s React
 * import.
 */
import { parseResolvableText, stateAliasSpellings } from "./components/expression-template.ts";
import type { StepMeta, StepStartState } from "./provider.tsx";
import { type ExprPart, type ExprValue, isExprValue, isSecretValue } from "./types.ts";

/**
 * Per-segment resolution outcome. Every value that can contain a `var`/`expr`
 * part resolves to an ARRAY of these (one per part of a multipart `ExprValue`,
 * or one for a single top-level marker/literal) — never a bare `string`, which
 * is exactly the shape `renderResult` collapses to and loses the distinction.
 *
 * `value` on `"resolved"` is `unknown` and explicitly INCLUDES `null` / `""` /
 * `false` / `0` — those are real, present values, not absence. `"unresolved"`
 * carries no `value` at all (there is nothing to show) and always carries the
 * `ref` that failed to resolve, so a caller can render "this ref, unresolved"
 * without ever falling back to rendering the ref as if it WERE the value.
 */
export type ResolvedSegment =
  | { status: "resolved"; ref?: string; value: unknown }
  | { status: "unresolved"; ref: string }
  /**
   * A `nodes.<id>.meta.config.<key>` (alias `nodes.<id>.config.<key>`) ref this client cannot
   * know — a key no node configures here, or one the host fills only at run time — or a
   * `nodes.<id>.meta.<key>` its static meta lacks (a `version` the canvas does not know). Neutral, not a failure: the engine
   * resolves it on the run.
   */
  | { status: "at-run"; ref: string }
  | { status: "not-evaluated"; ref?: string }
  | { status: "masked"; ref?: string };

/**
 * The scope a param's `var` refs resolve against. Built by {@link buildResolveScope}
 * from the SAME two things `StepEditModal` already computes: `testStartState`
 * (for `steps.*`/`trigger.*` — the object literally sent as the test's `state`)
 * and `sampleValues` (for `var.*`/`documents.*`/`const.*`).
 *
 * The fields mirror the engine's `RunScope` (`vars`, `constants`); the roots a ref
 * names are what the engine's data root exposes — `var.*` (with `vars.*` as its
 * permanent alias) and `const.*`. {@link resolveRef} maps one onto the other.
 */
export interface ResolveScope {
  vars: Record<string, unknown>;
  /** The SAME object as {@link vars}: `state`, `var` and `vars` are one tree (optional: hand-built scopes omit it). */
  state?: Record<string, unknown>;
  documents: Record<string, unknown>;
  /** Account constants, read as `const.<name>`. */
  constants?: Record<string, unknown>;
  steps: Record<string, { output?: unknown; meta?: StepMeta }>;
  /** `nodes.<id>…` root — the SAME object as `steps` (one state, two roots). */
  nodes?: Record<string, { output?: unknown; meta?: StepMeta }>;
  trigger: { event?: unknown };
  /**
   * The For each iteration scope (`foreach.item` / `foreach.index`), present only when
   * `sampleValues` carries a `foreach.*` key. Mirrors the engine's inner scope.
   */
  foreach?: { item?: unknown; index?: number };
  /**
   * The original flat `sampleValues` map, keyed by full ref string — checked
   * BEFORE the nested walk in {@link resolveRef}. `documentSampleValues`
   * (`document-sources.ts`) emits a document field's sample as its OWN
   * complete flat entry (`"documents.<key>.<field>"`), not as a nested value
   * living under the shorter `"documents.<key>"` entry — so the one-hop strip
   * below reconstructs `documents["<key>.<field>"]` (one key, a literal dot
   * in it) instead of `documents["<key>"]["<field>"]`, and a real
   * `"<key>"` entry (the whole document's raw content, a string) already
   * occupies that slot besides. `walkPath`'s segment-by-segment walk can
   * never reach either shape. An exact flat-key hit here resolves any ref
   * `sampleValues` names directly, regardless of how many segments it has;
   * the nested walk stays the fallback for a ref whose own reconstructed
   * value happens to be an object (`var.address` = `{ city: "X" }`, walking
   * into it for `var.address.city`), which is a value shape `sampleValues`
   * never produces a matching flat key for in the first place.
   *
   * Optional: a `ResolveScope` built by hand (as most tests in
   * `resolve-params.test.ts` do, to exercise the walk directly) has no flat
   * map to check and falls straight through to `walkPath` — only
   * `buildResolveScope` populates it.
   */
  flat?: Record<string, unknown>;
  /**
   * Each node's static configuration ({@link ExpressionOptions.nodeConfig}), laid over `nodes`
   * at `meta.config` and the `config` alias exactly as the engine's `withConfig` does.
   */
  config?: Record<string, Record<string, unknown>>;
  /**
   * Each node's static metadata ({@link ExpressionOptions.nodeMeta}), laid under the state's own
   * `meta` (which wins key by key) exactly as the engine's `withConfig` does.
   */
  meta?: Record<string, Record<string, unknown>>;
}

const VAR_PREFIX = "var.";
/** The permanent alias of {@link VAR_PREFIX}, still read (engine `evalRoot`). */
const LEGACY_VARS_PREFIX = "vars.";
const DOCUMENTS_PREFIX = "documents.";
const CONST_PREFIX = "const.";

const STATE_PREFIX = "state.";

/** `vars.<x>`/`state.<x>` → `var.<x>` (bare `vars`/`state` → `var`); every other ref unchanged. */
function canonicalRef(ref: string): string {
  if (ref === "state" || ref === "vars") return "var";
  if (ref.startsWith(LEGACY_VARS_PREFIX)) return VAR_PREFIX + ref.slice(LEGACY_VARS_PREFIX.length);
  if (ref.startsWith(STATE_PREFIX)) return VAR_PREFIX + ref.slice(STATE_PREFIX.length);
  return ref;
}

/** Collision rank of a sample key's spelling in the one state tree: `state.` > `var.` > `vars.`. */
function stateSpellingRank(rawRef: string): number {
  if (rawRef.startsWith(STATE_PREFIX)) return 3;
  if (rawRef.startsWith(VAR_PREFIX)) return 2;
  return 1;
}

/**
 * Build a {@link ResolveScope} from the two sources scope fidelity requires
 * they come from separately:
 *
 *  - `steps`/`trigger` come from `testStartState` — the exact object the test
 *    invoke sends as `state`, so a `steps.<id>.output.<field>` ref resolves to
 *    what the test will ACTUALLY see, not a design-time sample.
 *  - `vars`/`documents`/`constants` come from `sampleValues` (`useExpressionOptions()`), a
 *    FLAT map keyed by full ref (`"var.from_email"`, `"documents.<key>"`, `"const.<name>"`).
 *    Reconstructed into a nested object here (strip the root prefix, one hop)
 *    so {@link walkPath} can dot-walk into a var/document whose OWN value is an
 *    object — `sampleValues["var.address"]` holding `{ city: "X" }` still
 *    resolves `var.address.city` correctly, because the walk continues INTO
 *    the reconstructed value rather than doing a second flat-key lookup.
 */
export function buildResolveScope(
  sampleValues: Record<string, unknown> | undefined,
  testStartState: StepStartState | undefined,
  config?: Record<string, Record<string, unknown>>,
  meta?: Record<string, Record<string, unknown>>,
): ResolveScope {
  const vars: Record<string, unknown> = {};
  const varRanks: Record<string, number> = {};
  const documents: Record<string, unknown> = {};
  const constants: Record<string, unknown> = {};
  for (const [rawRef, value] of Object.entries(sampleValues ?? {})) {
    const ref = canonicalRef(rawRef);
    if (ref.startsWith(VAR_PREFIX)) {
      const key = ref.slice(VAR_PREFIX.length);
      const rank = stateSpellingRank(rawRef);
      if (!Object.hasOwn(varRanks, key) || rank >= varRanks[key]) {
        vars[key] = value;
        varRanks[key] = rank;
      }
    }
    else if (ref.startsWith(DOCUMENTS_PREFIX))
      documents[ref.slice(DOCUMENTS_PREFIX.length)] = value;
    else if (ref.startsWith(CONST_PREFIX)) constants[ref.slice(CONST_PREFIX.length)] = value;
  }
  const steps =
    (testStartState?.steps as Record<string, { output?: unknown; meta?: StepMeta }>) ?? {};
  // `foreach.item` is the whole element; `foreach.item.<k>` flat keys are the same value
  // walked, so only the whole-element key (and the index) are read.
  const sv = sampleValues ?? {};
  const hasItem = Object.hasOwn(sv, "foreach.item");
  const hasIndex = typeof sv["foreach.index"] === "number";
  // A seeded `testStartState.foreach` is what the invoke is SENT, so it wins whole — exactly as
  // `steps` come only from `testStartState` — and the flat sample keys are never mixed in.
  const seeded = testStartState?.foreach;
  const foreach = seeded
    ? { ...seeded }
    : hasItem || hasIndex
      ? {
          ...(hasItem ? { item: sv["foreach.item"] } : {}),
          ...(hasIndex ? { index: sv["foreach.index"] as number } : {}),
        }
      : undefined;
  return {
    ...(foreach ? { foreach } : {}),
    vars,
    state: vars,
    documents,
    constants,
    steps,
    nodes: steps,
    trigger: testStartState?.trigger ?? {},
    flat: sampleValues ?? {},
    ...(config ? { config } : {}),
    ...(meta ? { meta } : {}),
  };
}

/**
 * `getVar`-style dot-path walk (mirrors `packages/core/packages/expr/src/jsonlogic.ts`'s
 * `getVar`: `String(path).split(".")`, `cur = cur[part]`), but — the one
 * deliberate improvement a design-time PREVIEW can make that the run-time
 * engine cannot — it reports PRESENCE as a first-class result instead of
 * collapsing "path absent" and "path present but null" to the same fallback.
 * A hop into `null`/a non-object with segments still remaining is "absent",
 * never a value to keep walking into.
 */
function walkPath(
  root: Record<string, unknown>,
  path: string,
): { present: boolean; value: unknown } {
  const parts = path.split(".");
  let cur: unknown = root;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") return { present: false, value: undefined };
    if (!(part in (cur as Record<string, unknown>))) return { present: false, value: undefined };
    cur = (cur as Record<string, unknown>)[part];
  }
  return { present: true, value: cur };
}

/** `nodes.<id>.meta.config…` / `nodes.<id>.config…` (and the `steps.` spelling). */
const CONFIG_REF = /^(?:nodes|steps)\.[^.]+\.(?:meta\.)?config(?:\.|$)/;
/** `nodes.<id>.meta…` (and the `steps.` spelling), capturing the node id. */
const META_REF = /^(?:nodes|steps)\.([^.]+)\.meta(?:\.|$)/;

/**
 * A `nodes` map with each node's static meta and config laid over its entry — the static meta
 * under the entry's own meta (which wins), the config at `meta.config` and at the `config` alias
 * — the engine's `withConfig` (`@w6w/workflow` `expr.ts`). A copy.
 */
function withConfig(
  nodes: ResolveScope["steps"],
  config: ResolveScope["config"],
  meta?: ResolveScope["meta"],
): ResolveScope["steps"] {
  if (!config && !meta) return nodes;
  const out: Record<string, unknown> = { ...nodes };
  for (const id of new Set([...Object.keys(meta ?? {}), ...Object.keys(config ?? {})])) {
    const c = config?.[id];
    out[id] = {
      ...nodes[id],
      meta: { ...meta?.[id], ...nodes[id]?.meta, ...(c ? { config: c } : {}) },
      ...(c ? { config: c } : {}),
    };
  }
  return out as ResolveScope["steps"];
}

/** Resolve a single `var`/`$`-marker ref against the scope. */
function resolveRef(ref: string, scope: ResolveScope): ResolvedSegment {
  const path = canonicalRef(ref);
  // A `var.*`/`documents.*`/`const.*` ref that `sampleValues` already names directly
  // (any number of segments) resolves exactly, before the nested walk below
  // ever gets a chance to misreconstruct it — see `ResolveScope.flat`'s doc.
  if (
    scope.flat &&
    (path.startsWith(VAR_PREFIX) ||
      path.startsWith(DOCUMENTS_PREFIX) ||
      path.startsWith(CONST_PREFIX))
  ) {
    const key = stateAliasSpellings(ref).find((k) => Object.hasOwn(scope.flat as object, k));
    if (key !== undefined) return { status: "resolved", ref, value: scope.flat[key] };
  }
  // The engine's data root: `var`/`const` over the `vars`/`constants` fields, and
  // `nodes.<id>…`/`steps.<id>…` as two roots over one state object.
  const { vars, constants, config, meta, ...rest } = scope;
  const nodes = withConfig(scope.nodes ?? scope.steps, config, meta);
  const root: Record<string, unknown> = {
    ...rest,
    var: vars,
    ...(constants ? { const: constants } : {}),
    nodes,
    steps: nodes,
  };
  const walked = walkPath(root, path);
  if (walked.present) return { status: "resolved", ref, value: walked.value };
  // A node's config is read on every run whether or not the node runs, and the host adds keys
  // (a webhook's `url`) the client may not have: unknown here is "the run fills it", not a failure.
  if (CONFIG_REF.test(path)) return { status: "at-run", ref };
  // …and a meta key a node's static meta lacks (an unknown `version`) is reported by its run.
  const metaOf = META_REF.exec(path)?.[1];
  if (metaOf !== undefined && meta?.[metaOf]) return { status: "at-run", ref };
  return { status: "unresolved", ref };
}

/** Resolve one {@link ExprPart} of a multipart `ExprValue`. */
function resolvePart(part: ExprPart, scope: ResolveScope): ResolvedSegment {
  switch (part.kind) {
    case "text":
      return { status: "resolved", value: part.value ?? "" };
    case "var":
      return resolveRef(part.ref ?? "", scope);
    case "secret":
      // A named secret reference is ALWAYS masked — never looked up, never
      // shown, regardless of whether the name is "in scope". Mirrors the
      // engine/editor precedent: the plaintext never reaches the client at
      // all, so there is nothing to resolve here, only something to hide.
      return { status: "masked", ref: part.ref };
    case "expr":
      // Raw JSONLogic — no client-side evaluator exists anywhere in `ui`
      // (confirmed by the gap analysis). Labeled "not evaluated": a distinct
      // status from "unresolved", never rendered as if it were a value.
      return { status: "not-evaluated" };
    case "render":
      // The resolved ref is itself parsed as a `{{ }}` template and rendered
      // against the run scope — that needs the run's own resolver (T2.1.1),
      // not this design-time preview. Same honest answer as `expr` above;
      // without this arm the `default:` below reports a render part as
      // RESOLVED with `undefined`, i.e. a blank that looks correct.
      return { status: "not-evaluated" };
    default:
      return { status: "resolved", value: undefined };
  }
}

/** A hand-authored whole-value path marker: `{ "$": "<path>" }`, exactly one key. */
export function isDollarPath(v: unknown): v is { $: unknown } {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.keys(v as object).length === 1 &&
    "$" in (v as object)
  );
}

/** A hand-authored whole-value JSONLogic marker: `{ "$expr": <logic> }`, exactly one key. */
export function isDollarExpr(v: unknown): v is { $expr: unknown } {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.keys(v as object).length === 1 &&
    "$expr" in (v as object)
  );
}

/**
 * Resolve one configured param VALUE (or one `vars`-row's `value`, per A5 — the
 * same function, called again per row) against `scope`. Returns one segment
 * per part of a multipart `ExprValue`, or a single segment for anything else:
 * a `SecretValue` at-rest envelope (`masked`), a hand-authored `{"$":…}` /
 * `{"$expr":…}` marker (resolved as a ref lookup / not-evaluated — NOT as a
 * literal object, per the acceptance pin), or a plain literal (`resolved`,
 * `value` as-is, no `ref`).
 */
export function resolveParamValue(value: unknown, scope: ResolveScope): ResolvedSegment[] {
  if (isSecretValue(value)) return [{ status: "masked" }];
  if (isExprValue(value)) return (value as ExprValue).parts.map((p) => resolvePart(p, scope));
  // A `{{ }}` template string resolves exactly as the engine resolves it (escapes consumed);
  // one marker alone folds to the typed value (`foldResolvedSegments`).
  if (typeof value === "string") {
    const parts = parseResolvableText(value);
    if (parts) return parts.map((p) => resolvePart(p, scope));
  }
  if (isDollarPath(value)) return [resolveRef(String((value as { $: unknown }).$), scope)];
  if (isDollarExpr(value)) return [{ status: "not-evaluated" }];
  return [{ status: "resolved", value }];
}

/**
 * Structural deep-equality over JSON-shaped values (primitives, arrays, plain
 * objects, recursively) — no new dependency. Used by the Test tab's "unchanged
 * from default" filter (D-1/A1): equality, not presence, so a value the
 * hand-editable JSON view baked in explicitly is still recognized as
 * unchanged when it matches the declared default. `a === b` covers primitives
 * (including `undefined === undefined`, so a param with neither a value nor a
 * declared default is "equal" too) and short-circuits identical references
 * before the recursive object/array walk.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== "object") return false;
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b as object);
  if (aArr !== bArr) return false;
  if (aArr) {
    const arrA = a as unknown[];
    const arrB = b as unknown[];
    return arrA.length === arrB.length && arrA.every((v, i) => deepEqual(v, arrB[i]));
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  return (
    keysA.length === keysB.length && keysA.every((k) => k in objB && deepEqual(objA[k], objB[k]))
  );
}
