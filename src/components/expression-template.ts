import type { ExprPart } from "../types.ts";

/**
 * The `{{ }}` inline-expression grammar — an n8n-style template string that is
 * just an alternate SERIALIZATION of the same {@link ExprPart} model the chip
 * editor uses (so the engine, validation, and secret handling are untouched).
 *
 * Grammar (what sits between `{{` and `}}`, trimmed):
 *   - `secrets.NAME`   → a named vault-secret reference  → { kind:"secret", ref:"NAME" }
 *   - `=<jsonlogic>`   → a raw JSONLogic expression      → { kind:"expr", expr:<parsed|raw> }
 *   - anything else    → a variable/data path            → { kind:"var", ref:"<path>" }
 *
 * The `var` ref is the FULL path the engine reads via JSONLogic `{ var: ref }`
 * against `{ vars, steps, trigger, foreach }` — e.g. `vars.env`,
 * `steps.fetch.output.title`. A project variable named `env` is therefore
 * `vars.env`, matching `RunScope`. Secrets are keyed by bare name
 * (`scope.secrets[NAME]`), so they carry the `secrets.` prefix only in text form.
 *
 * A sealed at-rest secret ({ type:"secret", ciphertext, iv }) has no text form
 * and is never produced or consumed here — the editor handles it separately.
 */

const OPEN = "{{";
const CLOSE = "}}";
const SECRET_PREFIX = "secrets.";

/** Map the trimmed inner text of one `{{ … }}` to a part. */
function innerToPart(inner: string): ExprPart {
  if (inner.startsWith("=")) {
    const raw = inner.slice(1).trim();
    try {
      return { kind: "expr", expr: JSON.parse(raw) };
    } catch {
      // Not valid JSON — keep the raw authored string; the engine parses it later.
      return { kind: "expr", expr: raw };
    }
  }
  if (inner.startsWith(SECRET_PREFIX)) {
    return { kind: "secret", ref: inner.slice(SECRET_PREFIX.length) };
  }
  return { kind: "var", ref: inner };
}

/**
 * Parse a `{{ }}` template string into parts. Literal text becomes `text` parts;
 * an unterminated `{{` (no matching `}}`) is treated as literal text, never an
 * error — so half-typed input stays editable.
 */
export function parseTemplate(input: string): ExprPart[] {
  const parts: ExprPart[] = [];
  let text = "";
  let i = 0;
  const flushText = () => {
    if (text) {
      parts.push({ kind: "text", value: text });
      text = "";
    }
  };
  while (i < input.length) {
    if (input.startsWith(OPEN, i)) {
      const end = input.indexOf(CLOSE, i + OPEN.length);
      if (end === -1) {
        text += input.slice(i); // unterminated → literal
        break;
      }
      flushText();
      parts.push(innerToPart(input.slice(i + OPEN.length, end).trim()));
      i = end + CLOSE.length;
    } else {
      text += input[i];
      i += 1;
    }
  }
  flushText();
  return parts;
}

/** Serialize parts back to a `{{ }}` template string (inverse of {@link parseTemplate}). */
export function serializeTemplate(parts: ExprPart[]): string {
  let out = "";
  for (const p of parts) {
    switch (p.kind) {
      case "text":
        out += p.value ?? "";
        break;
      case "var":
        out += `${OPEN} ${p.ref ?? ""} ${CLOSE}`;
        break;
      case "secret":
        out += `${OPEN} ${SECRET_PREFIX}${p.ref ?? ""} ${CLOSE}`;
        break;
      case "expr": {
        const raw = typeof p.expr === "string" ? p.expr : JSON.stringify(p.expr ?? "");
        out += `${OPEN} =${raw} ${CLOSE}`;
        break;
      }
    }
  }
  return out;
}
