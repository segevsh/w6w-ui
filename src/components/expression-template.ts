import { parseTemplate, serializeTemplate } from "@w6w/expr";
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
 * Serialize parts to the leanest faithful VALUE: prune empty text, collapse a
 * lone text segment to a plain string (backward-compat), else an `ExprValue`.
 * Shared by the inline field and the expression editor modal.
 */
export function partsToValue(parts: ExprPart[]): ExprValue | string {
  const cleaned = parts.filter((p) => p.kind !== "text" || (p.value ?? "") !== "");
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1 && cleaned[0].kind === "text") return cleaned[0].value ?? "";
  return { type: "expr", parts: cleaned.map(toWirePart) };
}

/**
 * Mirrors the engine's `RunScope` (`w6w-workflow/packages/engine/src/expr.ts:42`)
 * — the roots a `{{ }}` marker's first path segment must land in for the
 * marker to be treated as a W6W expression rather than literal vendor
 * placeholder text (CONDUCTOR AMENDMENT 2026-08-14 on this project's T1.2.2
 * contract). `ui` must not depend on `@w6w/workflow` — the import-map graph
 * runs `core -> w6w-workflow -> server`, and `ui -> studio` only — so this is
 * a LOCAL mirror, kept in sync by hand until T1.5.1 (a different repo) lands
 * the shared `parseResolvableTemplate`; unify the two at that merge.
 */
interface LocalRunScope {
  vars: unknown;
  steps: unknown;
  trigger: unknown;
  foreach?: unknown;
  inputs?: unknown;
  output?: unknown;
  secrets?: unknown;
  documents?: unknown;
}

/**
 * The root set, DERIVED from `LocalRunScope`'s keys rather than written out by
 * hand: this object literal is typed `Record<keyof LocalRunScope, true>`, so
 * adding a root to `LocalRunScope` without adding it here is a `tsc` error
 * (missing property) — the set cannot silently drift from the type it mirrors.
 */
const RUN_SCOPE_ROOTS: Record<keyof LocalRunScope, true> = {
  vars: true,
  steps: true,
  trigger: true,
  foreach: true,
  inputs: true,
  output: true,
  secrets: true,
  documents: true,
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
 * `s` via `parseTemplate` (never a second `{{ }}` scanner), then requires
 * EVERY `var` marker's first path segment to be a `RUN_SCOPE_ROOTS` member — a
 * `secret` marker (`secrets.NAME`) or an `expr` marker (`=<jsonlogic>`) is
 * unambiguous by its OWN syntax and needs no separate check. One unrooted `var`
 * marker reverts the WHOLE string to a single literal `text` part (byte-
 * identical to the input) — all-or-nothing, because the grammar has no escape
 * syntax and a mixed string can't half-chip. This is what keeps `{{ vars.a }}`
 * a chip while Mailjet's `{{var:name}}`, Mandrill's Handlebars, and Metabase's
 * `{{tag}}` stay literal text forever (121 spellings surveyed across
 * `packages/apps`, 116 of them vendor placeholders with no root of their own).
 */
export function parseRootAnchoredTemplate(s: string): ExprPart[] {
  const parts = parseTemplate(s);
  const allRooted = parts.every(
    (p) => p.kind !== "var" || isRunScopeRoot(firstSegment(p.ref ?? "")),
  );
  return allRooted ? parts : [{ kind: "text", value: s }];
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
 * No client-side evaluator for `expr` parts (see the TODO in
 * `ExpressionEditorModal.tsx`) — those fall back to their `{{ }}` template
 * form.
 */
export function renderResult(parts: ExprPart[], samples: Record<string, string>): string {
  let out = "";
  for (const p of parts) {
    switch (p.kind) {
      case "text":
        out += p.value ?? "";
        break;
      case "var": {
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
