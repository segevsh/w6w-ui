import type { ExprPart } from "../types.ts";

/**
 * DOM helpers for the inline / modal expression editors: they render a value's
 * parts as editable text with atomic, non-editable CHIPS (tags) inline in the
 * flow, and read the parts back out of the contentEditable DOM. Shared so the
 * inline field and the full editor modal agree on chip markup and parsing.
 */

/** A `var` chip shows the bare project-var name, but the full path otherwise. */
export const varLabel = (ref: string) =>
  ref.startsWith("vars.") ? ref.slice("vars.".length) : ref;

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
    sigil.textContent = "{x}";
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
