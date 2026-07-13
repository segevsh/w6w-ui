import { useMemo, useRef, useState } from "react";
import type { ExprPart, ExprValue, SecretValue } from "../types.ts";
import type { ExpressionOptions } from "./ExpressionOptions.tsx";
import { Modal } from "./Modal.tsx";
import {
  parseTemplate,
  partsToValue,
  serializeTemplate,
  valueToParts,
} from "./expression-template.ts";

/**
 * A near-full-screen editor for an expression value. Left: the data sources in
 * scope (variables, secrets, and the workflow state leading to this step) — one
 * click inserts a `{{ … }}` reference at the caret. Right: the expression editor
 * (top) over a live structural preview (bottom).
 *
 * The editor speaks the `{{ }}` template grammar (see `expression-template.ts`),
 * which is just a serialization of the shared part model — so the value it saves
 * is the same `ExprValue | string` the inline field and the engine already use.
 */
export interface ExpressionEditorModalProps {
  value: ExprValue | string | SecretValue | undefined;
  masked?: boolean;
  options: ExpressionOptions;
  /** Field name shown in the modal title. */
  fieldLabel?: string;
  onSave: (next: ExprValue | string) => void;
  onClose: () => void;
}

/** A `var` ref shows the bare project-var name, but the full path otherwise. */
const varLabel = (ref: string) => (ref.startsWith("vars.") ? ref.slice("vars.".length) : ref);

/** Render the parsed parts as a read-only structural preview (design-time). */
function Preview({ parts, masked }: { parts: ExprPart[]; masked?: boolean }) {
  if (parts.length === 0) {
    return <span className="w6w-muted w6w-small">Nothing yet — insert a source or type text.</span>;
  }
  return (
    <>
      {parts.map((p, i) => {
        const key = i;
        if (p.kind === "text") {
          const t = p.value ?? "";
          return <span key={key}>{masked ? "•".repeat(t.length) : t}</span>;
        }
        if (p.kind === "var") {
          return (
            <span key={key} className="w6w-expr-chip w6w-expr-chip-var">
              <span className="w6w-expr-chip-sigil">{"{x}"}</span>
              <span className="w6w-expr-chip-label">{varLabel(p.ref ?? "")}</span>
            </span>
          );
        }
        if (p.kind === "secret") {
          return (
            <span key={key} className="w6w-expr-chip w6w-expr-chip-secret">
              <span className="w6w-expr-chip-sigil">🔒</span>
              <span className="w6w-expr-chip-label">{p.ref ?? ""}</span>
            </span>
          );
        }
        const raw = typeof p.expr === "string" ? p.expr : JSON.stringify(p.expr ?? "");
        return (
          <span key={key} className="w6w-expr-chip w6w-expr-chip-expr">
            <span className="w6w-expr-chip-sigil">ƒ</span>
            <span className="w6w-expr-chip-label">
              {raw.length > 32 ? `${raw.slice(0, 32)}…` : raw}
            </span>
          </span>
        );
      })}
    </>
  );
}

export function ExpressionEditorModal({
  value,
  masked,
  options,
  fieldLabel,
  onSave,
  onClose,
}: ExpressionEditorModalProps) {
  const [text, setText] = useState(() => serializeTemplate(valueToParts(value).parts));
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const parts = useMemo(() => parseTemplate(text), [text]);

  const vars = options.vars ?? [];
  const secrets = options.secrets ?? [];
  const steps = options.steps ?? [];
  const hasState = steps.length > 0 || !!options.hasTrigger;

  // Insert a `{{ … }}` reference at the caret (or replace the selection).
  const insert = (snippet: string) => {
    const el = areaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + snippet + text.slice(end);
    setText(next);
    // Restore the caret just after the inserted snippet.
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const save = () => {
    onSave(partsToValue(parseTemplate(text)));
    onClose();
  };

  const source = (label: string, snippet: string, cls: string, sigil: string) => (
    <button
      key={snippet}
      type="button"
      className={`w6w-exprmodal-source ${cls}`}
      title={`Insert ${snippet}`}
      onClick={() => insert(snippet)}
    >
      <span className="w6w-expr-chip-sigil">{sigil}</span>
      <span className="w6w-exprmodal-source-label">{label}</span>
    </button>
  );

  return (
    <Modal
      title="Edit expression"
      subtitle={fieldLabel ? <code>{fieldLabel}</code> : undefined}
      onClose={onClose}
      size="full"
      headerRight={
        <div className="w6w-exprmodal-actions">
          <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="w6w-btn w6w-btn-primary" onClick={save}>
            Save
          </button>
        </div>
      }
    >
      <div className="w6w-exprmodal">
        {/* Left: the data sources in scope. */}
        <aside className="w6w-exprmodal-sources">
          <div className="w6w-exprmodal-group">
            <span className="w6w-exprmodal-group-label">Variables</span>
            {vars.length === 0 && <span className="w6w-expr-menu-empty">No variables</span>}
            {vars.map((v) => source(v, `{{ vars.${v} }}`, "w6w-expr-chip-var", "{x}"))}
          </div>

          <div className="w6w-exprmodal-group">
            <span className="w6w-exprmodal-group-label">Secrets</span>
            {secrets.length === 0 && <span className="w6w-expr-menu-empty">No secrets</span>}
            {secrets.map((s) => source(s, `{{ secrets.${s} }}`, "w6w-expr-chip-secret", "🔒"))}
          </div>

          {hasState && (
            <div className="w6w-exprmodal-group">
              <span className="w6w-exprmodal-group-label">Workflow state</span>
              {options.hasTrigger &&
                source("trigger.event", "{{ trigger.event }}", "w6w-expr-chip-var", "⚡")}
              {steps.map((st) =>
                source(st.label ?? st.id, `{{ steps.${st.id}.output }}`, "w6w-expr-chip-var", "▸"),
              )}
            </div>
          )}
        </aside>

        {/* Right: editor over preview. */}
        <div className="w6w-exprmodal-main">
          <div className="w6w-exprmodal-editor">
            <label className="w6w-exprmodal-pane-label" htmlFor="w6w-expr-textarea">
              Expression
              <span className="w6w-muted w6w-small"> — click a source on the left, or type</span>
            </label>
            <textarea
              id="w6w-expr-textarea"
              ref={areaRef}
              className="w6w-exprmodal-textarea"
              value={text}
              spellCheck={false}
              placeholder="Static text and {{ vars.x }} / {{ secrets.y }} / {{ steps.z.output }} references…"
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="w6w-exprmodal-preview">
            <span className="w6w-exprmodal-pane-label">
              Preview
              <span className="w6w-muted w6w-small"> — dynamic values resolve at run time</span>
            </span>
            <div className="w6w-exprmodal-preview-body">
              <Preview parts={parts} masked={masked} />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
