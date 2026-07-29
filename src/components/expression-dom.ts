import type { ExprPart } from "../types.ts";

/**
 * DOM helpers for the inline / modal expression editors: they render a value's
 * parts as editable text with atomic, non-editable CHIPS (tags) inline in the
 * flow, and read the parts back out of the contentEditable DOM. Shared so the
 * inline field and the full editor modal agree on chip markup and parsing.
 */

/**
 * A step-output ref: `steps.<id>.output` optionally followed by `.<field…>`.
 *
 * Matched against the literal `.output` SEGMENT rather than by splitting on
 * ".", so a step id that itself contains a dot still resolves — for
 * `steps.my.step.output.email` the lazy `(.+?)` stops at the first `.output`
 * that is followed by end-of-ref or another segment, giving id `my.step`.
 */
const STEP_OUTPUT_REF = /^steps\.(.+?)\.output(?:\.(.+))?$/;

/**
 * The name a source or chip DISPLAYS. Never the ref it SAVES.
 *
 * A saved ref is always canonical and engine-resolvable — the run scope offers
 * exactly `vars.* · steps.<id>.output.* · trigger.* · secrets.* · documents.* ·
 * inputs.* · foreach.* · output.*` (`core/rfcs/workflow.md` §Expressions, built
 * in `w6w-workflow/packages/engine/src/run.ts`). Those read long in a field, so
 * the label drops the root the chip's sigil and colour already imply:
 *
 * | ref                         | label          |
 * |-----------------------------|----------------|
 * | `vars.from_email`           | `from_email`   |
 * | `steps.gate_1.output`       | `gate_1`       |
 * | `steps.gate_1.output.email` | `gate_1.email` |
 * | anything else               | verbatim       |
 *
 * **`gate_1.email` is a LABEL ONLY — it is not an expression.** There is no
 * `gate_1` key at the run-scope root, so a chip that STORED the short form would
 * render perfectly in the editor and resolve to empty at run time, silently and
 * untraceably. `makeChip` keeps the two apart deliberately: the chip's stored
 * attribute carries the ref, this function only ever feeds `label.textContent`.
 */
export const varLabel = (ref: string): string => {
  if (ref.startsWith("vars.")) return ref.slice("vars.".length);
  const m = STEP_OUTPUT_REF.exec(ref);
  if (m) return m[2] ? `${m[1]}.${m[2]}` : m[1];
  return ref;
};

/**
 * A key that cannot survive the trip from picker to engine, by CHARACTER.
 *
 * - `.` — JSONLogic's `var` splits its path on "." with **no escape and no
 *   bracket form** (`core/packages/expr/src/jsonlogic.ts` `getVar`:
 *   `String(path).split(".")`), so a key `a.b` becomes the lookup
 *   `output → a → b` and yields `null`. There is no spelling that reaches it.
 * - `{` / `}` — they collide with the `{{ … }}` template grammar
 *   (`expression-template.ts`), so the ref does not survive the text round trip.
 *
 * Interior whitespace is deliberately NOT here: `output["first name"]` is a
 * plain property lookup that `getVar` performs correctly, and
 * `{{ steps.g.output.first name }}` round-trips (only the OUTER pad is trimmed).
 * Leading/trailing whitespace IS rejected, below — that pad is what gets eaten.
 */
const UNREACHABLE_KEY_CHARS = /[.{}]/;

/**
 * Whether a declared output key can become a ref the engine actually resolves.
 *
 * A key that fails this would still produce a chip that renders perfectly and
 * evaluates to **empty at run time, silently** — the same failure mode the
 * label/ref split exists to avoid — so the picker must not offer it at all. The
 * step's WHOLE output (`steps.<id>.output`) is still offered, which remains the
 * author's route to such a field via an explicit `=` JSONLogic expression.
 */
export function isRefSafeKey(key: string): boolean {
  if (key === "" || key !== key.trim()) return false;
  return !UNREACHABLE_KEY_CHARS.test(key);
}

