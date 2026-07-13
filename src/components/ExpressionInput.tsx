import { useLayoutEffect, useRef, useState } from "react";
import {
  type ExprPart,
  type ExprValue,
  type SecretValue,
  isExprValue,
  isSecretValue,
} from "../types.ts";
import { useExpressionOptions } from "./ExpressionOptions.tsx";
import { parseTemplate, serializeTemplate } from "./expression-template.ts";

/**
 * ExpressionInput — a single field that reads like a textbox but whose contents
 * are inline SEGMENTS, edited in place (think Notion / Zapier blocks: a chip
 * lives *inside* the text flow, not between separate inputs). Each segment kind
 * has its own look:
 *   - `text`   — plain text typed inline.
 *   - `var`    — a chip showing the variable/path (a project var `env` reads as
 *                `vars.env`, matching the engine's data scope).
 *   - `secret` — a chip showing the SECRET NAME with a lock (the value is never
 *                fetched to the client; there is nothing to mask — the name is
 *                not sensitive). A sealed at-rest secret has no name and shows
 *                `••••` instead.
 *   - `expr`   — a chip for a raw JSONLogic expression.
 *
 * Two editors over ONE value model:
 *   - Chips (default) — the inline editor below.
 *   - `{{ }}` raw mode (the `fx` toggle) — an n8n-style template string that is
 *     just a serialization of the same parts (see `expression-template.ts`).
 *
 * Value in ↔ out: incoming `value` is a plain string, an `ExprValue`, or a
 * sealed `SecretValue`. `onChange` emits the leanest faithful form — a plain
 * string when pure-text, else an `ExprValue`.
 */
export interface ExpressionInputProps {
  /** Current value — a plain string, an expression envelope, or a sealed secret. */
  value: ExprValue | string | SecretValue | undefined;
  /**
   * Fired with the next value: a plain string when pure-text, an `ExprValue`
   * for mixed content, or a sealed `SecretValue` once a masked field is
   * encrypted on blur.
   */
  onChange: (next: ExprValue | string | SecretValue) => void;
  /** Placeholder shown when the field is empty. */
  placeholder?: string;
  /** Mask typed text as dots (used for secret-typed params). Chips are unaffected. */
  masked?: boolean;
  readOnly?: boolean;
  /**
   * Picker data (task 3.2): known names to offer in the insert menu. When
   * omitted, names come from the nearest `ExpressionOptionsProvider`. Authors
   * can also type a name/path by hand.
   */
  options?: { vars?: string[]; secrets?: string[] };
  "aria-label"?: string;
}

interface SeedState {
  parts: ExprPart[];
  sealed: SecretValue | null;
}

/** Parse an incoming value into editable parts (+ any sealed secret to display). */
function seed(value: ExpressionInputProps["value"]): SeedState {
  if (isSecretValue(value)) return { parts: [], sealed: value };
  if (isExprValue(value)) return { parts: value.parts.map((p) => ({ ...p })), sealed: null };
  const s = typeof value === "string" ? value : "";
  return { parts: s ? [{ kind: "text", value: s }] : [], sealed: null };
}

/** Drop editor-only noise, keeping only what the wire shape carries per kind. */
function toWirePart(p: ExprPart): ExprPart {
  if (p.kind === "text") return { kind: "text", value: p.value ?? "" };
  if (p.kind === "expr") return { kind: "expr", expr: p.expr };
  return { kind: p.kind, ref: p.ref ?? "" }; // var | secret
}

/**
 * Serialize parts to the leanest faithful value: prune empty text, collapse a
 * lone text segment to a plain string (backward-compat), else an `ExprValue`.
 */
function serialize(parts: ExprPart[]): ExprValue | string {
  const cleaned = parts.filter((p) => p.kind !== "text" || (p.value ?? "") !== "");
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1 && cleaned[0].kind === "text") return cleaned[0].value ?? "";
  return { type: "expr", parts: cleaned.map(toWirePart) };
}

