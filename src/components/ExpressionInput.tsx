import { useEffect, useRef, useState } from "react";
import {
  type ExprPart,
  type ExprPartKind,
  type ExprValue,
  type SecretValue,
  isExprValue,
  isSecretValue,
} from "../types.ts";
import { useExpressionOptions } from "./ExpressionOptions.tsx";

/**
 * ExpressionInput — a single field that reads like a textbox but whose contents
 * are ordered SEGMENTS. Each segment has its own look:
 *   - `text`   — plain editable text (the default, typed inline).
 *   - `var`    — a chip rendered as `{{ var.NAME }}`.
 *   - `secret` — a distinct chip rendered as `***` (masked; the client NEVER
 *                shows secret plaintext — task 2.3).
 *   - `expr`   — a chip holding an inline expression.
 *
 * Value in ↔ out (the client-side parser/serializer lives here):
 *   - Incoming `value` may be a plain string, an `ExprValue` envelope, or a
 *     `SecretValue` envelope (an already-encrypted secret at rest → shown as a
 *     masked `***` chip, never the ciphertext).
 *   - `onChange` emits the leanest faithful form: a pure single-text value
 *     serializes back to a plain string (backward-compat); mixed content
 *     serializes to `{ type: "expr", parts: [...] }`.
 *
 * The var/secret PICKER (task 3.2) offers the names in scope: pass them via the
 * `options` prop, or provide them once for a whole subtree through an
 * `ExpressionOptionsProvider` (how the workflow editor feeds project
 * vars/secrets). Names can also be entered by hand. For a secret-typed field
 * (`masked`) the Secrets group is surfaced first so picking one is one click.
 */
export interface ExpressionInputProps {
  /** Current value — a plain string, an expression envelope, or a sealed secret. */
  value: ExprValue | string | SecretValue | undefined;
  /** Fired with the next value: a plain string when pure-text, else an ExprValue. */
  onChange: (next: ExprValue | string) => void;
  /** Placeholder shown when the field is empty. */
  placeholder?: string;
  /** Mask typed text as dots (used for secret-typed params). */
  masked?: boolean;
  readOnly?: boolean;
  /**
   * Picker data (task 3.2): known names to offer in the insert menu. When
   * omitted, names come from the nearest `ExpressionOptionsProvider` (the editor
   * supplies project vars/secrets there); an explicit prop overrides it. Either
   * way authors can still type a name by hand.
   */
  options?: { vars?: string[]; secrets?: string[] };
  "aria-label"?: string;
}

/** An {@link ExprPart} with a stable id so React keys survive edits/reorders. */
interface EditorPart extends ExprPart {
  id: string;
}

let partSeq = 0;
const nextId = () => `p${++partSeq}`;

const textPart = (value = ""): EditorPart => ({ id: nextId(), kind: "text", value });

/** Parse an incoming value into editable parts (+ any sealed secret to display). */
function seed(value: ExpressionInputProps["value"]): {
  parts: EditorPart[];
  sealed: SecretValue | null;
} {
  if (isSecretValue(value)) return { parts: [], sealed: value };
  if (isExprValue(value)) {
    return {
      parts: value.parts.map((p) => ({ ...p, id: nextId() })),
      sealed: null,
    };
  }
  const s = typeof value === "string" ? value : "";
  return { parts: s ? [textPart(s)] : [], sealed: null };
}

/** Drop editor-only fields, keeping only what the wire shape carries per kind. */
function toWirePart(p: EditorPart): ExprPart {
  if (p.kind === "text") return { kind: "text", value: p.value ?? "" };
  if (p.kind === "expr") return { kind: "expr", expr: p.expr };
  return { kind: p.kind, ref: p.ref ?? "" }; // var | secret
}

/**
 * Serialize parts to the leanest faithful value. Empty text segments are pruned;
 * a lone text segment collapses to a plain string (backward-compat); anything
 * mixed becomes an `ExprValue`.
 */
