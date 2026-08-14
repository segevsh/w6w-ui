import { useLayoutEffect, useRef, useState } from "react";
import type { ExprValue, SecretValue } from "../types.ts";
import { ExpressionEditorModal } from "./ExpressionEditorModal.tsx";
import { useExpressionOptions } from "./ExpressionOptions.tsx";
import {
  ensureFillerBreak,
  insertNodeAtCaret,
  paintParts,
  placeCaretAtEnd,
  readParts,
} from "./expression-dom.ts";
import { partsToValue, valueToParts } from "./expression-template.ts";

/**
 * ExpressionInput — a single field that reads like a textbox but whose contents
 * are inline SEGMENTS: plain text plus var/secret/expr chips (Notion/Zapier
 * blocks). You can type directly; to browse the data sources in scope
 * (variables, secrets, upstream step outputs) and build a reference, open the
 * full editor via the ƒx button — see {@link ExpressionEditorModal}.
 *
 * Value in ↔ out: incoming `value` is a plain string, an `ExprValue`, or a
 * sealed `SecretValue`. `onChange` emits the leanest faithful form — a plain
 * string when pure-text, an `ExprValue` for mixed content, or a sealed
 * `SecretValue` once a masked field is encrypted.
 */
export interface ExpressionInputProps {
  value: ExprValue | string | SecretValue | undefined;
  onChange: (next: ExprValue | string | SecretValue) => void;
  placeholder?: string;
  /** Mask typed text as dots + seal on blur (used for secret-typed params). */
  masked?: boolean;
  /**
   * The underlying param holds multi-line text (a `text`-typed param, or one
   * flagged `config.multiline` — the same fields that render a `textarea`).
   * Enter then inserts a literal `"\n"` at the caret instead of being swallowed,
   * and `aria-multiline` follows. Omitted ⇒ single-line, as every existing
   * consumer expects.
   */
  multiline?: boolean;
  readOnly?: boolean;
  /** Picker data; falls back to the nearest `ExpressionOptionsProvider`. */
  options?: { vars?: string[]; secrets?: string[] };
  "aria-label"?: string;
}

