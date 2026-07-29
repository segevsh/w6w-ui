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

/**
 * Elements `contentEditable` builds one-per-line. A block child means "the
 * content before me ended a line", so it contributes an implicit newline.
 */
const BLOCK_TAGS = new Set(["div", "p"]);

/**
 * Reconstruct parts from an editor's DOM (the source of truth while editing).
 *
 * The walk is **recursive**: a native Enter wraps the caret's line in a `<div>`
 * (or drops a `<br>`), and anything nested inside it — chips included — must
 * survive. Reading `textContent` at that point would flatten a chip to its
 * label and silently destroy the reference it carries, so every unrecognised
 * element is descended into instead. `<br>` and block children map to a literal
 * `"\n"`; `pushText` coalesces those into the surrounding text part.
 *
 * One `<br>` is deliberately NOT a newline: a FILLER one, closing its block —
 * see `walk` and {@link ensureFillerBreak}.
 */
export function readParts(root: HTMLElement): ExprPart[] {
  const parts: ExprPart[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = parts[parts.length - 1];
    if (last && last.kind === "text") last.value = (last.value ?? "") + t;
    else parts.push({ kind: "text", value: t });
  };

  /** `lastInBlock`: this node is the final child of the root, a `div` or a `p`. */
  const walk = (node: Node, lastInBlock: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    const kind = el.getAttribute("data-kind");
    if (kind === "var" || kind === "secret") {
      parts.push({ kind, ref: el.getAttribute("data-ref") ?? "" });
      return;
    }
    if (kind === "expr") {
      const raw = el.getAttribute("data-expr") ?? "";
      let expr: unknown = raw;
      try {
        expr = JSON.parse(raw);
      } catch {
        expr = raw;
      }
      parts.push({ kind: "expr", expr });
      return;
    }

    // Browsers report `BR` / `DIV` uppercase for HTML documents.
    const tag = (el.tagName ?? "").toLowerCase();
    if (tag === "br") {
      // A <br> CLOSING its block is a FILLER, not a line the author made: it
      // exists so an otherwise-empty last line has a box for the caret to land
      // in. Three things produce one, all measured in Chromium
      // (`artifacts/T3.1.2-browser-check.sh`):
      //   1. {@link ensureFillerBreak}, after we insert our own "\n";
      //   2. a PASTED blank line — `<div><br></div>`, where the block already
      //      carries the break and the <br> only fills it. Counting both
      //      inflates one blank line into two;
      //   3. the browser itself, after a `contentEditable="false"` chip.
      // A <br> the author really made has content (or another line) after it
      // inside its block, so it is never the block's last child.
      if (!lastInBlock) pushText("\n");
      return;
    }
    // A *leading* block is the first line, not a break after something.
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock && parts.length > 0) pushText("\n");
    walkChildren(el, isBlock);
  };

  const walkChildren = (parent: Node, isBlockParent: boolean) => {
    const children = Array.from(parent.childNodes);
    children.forEach((child, i) => walk(child, isBlockParent && i === children.length - 1));
  };

  walkChildren(root, true);
  return parts;
}

/**
 * Give a line break at the very END of an editor somewhere to render.
 *
 * A `"\n"` that is the last thing in a `white-space: pre-wrap` block paints
 * nothing, and the caret cannot land past it — the author presses Enter, sees no
 * break, and their next keystroke lands on the *previous* line (observed in
 * Chromium; see `artifacts/T3.1.2-browser-check.sh`). Browsers solve this for
 * their own line breaks with a FILLER `<br>` as the block's last child, so ours
 * uses the same device. `readParts` skips exactly that node — the two are one
 * fact, kept in one file.
 */
export function ensureFillerBreak(editor: HTMLElement): void {
  const last = editor.lastChild as HTMLElement | null;
  if (last && (last.tagName ?? "").toLowerCase() === "br") return;
  editor.appendChild(editor.ownerDocument.createElement("br"));
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