const isEmptyParts = (parts: ExprPart[]) =>
  parts.every((p) => p.kind === "text" && !(p.value ?? ""));

/** A `var` chip shows the bare project-var name, but the full path otherwise. */
const varLabel = (ref: string) => (ref.startsWith("vars.") ? ref.slice("vars.".length) : ref);

function parseMaybeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Build the non-editable inline chip DOM node for a part. */
function makeChip(doc: Document, part: ExprPart): HTMLElement {
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

/** Reconstruct parts from the editor DOM (the source of truth while editing). */
function readParts(root: HTMLElement): ExprPart[] {
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
      parts.push({ kind: "expr", expr: parseMaybeJson(el.getAttribute("data-expr") ?? "") });
    } else {
      // <br>, pasted markup, etc. — take its text so nothing is silently lost.
      pushText(el.textContent ?? "");
    }
  }
  return parts;
}

function placeCaretAtEnd(el: HTMLElement) {
  const doc = el.ownerDocument;
  const sel = doc.getSelection();
  if (!sel) return;
  const range = doc.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function ExpressionInput({
  value,
  onChange,
  placeholder,
  masked,
  readOnly,
  options,
  "aria-label": ariaLabel,
}: ExpressionInputProps) {
  // Seed once and own the content thereafter — the parent re-keys this widget
  // per field, so we never fight our own onChange echoes.
  const [state, setState] = useState<SeedState>(() => seed(value));
  const { parts, sealed } = state;
  const [mode, setMode] = useState<"chips" | "raw">("chips");
  const [raw, setRaw] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [varName, setVarName] = useState("");
  const [secretName, setSecretName] = useState("");
  const [exprText, setExprText] = useState("");
  // Bumped only for PROGRAMMATIC content changes (reseed / raw→chips), so the
  // editor DOM is repainted then — and NOT on every keystroke (which would reset
  // the caret). Typing/insert/remove mutate the DOM directly + sync out.
  const [paintGen, setPaintGen] = useState(0);
  const [sealing, setSealing] = useState(false);
  const wantFocus = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const insertRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const ctxOptions = useExpressionOptions();
  const resolved = options ?? ctxOptions;
  const sealSecret = ctxOptions.sealSecret;

  // Paint the editor DOM from `parts` on programmatic changes only.
  // biome-ignore lint/correctness/useExhaustiveDependencies: repaint is gated on paintGen, never on `parts` (would clobber the caret mid-edit).
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el || mode !== "chips" || sealed) return;
    const doc = el.ownerDocument;
    el.textContent = "";
    for (const p of parts) {
      if (p.kind === "text") {
        if (p.value) el.appendChild(doc.createTextNode(p.value));
      } else {
        el.appendChild(makeChip(doc, p));
      }
    }
    if (wantFocus.current || doc.activeElement === el) {
      el.focus();
      placeCaretAtEnd(el);
      wantFocus.current = false;
    }
  }, [paintGen, mode, sealed]);

  // Click-away closes the insert menu.
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!insertRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const syncFromDom = () => {
    const el = editorRef.current;
    if (!el) return;
    const next = readParts(el);
    setState((s) => ({ ...s, parts: next }));
    onChange(serialize(next));
  };

  // A secret-typed field must never leave clear text in the config JSON. When
  // the field holds a plain typed value (not a reference/expr), seal it into an
  // at-rest `{type:"secret"}` envelope via the host on blur — the client has no
  // key. Named-secret refs and expressions are already safe and left alone.
  const sealIfNeeded = async () => {
    if (!masked || !sealSecret || readOnly || sealing) return;
    const v = serialize(parts);
    if (typeof v !== "string" || v === "") return;
    setSealing(true);
    try {
      const env = await sealSecret(v);
      setState({ parts: [], sealed: env });
      onChange(env);
    } catch {
      // Sealing failed (host unreachable) — keep the typed value; the server
      // still encrypts secret params at rest on save. Never surface the secret.
    } finally {
      setSealing(false);
    }
  };

  // Seal only when focus truly leaves the widget (not when moving to the fx
  // toggle or the insert menu).
  const onLeave = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && wrapperRef.current?.contains(next)) return;
    void sealIfNeeded();
  };

  // Insert a chip/text at the caret (or at the end if the caret isn't in the
  // field), then place the caret just after it and sync.
  const insertPart = (part: ExprPart) => {
    const el = editorRef.current;
    if (!el || readOnly) return;
    const doc = el.ownerDocument;
    const node: Node =
      part.kind === "text" ? doc.createTextNode(part.value ?? "") : makeChip(doc, part);

    const sel = doc.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    if (range && el.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(node);
    } else {
      el.appendChild(node);
    }
    const r = doc.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(r);
    el.focus();
    syncFromDom();
    setMenuOpen(false);
    setVarName("");
    setSecretName("");
    setExprText("");
  };

  // Delete a chip when its × is clicked (backspace over an atomic chip is
  // handled natively by the browser).
  const onEditorClick = (e: React.MouseEvent) => {
    const x = (e.target as HTMLElement).closest("[data-x]");
    if (!x) return;
    e.preventDefault();
    x.closest(".w6w-expr-chip")?.remove();
    syncFromDom();
  };

  const enterRaw = () => {
    setRaw(serializeTemplate(parts));
    setMode("raw");
  };
  const enterChips = () => {
    wantFocus.current = true;
    setPaintGen((g) => g + 1);
    setMode("chips");
  };
  const onRawChange = (v: string) => {
    setRaw(v);
    const next = parseTemplate(v);
    setState((s) => ({ ...s, parts: next }));
    onChange(serialize(next));
  };

  // An at-rest secret: a single masked chip; the ciphertext is never rendered.
  if (sealed) {
    return (
      <div className={`w6w-expr-input${readOnly ? " is-readonly" : ""}`} aria-label={ariaLabel}>
        <span className="w6w-expr-chip w6w-expr-chip-secret" title="Encrypted secret">
          <span className="w6w-expr-chip-sigil">🔒</span>
          <span className="w6w-expr-chip-label">••••••</span>
        </span>
        {!readOnly && (
          <button
            type="button"
            className="w6w-expr-replace"
            onClick={() => {
              wantFocus.current = true;
              setState({ parts: [], sealed: null });
              setPaintGen((g) => g + 1);
              onChange("");
            }}
          >
            Replace
          </button>
        )}
      </div>
    );
  }

  const vars = resolved.vars ?? [];
  const secrets = resolved.secrets ?? [];
  const empty = isEmptyParts(parts);

  const varGroup = (
    <div className="w6w-expr-menu-group" key="vars">
      <span className="w6w-expr-menu-label">Variables</span>
      {vars.map((v) => (
        <button
          key={v}
          type="button"
          className="w6w-expr-menu-item"
          onClick={() => insertPart({ kind: "var", ref: `vars.${v}` })}
        >
          {`{x} ${v}`}
        </button>
      ))}
      {vars.length === 0 && <span className="w6w-expr-menu-empty">No variables yet</span>}
      <div className="w6w-expr-menu-add">
        <input
          type="text"
          value={varName}
          placeholder="path e.g. vars.env or steps.a.output.x"
          aria-label="Variable path"
          onChange={(e) => setVarName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && varName.trim()) {
              e.preventDefault();
              insertPart({ kind: "var", ref: varName.trim() });
            }
          }}
        />
        <button
          type="button"
          className="w6w-btn w6w-btn-ghost w6w-btn-sm"
          disabled={!varName.trim()}
          onClick={() => insertPart({ kind: "var", ref: varName.trim() })}
        >
          Add
        </button>
      </div>
    </div>
  );

  const secretGroup = (
    <div className={`w6w-expr-menu-group${masked ? " is-primary" : ""}`} key="secrets">
      <span className="w6w-expr-menu-label">Secrets{masked ? " — pick one" : ""}</span>
      {secrets.map((s) => (
        <button
          key={s}
          type="button"
          className="w6w-expr-menu-item"
          onClick={() => insertPart({ kind: "secret", ref: s })}
        >
          {`🔒 ${s}`}
        </button>
      ))}
      {secrets.length === 0 && <span className="w6w-expr-menu-empty">No secrets yet</span>}
      <div className="w6w-expr-menu-add">
        <input
          type="text"
          value={secretName}
          placeholder="name…"
          aria-label="Secret name"
          onChange={(e) => setSecretName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && secretName.trim()) {
              e.preventDefault();
              insertPart({ kind: "secret", ref: secretName.trim() });
            }
          }}
        />
        <button
          type="button"
          className="w6w-btn w6w-btn-ghost w6w-btn-sm"
          disabled={!secretName.trim()}
          onClick={() => insertPart({ kind: "secret", ref: secretName.trim() })}
        >
          Add
        </button>
      </div>
    </div>
  );

  const exprGroup = (
    <div className="w6w-expr-menu-group" key="expr">
      <span className="w6w-expr-menu-label">Expression</span>
      <div className="w6w-expr-menu-add">
        <input
          type="text"
          value={exprText}
          placeholder='JSONLogic or path, e.g. {"+":[1,2]}'
          aria-label="Expression"
          onChange={(e) => setExprText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && exprText.trim()) {
              e.preventDefault();
              insertPart({ kind: "expr", expr: parseMaybeJson(exprText.trim()) });
            }
          }}
        />
        <button
          type="button"
          className="w6w-btn w6w-btn-ghost w6w-btn-sm"
          disabled={!exprText.trim()}
          onClick={() => insertPart({ kind: "expr", expr: parseMaybeJson(exprText.trim()) })}
        >
          Add
        </button>
      </div>
    </div>
  );

  return (
    <div className="w6w-expr" ref={wrapperRef} onBlur={onLeave}>
      <div className="w6w-expr-toolbar">
        {!readOnly && (
          <div className="w6w-expr-insert" ref={insertRef}>
            <button
              type="button"
              className="w6w-expr-insert-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="Insert variable, secret, or expression"
              onClick={() => setMenuOpen((o) => !o)}
              disabled={mode === "raw"}
            >
              + Insert
            </button>
            {menuOpen && mode === "chips" && (
              <div className="w6w-expr-menu" role="menu">
                {masked ? [secretGroup, varGroup] : [varGroup, secretGroup]}
                {exprGroup}
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className={`w6w-expr-fx${mode === "raw" ? " is-active" : ""}`}
          title={mode === "raw" ? "Back to fields" : "Edit as a {{ }} expression"}
          aria-pressed={mode === "raw"}
          onClick={mode === "raw" ? enterChips : enterRaw}
        >
          {mode === "raw" ? "abc" : "{{ }}"}
        </button>
      </div>

      {mode === "raw" ? (
        <input
          className={`w6w-expr-raw${masked ? " w6w-secret-input" : ""}`}
          type="text"
          value={raw}
          readOnly={readOnly}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onRawChange(e.target.value)}
        />
      ) : (
        <div
          ref={editorRef}
          className={`w6w-expr-editor${masked ? " is-masked" : ""}${empty ? " is-empty" : ""}${
            readOnly ? " is-readonly" : ""
          }`}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          role="textbox"
          tabIndex={readOnly ? -1 : 0}
          aria-multiline="false"
          aria-label={ariaLabel}
          data-placeholder={placeholder ?? ""}
          spellCheck={false}
          onInput={syncFromDom}
          onClick={onEditorClick}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault(); // single-line value field
          }}
        />
      )}
    </div>
  );
}