export function ExpressionInput({
  value,
  onChange,
  placeholder,
  masked,
  multiline,
  readOnly,
  options,
  "aria-label": ariaLabel,
}: ExpressionInputProps) {
  // Seed once and own the content thereafter — the parent re-keys this widget
  // per field, so we never fight our own onChange echoes.
  const [state, setState] = useState(() => valueToParts(value));
  const { parts, sealed } = state;
  const [paintGen, setPaintGen] = useState(0);
  const [sealing, setSealing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const wantFocus = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const ctxOptions = useExpressionOptions();
  // Merge so an explicit `options` prop can override vars/secrets while the
  // richer context sources (steps, trigger, sealSecret) still flow through.
  const resolved = { ...ctxOptions, ...(options ?? {}) };
  const sealSecret = ctxOptions.sealSecret;

  // Paint the editor DOM from `parts` on programmatic changes only (mount,
  // modal save, seal/replace) — never on keystrokes (would clobber the caret).
  // biome-ignore lint/correctness/useExhaustiveDependencies: repaint is gated on paintGen, never on `parts`.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el || sealed) return;
    paintParts(el, parts);
    if (wantFocus.current || el.ownerDocument.activeElement === el) {
      el.focus();
      placeCaretAtEnd(el);
      wantFocus.current = false;
    }
  }, [paintGen, sealed]);

  const syncFromDom = () => {
    const el = editorRef.current;
    if (!el) return;
    const next = readParts(el);
    setState((s) => ({ ...s, parts: next }));
    onChange(partsToValue(next));
  };

  // A masked field must never leave clear text: seal a plain typed value into a
  // `{type:"secret"}` envelope via the host (the client has no key).
  const sealPlain = async (v: string) => {
    if (!sealSecret) return false;
    setSealing(true);
    try {
      const env = await sealSecret(v);
      wantFocus.current = false;
      setState({ parts: [], sealed: env });
      setPaintGen((g) => g + 1);
      onChange(env);
      return true;
    } catch {
      return false; // keep the value; the server still encrypts at rest on save
    } finally {
      setSealing(false);
    }
  };

  // Seal on blur — but not while the editor modal is open (focus moved there).
  //
  // Deliberate behaviour change (CONDUCTOR AMENDMENT 2026-08-14, T1.2.2):
  // `valueToParts`'s string arm now root-anchor-parses, so a masked field
  // holding a ROOTED `{{ vars.x }}` yields an `ExprValue` here — `typeof v ===
  // "string"` is false, and it no longer seals (sealing would encrypt the
  // template text and permanently break resolution). A masked field holding
  // an UNROOTED placeholder like `{{name}}` still parses to a plain string
  // and still seals, exactly as before — see `expression-template.test.ts`'s
  // CA-4 tests for both arms.
  const onLeave = (e: React.FocusEvent) => {
    if (modalOpen || !masked || readOnly || sealing) return;
    const next = e.relatedTarget as Node | null;
    if (next && wrapperRef.current?.contains(next)) return;
    const v = partsToValue(parts);
    if (typeof v === "string" && v !== "") void sealPlain(v);
  };

  // Adopt a value from the modal: re-seed + repaint. For a masked field a plain
  // string is sealed instead of stored in the clear.
  const adopt = (next: ExprValue | string) => {
    if (masked && typeof next === "string" && next.trim() !== "") {
      void sealPlain(next);
      return;
    }
    wantFocus.current = false;
    setState(valueToParts(next));
    setPaintGen((g) => g + 1);
    onChange(next);
  };

  // A sealed at-rest secret: a single masked chip; ciphertext is never rendered.
  if (sealed) {
    return (
      <div className={`w6w-expr-sealed${readOnly ? " is-readonly" : ""}`} aria-label={ariaLabel}>
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

  return (
    <div className="w6w-expr" ref={wrapperRef} onBlur={onLeave}>
      <div className="w6w-expr-field">
        <div
          ref={editorRef}
          className={`w6w-expr-editor${masked ? " is-masked" : ""}${
            parts.length === 0 ? " is-empty" : ""
          }${readOnly ? " is-readonly" : ""}`}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          role="textbox"
          tabIndex={readOnly ? -1 : 0}
          aria-multiline={multiline ? "true" : "false"}
          aria-label={ariaLabel}
          data-placeholder={placeholder ?? ""}
          spellCheck={false}
          onInput={syncFromDom}
          onClick={(e) => {
            const x = (e.target as HTMLElement).closest("[data-x]");
            if (!x) return;
            e.preventDefault();
            x.closest(".w6w-expr-chip")?.remove();
            syncFromDom();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // ALWAYS suppressed — with or without Shift, multiline or not. Left
            // to itself the browser wraps the caret's line in a <div> (or drops
            // a <br>), which is markup we neither paint nor want to depend on.
            e.preventDefault();
            if (!multiline) return; // single-line value field
            const el = editorRef.current;
            if (!el) return;
            // The break is OUR literal "\n" text node, inserted with the same
            // caret helper the chip picker uses. `.w6w-expr-editor` is
            // `pre-wrap`, so it renders as a break; `readParts` reads it back
            // verbatim. The filler keeps a break at the very END visible (and is
            // skipped by `readParts`, so it never reaches the value).
            insertNodeAtCaret(el, el.ownerDocument.createTextNode("\n"));
            ensureFillerBreak(el);
            syncFromDom();
          }}
        />
        {!readOnly && (
          <button
            type="button"
            className="w6w-expr-edit"
            title="Edit expression — browse variables, secrets & step outputs"
            aria-label="Edit expression"
            onClick={() => setModalOpen(true)}
          >
            ƒx
          </button>
        )}
      </div>

      {modalOpen && (
        <ExpressionEditorModal
          value={partsToValue(parts)}
          masked={masked}
          multiline={multiline}
          options={resolved}
          fieldLabel={ariaLabel}
          onSave={adopt}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
