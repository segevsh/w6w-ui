import {
  type TemplateEscape,
  coalesceOperandRefs,
  hasRefusedChainToken,
  parseTemplate,
  serializeTemplate,
} from "@w6w/expr";
import {
  type ExprPart,
  type ExprValue,
  type SecretValue,
  isExprValue,
  isSecretValue,
} from "../types.ts";

/**
 * `ui`'s view of the one `{{ }}` inline-expression grammar. The parser and the
 * serializer live in `@w6w/expr` (`core/packages/expr/src/template.ts`) so the
 * engine and the editor read the SAME grammar rather than two copies that must
 * agree forever; this module re-exports them and keeps the editor-only helpers
 * below (`renderResult` masks secrets as `•••` — a preview policy that must not
 * enter the engine's package).
 *
 * Grammar, modes, and the secret fence (D-8) are documented at the definition.
 *
 * `parseTemplate` itself builds every `{{ }}` marker unconditionally — it has
 * no opinion on whether a marker is a W6W expression or a vendor placeholder
 * (Mailjet's `{{var:name}}`, Metabase's `{{tag}}`, …). {@link
 * parseRootAnchoredTemplate} below adds that opinion (root-anchored parsing,
 * CONDUCTOR AMENDMENT 2026-08-14) and is what `valueToParts` and the chip-ify
 * commit paths call — never `parseTemplate` directly on untrusted text.
 */
export { parseTemplate, serializeTemplate };

/** Strip editor-only noise, keeping only the wire fields each kind carries. */
function toWirePart(p: ExprPart): ExprPart {
  if (p.kind === "text") return { kind: "text", value: p.value ?? "" };
  if (p.kind === "expr") return { kind: "expr", expr: p.expr };
  return { kind: p.kind, ref: p.ref ?? "" }; // var | secret
}

/**
 * Serialize parts to the value that is saved: the `{{ }}` template STRING — exactly what the
 * author sees (core Workflow RFC amendment, 2026-10-29). Text parts are source text, kept
 * verbatim (an escaped `\{{ var.x }}` stays escaped). The one exception is a `render` part,
 * which has no `{{ }}` spelling by design (RFC, *The `render` part kind*): a value holding one
 * is saved as an `ExprValue` envelope. Shared by the inline field and the expression editor
 * modal.
 */
export function partsToValue(parts: ExprPart[]): ExprValue | string {
  const cleaned = parts.filter((p) => p.kind !== "text" || (p.value ?? "") !== "");
  if (cleaned.length === 0) return "";
  if (cleaned.some((p) => p.kind === "render")) {
    return { type: "expr", parts: cleaned.map(toWirePart) };
  }
  let out = "";
  for (const p of cleaned) {
    if (p.kind === "text") {
      out += p.value ?? "";
      continue;
    }
    // A literal backslash typed right before a chip would escape it once saved as text:
    // double it, so it stays a backslash and the chip stays a reference.
    if (trailingBackslashCount(out) % 2 === 1) out += "\\";
    out += serializeTemplate([toWirePart(p)]);
  }
  return out;
}

function trailingBackslashCount(s: string): number {
  let n = 0;
  while (n < s.length && s[s.length - 1 - n] === "\\") n += 1;
  return n;
}

/**
 * Mirrors the engine's `RunScope` (`w6w-workflow/packages/engine/src/expr.ts:42`)
 * — the roots a `{{ }}` marker's first path segment must land in for the
 * marker to be treated as a W6W expression rather than literal vendor
 * placeholder text (CONDUCTOR AMENDMENT 2026-08-14 on this project's T1.2.2
 * contract). `ui` must not depend on `@w6w/workflow` — the import-map graph
 * runs `core -> w6w-workflow -> server`, and `ui -> studio` only — so this is
 * a LOCAL mirror, kept in sync BY HAND, deliberately and permanently: T1.5.1
 * already landed (`.ai/projects/done/26-08-13-00-fixes/`) and its `HITL-12`
 * considered — and declined — putting this predicate in `@w6w/expr` instead
 * of duplicating it, precisely because `ui` cannot depend on `@w6w/workflow`.
 * What IS shared is the chain-shape walk (`parseCoalesceChain` /
 * `coalesceOperandRefs` / `hasRefusedChainToken`, all `@w6w/expr`) — both
 * sites call the same predicates over their own local root set, so they
 * cannot silently drift on what a chain IS, only on which roots they accept.
 */
