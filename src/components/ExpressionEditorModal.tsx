import { useLayoutEffect, useRef, useState } from "react";
import type { ExprPart, ExprValue, SecretValue } from "../types.ts";
import type { ExpressionOptions } from "./ExpressionOptions.tsx";
import { Modal } from "./Modal.tsx";
import { insertNodeAtCaret, makeChip, paintParts, readParts } from "./expression-dom.ts";
import { partsToValue, serializeTemplate, valueToParts } from "./expression-template.ts";

/**
 * A near-full-screen editor for an expression value. Left: the data sources in
 * scope (variables, secrets, and the workflow state leading to this step) — one
 * click inserts a colored TAG (chip) at the caret. Right: the expression editor
 * (top, where tags read distinctly from plain text) over the `{{ }}` template
 * form that gets saved (bottom).
 *
 * The value it saves is the same `ExprValue | string` the inline field and the
 * engine already use (see `expression-template.ts` / `expression-dom.ts`).
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

export function ExpressionEditorModal({
  value,
  masked,
  options,
  fieldLabel,
  onSave,
  onClose,
}: ExpressionEditorModalProps) {
  const [parts, setParts] = useState<ExprPart[]>(() => valueToParts(value).parts);
  // Bumped only for programmatic repaints (mount); typing/insert mutate the DOM
  // directly and sync out, so the caret is never clobbered.
  const [paintGen] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: paint once on mount; edits flow through the DOM.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (el) paintParts(el, parts);
  }, [paintGen]);

  const sync = () => {
    const el = editorRef.current;
    if (el) setParts(readParts(el));
  };

  const insertPart = (part: ExprPart) => {
    const el = editorRef.current;
    if (!el) return;
    insertNodeAtCaret(el, makeChip(el.ownerDocument, part));
    setParts(readParts(el));
  };

  const save = () => {
    const el = editorRef.current;
    onSave(partsToValue(el ? readParts(el) : parts));
    onClose();
  };

  const vars = options.vars ?? [];
  const secrets = options.secrets ?? [];
  const inputs = options.inputs ?? [];
  const datasets = options.datasets ?? [];
  const steps = options.steps ?? [];
  const hasState = steps.length > 0 || !!options.hasTrigger;
  const template = serializeTemplate(parts);

  const source = (label: string, part: ExprPart, cls: string, sigil: string) => (
    <button
      key={`${part.kind}:${part.ref ?? label}`}
      type="button"
      className={`w6w-exprmodal-source ${cls}`}
      title={`Insert ${label}`}
      onClick={() => insertPart(part)}
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
            {vars.map((v) =>
              source(v, { kind: "var", ref: `vars.${v}` }, "w6w-expr-chip-var", "{x}"),
            )}
          </div>

          <div className="w6w-exprmodal-group">
            <span className="w6w-exprmodal-group-label">Secrets</span>
            {secrets.length === 0 && <span className="w6w-expr-menu-empty">No secrets</span>}
            {secrets.map((s) =>
              source(s, { kind: "secret", ref: s }, "w6w-expr-chip-secret", "🔒"),
            )}
          </div>

          <div className="w6w-exprmodal-group">
            <span className="w6w-exprmodal-group-label">Inputs</span>
            {inputs.length === 0 && <span className="w6w-expr-menu-empty">No inputs</span>}
            {inputs.map((i) =>
              source(i, { kind: "var", ref: `inputs.${i}` }, "w6w-expr-chip-var", "⇥"),
            )}
          </div>

          <div className="w6w-exprmodal-group">
            <span className="w6w-exprmodal-group-label">Datasets</span>
            {datasets.length === 0 && <span className="w6w-expr-menu-empty">No datasets</span>}
            {datasets.map((d) =>
              source(d, { kind: "var", ref: `datasets.${d}` }, "w6w-expr-chip-var", "▦"),
            )}
          </div>

          {hasState && (
            <div className="w6w-exprmodal-group">
              <span className="w6w-exprmodal-group-label">Workflow state</span>
              {options.hasTrigger &&
                source(
                  "trigger.event",
                  { kind: "var", ref: "trigger.event" },
                  "w6w-expr-chip-var",
                  "⚡",
                )}
              {steps.map((st) =>
                source(
                  st.label ?? st.id,
                  { kind: "var", ref: `steps.${st.id}.output` },
                  "w6w-expr-chip-var",
                  "▸",
                ),
              )}
            </div>
          )}
        </aside>

        {/* Right: editor over the saved {{ }} template. */}
        <div className="w6w-exprmodal-main">
          <div className="w6w-exprmodal-editor">
            <span className="w6w-exprmodal-pane-label">
              Expression
              <span className="w6w-muted w6w-small"> — click a source on the left, or type</span>
            </span>
            <div
              ref={editorRef}
              className={`w6w-exprmodal-chips${masked ? " is-masked" : ""}${
                parts.length === 0 ? " is-empty" : ""
              }`}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              tabIndex={0}
              aria-label="Expression"
              data-placeholder="Type text and insert {x} variables, 🔒 secrets, or ▸ step outputs…"
              spellCheck={false}
              onInput={sync}
              onClick={(e) => {
                const x = (e.target as HTMLElement).closest("[data-x]");
                if (!x) return;
                e.preventDefault();
                x.closest(".w6w-expr-chip")?.remove();
                sync();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
            />
          </div>
          <div className="w6w-exprmodal-preview">
            <span className="w6w-exprmodal-pane-label">
              Template
              <span className="w6w-muted w6w-small"> — the {"{{ }}"} form that gets saved</span>
            </span>
            <pre className="w6w-exprmodal-template">{template || " "}</pre>
          </div>
        </div>
      </div>
    </Modal>
  );
}