function serialize(parts: EditorPart[]): ExprValue | string {
  const cleaned = parts.filter((p) => p.kind !== "text" || (p.value ?? "") !== "");
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1 && cleaned[0].kind === "text") return cleaned[0].value ?? "";
  return { type: "expr", parts: cleaned.map(toWirePart) };
}

/** Ensure the last segment is an editable text slot so typing can continue. */
function withTrailingText(parts: EditorPart[]): EditorPart[] {
  const last = parts[parts.length - 1];
  if (last && last.kind === "text") return parts;
  return [...parts, textPart()];
}

/** Human label for a chip. Secrets are ALWAYS masked — never the ref plaintext. */
function chipLabel(p: EditorPart): string {
  if (p.kind === "var") return `{{ var.${p.ref ?? ""} }}`;
  if (p.kind === "secret") return "***";
  return "ƒx";
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
  // Seed once from the initial value and own the parts thereafter — the parent
  // re-keys this component per field (like the other ParamsForm widgets), so we
  // don't fight our own onChange echoes. `sealed` holds an at-rest secret to
  // display; editing is disabled until the author replaces it.
  const [{ parts, sealed }, setState] = useState(() => {
    const s = seed(value);
    return { parts: readOnly ? s.parts : withTrailingText(s.parts), sealed: s.sealed };
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [varName, setVarName] = useState("");
  const [secretName, setSecretName] = useState("");
  const insertRef = useRef<HTMLDivElement>(null);
  // Fall back to the provider-supplied names when no explicit `options` prop was
  // passed — an explicit prop wins so a caller can still scope names per field.
  const ctxOptions = useExpressionOptions();
  const resolved = options ?? ctxOptions;

  // Click-away closes the insert menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!insertRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  // Commit a new parts array: keep a trailing text slot for editing, push up the
  // serialized value.
  const commit = (next: EditorPart[]) => {
    const withText = withTrailingText(next);
    setState((s) => ({ ...s, parts: withText }));
    onChange(serialize(withText));
  };

  const patch = (id: string, changes: Partial<EditorPart>) =>
    commit(parts.map((p) => (p.id === id ? { ...p, ...changes } : p)));

  const remove = (id: string) => commit(parts.filter((p) => p.id !== id));

  const insert = (part: EditorPart) => {
    commit([...parts, part]);
    setMenuOpen(false);
    setVarName("");
    setSecretName("");
  };

  const insertReference = (kind: ExprPartKind, ref: string) => {
    if (!ref.trim()) return;
    insert({ id: nextId(), kind, ref: ref.trim() });
  };

  // An at-rest secret: show a single masked chip; ciphertext is never rendered.
  // "Replace" clears it and drops into edit mode with an empty value.
  if (sealed) {
    return (
      <div className={`w6w-expr-input${readOnly ? " is-readonly" : ""}`}>
        <span className="w6w-expr-chip w6w-expr-chip-secret" title="Encrypted secret">
          ***
        </span>
        {!readOnly && (
          <button
            type="button"
            className="w6w-expr-replace"
            onClick={() => {
              setState({ parts: withTrailingText([]), sealed: null });
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
  const isEmpty = parts.every((p) => p.kind === "text" && !(p.value ?? ""));

  // The two picker groups. For a secret-typed field (`masked`) the Secret group
  // is surfaced first and flagged primary, so choosing a secret is one click.
  const varGroup = (
    <div className="w6w-expr-menu-group" key="vars">
      <span className="w6w-expr-menu-label">Variables</span>
      {vars.map((v) => (
        <button
          key={v}
          type="button"
          className="w6w-expr-menu-item"
          onClick={() => insertReference("var", v)}
        >
          {`{{ var.${v} }}`}
        </button>
      ))}
      {vars.length === 0 && <span className="w6w-expr-menu-empty">No variables yet</span>}
      <div className="w6w-expr-menu-add">
        <input
          type="text"
          value={varName}
          placeholder="name…"
          aria-label="Variable name"
          onChange={(e) => setVarName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              insertReference("var", varName);
            }
          }}
        />
        <button
          type="button"
          className="w6w-btn w6w-btn-ghost w6w-btn-sm"
          disabled={!varName.trim()}
          onClick={() => insertReference("var", varName)}
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
          onClick={() => insertReference("secret", s)}
        >
          {`${s} (***)`}
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
            if (e.key === "Enter") {
              e.preventDefault();
              insertReference("secret", secretName);
            }
          }}
        />
        <button
          type="button"
          className="w6w-btn w6w-btn-ghost w6w-btn-sm"
          disabled={!secretName.trim()}
          onClick={() => insertReference("secret", secretName)}
        >
          Add
        </button>
      </div>
    </div>
  );

  return (
    <div className={`w6w-expr-input${readOnly ? " is-readonly" : ""}`} aria-label={ariaLabel}>
      {parts.map((p, i) => {
        if (p.kind === "text") {
          const text = p.value ?? "";
          return (
            <input
              key={p.id}
              className={`w6w-expr-text${masked ? " w6w-secret-input" : ""}`}
              type="text"
              value={text}
              readOnly={readOnly}
              // Size to content so segments sit inline like one continuous field.
              size={Math.max(text.length, i === 0 && isEmpty ? (placeholder?.length ?? 8) : 1)}
              placeholder={i === 0 && isEmpty ? placeholder : undefined}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              onChange={(e) => patch(p.id, { value: e.target.value })}
            />
          );
        }
        if (p.kind === "expr") {
          const raw = typeof p.expr === "string" ? p.expr : JSON.stringify(p.expr ?? "");
          return (
            <span key={p.id} className="w6w-expr-chip w6w-expr-chip-expr" title="Expression">
              <span className="w6w-expr-chip-sigil">ƒ</span>
              <input
                className="w6w-expr-expr-input"
                type="text"
                value={raw}
                readOnly={readOnly}
                size={Math.max(raw.length, 3)}
                placeholder="expr"
                aria-label="Expression"
                // Stored as the raw authored string; the engine/server parses the
                // JSONLogic at resolve time (core value model, task-later).
                onChange={(e) => patch(p.id, { expr: e.target.value })}
              />
              {!readOnly && (
                <button
                  type="button"
                  className="w6w-expr-chip-x"
                  aria-label="Remove expression"
                  title="Remove"
                  onClick={() => remove(p.id)}
                >
                  ×
                </button>
              )}
            </span>
          );
        }
        // var | secret — a reference chip. Secret is masked as `***`.
        return (
          <span
            key={p.id}
            className={`w6w-expr-chip w6w-expr-chip-${p.kind}`}
            title={p.kind === "secret" ? `Secret: ${p.ref ?? ""}` : `Variable: ${p.ref ?? ""}`}
          >
            {chipLabel(p)}
            {!readOnly && (
              <button
                type="button"
                className="w6w-expr-chip-x"
                aria-label={`Remove ${p.kind}`}
                title="Remove"
                onClick={() => remove(p.id)}
              >
                ×
              </button>
            )}
          </span>
        );
      })}

      {!readOnly && (
        <div className="w6w-expr-insert" ref={insertRef}>
          <button
            type="button"
            className="w6w-expr-insert-btn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Insert variable, secret, or expression"
            onClick={() => setMenuOpen((o) => !o)}
          >
            + Insert
          </button>
          {menuOpen && (
            <div className="w6w-expr-menu" role="menu">
              {masked ? [secretGroup, varGroup] : [varGroup, secretGroup]}

              <div className="w6w-expr-menu-group">
                <button
                  type="button"
                  className="w6w-expr-menu-item"
                  onClick={() => insert({ id: nextId(), kind: "expr", expr: "" })}
                >
                  ƒ Expression…
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