interface LocalRunScope {
  /** Project vars. `vars` is its permanent alias (engine `evalRoot`). */
  var: unknown;
  vars: unknown;
  steps: unknown;
  nodes?: unknown;
  trigger: unknown;
  foreach?: unknown;
  inputs?: unknown;
  output?: unknown;
  secrets?: unknown;
  documents?: unknown;
  /** Account constants. */
  const?: unknown;
}

/**
 * The root set, DERIVED from `LocalRunScope`'s keys rather than written out by
 * hand: this object literal is typed `Record<keyof LocalRunScope, true>`, so
 * adding a root to `LocalRunScope` without adding it here is a `tsc` error
 * (missing property) — the set cannot silently drift from the type it mirrors.
 */
const RUN_SCOPE_ROOTS: Record<keyof LocalRunScope, true> = {
  var: true,
  vars: true,
  steps: true,
  nodes: true,
  trigger: true,
  foreach: true,
  inputs: true,
  output: true,
  secrets: true,
  documents: true,
  const: true,
};

/** Every root name, for tests that pin the derived set without reaching into the type. */
export const RUN_SCOPE_ROOT_NAMES: readonly string[] = Object.freeze(Object.keys(RUN_SCOPE_ROOTS));

const isRunScopeRoot = (segment: string): boolean =>
  Object.prototype.hasOwnProperty.call(RUN_SCOPE_ROOTS, segment);

/** The first `.`-delimited segment of a ref, e.g. `"steps"` for `"steps.a.output"`. */
function firstSegment(ref: string): string {
  const i = ref.indexOf(".");
  return i === -1 ? ref : ref.slice(0, i);
}

/**
 * Root-anchored parse (CONDUCTOR AMENDMENT 2026-08-14): builds every marker in
 * `s` via `parseTemplate` (never a second `{{ }}` scanner), then requires:
 *   - a `var` marker: `hasRefusedChainToken` must be false (a `||`/`??` the
 *     chain grammar refused — mixed operators, a `secrets.` operand, … — is
 *     never treated as an ordinary path) AND its first path segment must be a
 *     `RUN_SCOPE_ROOTS` member;
 *   - an `expr` marker recognised by `coalesceOperandRefs` as a `||`/`??`
 *     chain: EVERY operand ref's first path segment must be a
 *     `RUN_SCOPE_ROOTS` member — a chain is a first-class citizen here, not
 *     the opaque escape hatch below;
 *   - any other `expr` marker (`=<jsonlogic>`, or a `{{ }}` chip inserted from
 *     the rail) or a `secret` marker (`secrets.NAME`): unambiguous by its OWN
 *     syntax, no separate check.
 * One unrooted marker/operand reverts the WHOLE string to a single literal
 * `text` part (byte-identical to the input) — all-or-nothing, because the
 * grammar has no escape syntax and a mixed string can't half-chip. This is
 * what keeps `{{ vars.a }}` and `{{ vars.a || "x" }}` chips while Mailjet's
 * `{{var:name}}`, Mandrill's Handlebars, and Metabase's `{{tag}}` stay literal
 * text forever (121 spellings surveyed across `packages/apps`, 116 of them
 * vendor placeholders with no root of their own).
 */
export function parseRootAnchoredTemplate(s: string): ExprPart[] {
  const parts = parseTemplate(s, "editor", EDIT_ESCAPE);
  return parts.every(isOurPart) ? parts : [{ kind: "text", value: s }];
}

/** The per-marker rule: rooted `var`, rooted chain, any other `expr`, `secret`, `text`. */
function isOurPart(p: ExprPart): boolean {
  if (p.kind === "var") {
    const ref = p.ref ?? "";
    return !hasRefusedChainToken(ref) && isRunScopeRoot(firstSegment(ref));
  }
  if (p.kind === "expr") {
    const refs = coalesceOperandRefs(p.expr);
    if (refs === null) return true; // not a chain — the `=` escape hatch: always ours.
    return refs.every((ref) => isRunScopeRoot(firstSegment(ref)));
  }
  return true; // `secret` / `text`
}

/**
 * `\{{` before one of OUR markers keeps it literal (vendor `\{{name}}` is untouched). The
 * editor keeps the backslash in the text part — what the author typed is what is saved.
 */
