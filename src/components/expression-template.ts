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
 * Parse an incoming value into editable parts (+ any sealed secret to display).
 * The inverse of {@link partsToValue} for the editable forms; a sealed
 * `SecretValue` has no parts (it's shown as a masked chip, never decrypted).
 */
export function valueToParts(value: ExprValue | string | SecretValue | undefined): {
  parts: ExprPart[];
  sealed: SecretValue | null;
} {
  if (isSecretValue(value)) return { parts: [], sealed: value };
  if (isExprValue(value)) return { parts: value.parts.map((p) => ({ ...p })), sealed: null };
  const s = typeof value === "string" ? value : "";
  return { parts: s ? [{ kind: "text", value: s }] : [], sealed: null };
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