/** Build the non-editable inline chip (tag) DOM node for a part. */
export function makeChip(doc: Document, part: ExprPart): HTMLElement {
  const span = doc.createElement("span");
  span.contentEditable = "false";
  span.className = `w6w-expr-chip w6w-expr-chip-${part.kind}`;
  span.setAttribute("data-kind", part.kind);

  const sigil = doc.createElement("span");
  sigil.className = "w6w-expr-chip-sigil";
  const label = doc.createElement("span");
  label.className = "w6w-expr-chip-label";

  if (part.kind === "var") {
    span.setAttribute("data-ref", part.ref ?? "");
    // A small, quiet marker (accent colour carries the "variable" meaning) —
    // never the literal `{x}`, which read as noise crowding the field.
    sigil.textContent = "◆";
    label.textContent = varLabel(part.ref ?? "");
    span.title = `Variable: ${part.ref ?? ""}`;
  } else if (part.kind === "secret") {
    span.setAttribute("data-ref", part.ref ?? "");
    sigil.textContent = "🔒";
    label.textContent = part.ref ?? ""; // the NAME — never the value
    span.title = `Secret: ${part.ref ?? ""}`;
  } else {
    const raw = typeof part.expr === "string" ? part.expr : JSON.stringify(part.expr ?? "");
    span.setAttribute("data-expr", raw);
    sigil.textContent = "ƒ";
    label.textContent = raw.length > 24 ? `${raw.slice(0, 24)}…` : raw || "expr";
    span.title = `Expression: ${raw}`;
  }

  span.append(sigil, label);

  const x = doc.createElement("span");
  x.className = "w6w-expr-chip-x";
  x.setAttribute("data-x", "1");
  x.setAttribute("role", "button");
  x.setAttribute("aria-label", "Remove");
  x.textContent = "×";
  span.append(x);
  return span;
}

/** Reconstruct parts from an editor's DOM (the source of truth while editing). */
export function readParts(root: HTMLElement): ExprPart[] {
  const parts: ExprPart[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = parts[parts.length - 1];
    if (last && last.kind === "text") last.value = (last.value ?? "") + t;
    else parts.push({ kind: "text", value: t });
  };
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent ?? "");
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const kind = el.getAttribute("data-kind");
    if (kind === "var" || kind === "secret") {
      parts.push({ kind, ref: el.getAttribute("data-ref") ?? "" });
    } else if (kind === "expr") {
      const raw = el.getAttribute("data-expr") ?? "";
      let expr: unknown = raw;
      try {
        expr = JSON.parse(raw);
      } catch {
        expr = raw;
      }
      parts.push({ kind: "expr", expr });
    } else {
      pushText(el.textContent ?? "");
    }
  }
  return parts;
}

/** Paint an editor's DOM from parts (text nodes + chips). */
export function paintParts(el: HTMLElement, parts: ExprPart[]): void {
  const doc = el.ownerDocument;
  el.textContent = "";
  for (const p of parts) {
    if (p.kind === "text") {
      if (p.value) el.appendChild(doc.createTextNode(p.value));
    } else {
      el.appendChild(makeChip(doc, p));
    }
  }
}

export function placeCaretAtEnd(el: HTMLElement): void {
  const sel = el.ownerDocument.getSelection();
  if (!sel) return;
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Insert a node at the caret (or at the end if the caret isn't in the editor). */
export function insertNodeAtCaret(editor: HTMLElement, node: Node): void {
  const doc = editor.ownerDocument;
  const sel = doc.getSelection();
  const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
  if (range && editor.contains(range.commonAncestorContainer)) {
    range.deleteContents();
    range.insertNode(node);
    const after = doc.createRange();
    after.setStartAfter(node);
    after.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(after);
  } else {
    editor.appendChild(node);
    placeCaretAtEnd(editor);
  }
  editor.focus();
}