const EDIT_ESCAPE: TemplateEscape = { isOurs: isOurPart, backslash: "keep" };
/** The same escape as the engine applies at run time: the backslash is consumed. */
const RESOLVE_ESCAPE: TemplateEscape = { isOurs: isOurPart, backslash: "strip" };

/**
 * True when `v` holds a reference the run resolves — an `ExprValue` envelope, or a string with
 * at least one live marker of ours. Since the editor saves template STRINGS, this (not
 * `isExprValue`) is the test for "this field is an expression".
 */
export function holdsExpression(v: unknown): boolean {
  if (isExprValue(v)) return true;
  return (
    typeof v === "string" &&
    v.includes("{{") &&
    parseRootAnchoredTemplate(v).some((p) => p.kind !== "text")
  );
}

/**
 * Parse a string the way the engine resolves a `with` string (`parseResolvableTemplate`):
 * parts with escapes consumed, or `null` when the engine would pass it through untouched (no
 * marker of ours, or one marker that is not ours). For previews.
 */
export function parseResolvableText(s: string): ExprPart[] | null {
  if (!s.includes("{{")) return null;
  const parts = parseTemplate(s, "editor", RESOLVE_ESCAPE);
  if (!parts.every(isOurPart)) return null;
  if (parts.some((p) => p.kind !== "text")) return parts;
  return parts.map((p) => p.value ?? "").join("") !== s ? parts : null;
}

/** A text part's source with its `\{{` escapes consumed — what the run sends. */
function unescapeText(text: string): string {
  if (!text.includes("{{")) return text;
  return parseTemplate(text, "editor", RESOLVE_ESCAPE)
    .map((p) => (p.kind === "text" ? (p.value ?? "") : serializeTemplate([p])))
    .join("");
}

/**
 * Parse an incoming value into editable parts (+ any sealed secret to display).
 * The inverse of {@link partsToValue} for the editable forms; a sealed
 * `SecretValue` has no parts (it's shown as a masked chip, never decrypted).
 *
 * The string arm root-anchor-parses (see {@link parseRootAnchoredTemplate}):
 * a hand-typed, pasted, re-opened, or SDK/MCP-written `"{{ vars.x }}"` now
 * chip-ifies identically to a rail insertion, while a vendor placeholder like
 * `"{{name}}"` stays literal text forever — it never had a root to lose.
 */
export function valueToParts(value: ExprValue | string | SecretValue | undefined): {
  parts: ExprPart[];
  sealed: SecretValue | null;
} {
  if (isSecretValue(value)) return { parts: [], sealed: value };
  if (isExprValue(value)) return { parts: value.parts.map((p) => ({ ...p })), sealed: null };
  const s = typeof value === "string" ? value : "";
  return { parts: s ? parseRootAnchoredTemplate(s) : [], sealed: null };
}

/**
 * Render parts to their preview text for the expression editor's Result pane:
 * `text` parts concatenate literally, a `var` part resolves against `samples`
 * (keyed by full ref) or renders `""` when unresolved — never the raw
 * `{{ ref }}` template token — and a `secret` part always masks as `•••`.
 *
 * A `render` part resolves through the exact SAME flat `samples` lookup as
 * `var` (A4c) — it does NOT additionally substitute `{{ }}` markers inside the
 * resolved value. That substitution is the engine's `resolveRenderPart`
 * (`packages/w6w-workflow/packages/engine/src/expr.ts`, out of scope), which
 * runs against a real run scope; this design-time preview has no run scope to
 * substitute against, so it shows the field's raw template text verbatim, same
 * as `var` would. Without at least the flat-lookup half, the new
 * insert-as-render action's very first click would leave the Result pane
 * blank, which reads as broken.
 *
 * No client-side evaluator for `expr` parts (see the TODO in
 * `ExpressionEditorModal.tsx`) — those fall back to their `{{ }}` template
 * form.
 */
export function renderResult(parts: ExprPart[], samples: Record<string, string>): string {
  let out = "";
  for (const p of parts) {
    switch (p.kind) {
      case "text":
        out += unescapeText(p.value ?? "");
        break;
      case "var":
      case "render": {
        const ref = p.ref ?? "";
        out += ref in samples ? samples[ref] : "";
        break;
      }
      case "secret":
        out += "•••";
        break;
      case "expr":
        // No client-side evaluator (see TODO above) — show the template form.
        out += serializeTemplate([p]);
        break;
    }
  }
  return out;
}
