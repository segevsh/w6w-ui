import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ExprPart, ExprValue, SecretValue } from "../types.ts";
import type { ExpressionOptions } from "./ExpressionOptions.tsx";
import { Modal } from "./Modal.tsx";
import {
  ensureFillerBreak,
  insertNodeAtCaret,
  isRefSafeKey,
  makeChip,
  paintParts,
  placeCaretAtEnd,
  readParts,
  varLabel,
} from "./expression-dom.ts";
import {
  parseTemplate,
  partsToValue,
  renderResult,
  serializeTemplate,
  valueToParts,
} from "./expression-template.ts";

/**
 * A near-full-screen editor for an expression value. Left: the data sources in
 * scope (variables, secrets, and the workflow state leading to this step) — one
 * click inserts a colored TAG (chip) at the caret. Right: the expression editor
 * (top, where tags read distinctly from plain text) over the `{{ }}` template
 * form that gets saved plus a live Result pane (bottom) that previews the
 * expression against user-supplied sample values for the injected scope.
 *
 * The value it saves is the same `ExprValue | string` the inline field and the
 * engine already use (see `expression-template.ts` / `expression-dom.ts`).
 */
export interface ExpressionEditorModalProps {
  value: ExprValue | string | SecretValue | undefined;
  masked?: boolean;
  /**
   * The field being edited holds multi-line text (a `text`-typed param, or one
   * flagged `config.multiline`). Enter then inserts a literal `"\n"` at the
   * caret instead of being swallowed, and `aria-multiline` follows. Omitted ⇒
   * single-line, as every existing consumer expects.
   */
  multiline?: boolean;
  options: ExpressionOptions;
  /** Field name shown in the modal title. */
  fieldLabel?: string;
  onSave: (next: ExprValue | string) => void;
  onClose: () => void;
}

export function ExpressionEditorModal({
  value,
  masked,
  multiline,
  options,
  fieldLabel,
  onSave,
  onClose,
}: ExpressionEditorModalProps) {
  const [parts, setParts] = useState<ExprPart[]>(() => valueToParts(value).parts);
  // Bumped ONLY for programmatic repaints — mount, and committing template
  // text back into chips. Typing/insert mutate the DOM directly and sync out,
  // so the caret is never clobbered; NEVER bump this from `onInput`,
  // `insertPart`, the Enter handler, or a chip flip.
  const [paintGen, setPaintGen] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  // Set right before a programmatic paint that should also move focus/caret
  // into the chips editor — never on the mount paint.
  const focusChipsAfterPaint = useRef(false);
  // User-supplied sample values (keyed by var ref) that the Result pane previews
  // the expression against. Design-time only — never sent to the engine.
  const [samples, setSamples] = useState<Record<string, string>>({});

  // biome-ignore lint/correctness/useExhaustiveDependencies: paint on `paintGen`, not on every `parts` change; edits otherwise flow through the DOM.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // renderToggle: true — the modal is the one surface with a click delegate
    // for `[data-render-toggle]` (below); `ExpressionInput.tsx` never opts in.
    paintParts(el, parts, { renderToggle: true });
    if (focusChipsAfterPaint.current) {
      focusChipsAfterPaint.current = false;
      placeCaretAtEnd(el);
      el.focus();
    }
  }, [paintGen]);

  const sync = () => {
    const el = editorRef.current;
    if (el) setParts(readParts(el));
  };

  const insertPart = (part: ExprPart) => {
    const el = editorRef.current;
    if (!el) return;
    insertNodeAtCaret(el, makeChip(el.ownerDocument, part, { renderToggle: true }));
    setParts(readParts(el));
  };

  // A render part can only ever be authored by flipping an EXISTING var chip
  // (below) — never inserted directly — so this is derived from `parts` on
  // every render, not computed once at mount: flipping mid-edit must disable
  // the control below immediately, and flipping back must re-enable it.
  const hasRenderPart = parts.some((p) => p.kind === "render");

  // Adopt a text form as the parts and repaint the chips editor with focus
  // restored — the chip-ify commit mechanism: parse `text`, set it as the new
  // `parts`, and bump `paintGen` so the `useLayoutEffect` above repaints and
  // moves the caret into the chips editor. No caller in this file today; the
  // typed-`{{ }}` chip-ify commit wires it up.
  const adoptText = (text: string) => {
    setParts(parseTemplate(text));
    focusChipsAfterPaint.current = true;
    setPaintGen((g) => g + 1);
  };
  // `tsconfig.json`'s `noUnusedLocals` rejects a truly callerless const —
  // this reference keeps it "used" without calling it, until the typed-`{{ }}`
  // chip-ify commit wires a real call site in.
  void adoptText;

  const save = () => {
    const el = editorRef.current;
    onSave(partsToValue(el ? readParts(el) : parts));
    onClose();
  };

  const vars = options.vars ?? [];
  const secrets = options.secrets ?? [];
  const inputs = options.inputs ?? [];
  const documents = options.documents ?? [];
  const steps = options.steps ?? [];
  const hasState = steps.length > 0 || !!options.hasTrigger;
  const template = serializeTemplate(parts);

  // The sample map the Result pane previews against: host-seeded defaults
  // (real project vars/documents, keyed by full ref) overlaid by anything the
  // author typed into the Sample values box, which takes precedence. Non-string
  // seeds are stringified for the text preview.
  const effectiveSamples = useMemo(() => {
    const seeded: Record<string, string> = {};
    for (const [ref, v] of Object.entries(options.sampleValues ?? {})) {
      seeded[ref] = typeof v === "string" ? v : JSON.stringify(v);
    }
    return { ...seeded, ...samples };
  }, [options.sampleValues, samples]);

  // The distinct var refs the current expression reads (first-seen order) — the
  // in-scope roots the author can supply sample values for.
  const usedRefs = useMemo(() => {
    const seen = new Set<string>();
    const refs: string[] = [];
    for (const p of parts) {
      if (p.kind === "var" && p.ref && !seen.has(p.ref)) {
        seen.add(p.ref);
        refs.push(p.ref);
      }
    }
    return refs;
  }, [parts]);

  // Best-effort client-side preview of the expression against the sample values.
  // TODO(HITL-2): `@w6w/expr` is a Deno/JSR package that isn't resolvable in the
  // ui Node/pnpm toolchain (not a dependency here), so inline JSONLogic (`expr`
  // parts) can't be evaluated client-side — we fall back to rendering the
  // resolved `{{ }}` template: substitute sample values for var refs, mask
  // secrets, and keep the `{{ … }}` form for anything we can't resolve. Never
  // throws on an un-evaluable expression.
  const result = useMemo(() => {
    try {
      return renderResult(parts, effectiveSamples);
    } catch {
      // Last-resort fallback — the pane must never throw.
      return template;
    }
  }, [parts, effectiveSamples, template]);

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
          {/* Take the field back OUT of expression mode. It saves the `{{ }}`
              TEXT form, so the content survives exactly as the old expr→text
              toggle made it — a lone text part collapses to a plain string in
              `partsToValue`, so the field renders its plain widget again.
              Hidden when `masked`: a sealed secret has no text form. */}
          {!masked && (
            <button
              type="button"
              className="w6w-btn w6w-btn-ghost"
              disabled={hasRenderPart}
              title={
                hasRenderPart
                  ? "Unavailable — a render part has no plain-text form. Flip it back to a variable first."
                  : "Close the expression and keep the text as a literal value"
              }
              onClick={() => {
                onSave(serializeTemplate(parts));
                onClose();
              }}
            >
              Use a plain value
            </button>
          )}
          <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="w6w-btn" onClick={save}>
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
              source(v, { kind: "var", ref: `vars.${v}` }, "w6w-expr-chip-var", "◆"),
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
            <span className="w6w-exprmodal-group-label">Documents</span>
            {documents.length === 0 && <span className="w6w-expr-menu-empty">No documents</span>}
            {documents.map((d) =>
              source(d, { kind: "var", ref: `documents.${d}` }, "w6w-expr-chip-var", "▦"),
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
              {steps.map((st) => {
                // Only keys that can become a ref the ENGINE resolves are
                // offered. The guard lives here, at the one place a ref is
                // built, so it holds for any host that supplies `steps` —
                // not only for the flow editor's own projection.
                const fields = (st.outputs ?? []).filter((o) => isRefSafeKey(o.key));
                return (
                  <Fragment key={st.id}>
                    {/* The whole output — still a real, useful ref on its own,
                        and the author's route to a key the guard dropped. */}
                    {source(
                      st.label ?? st.id,
                      { kind: "var", ref: `steps.${st.id}.output` },
                      "w6w-expr-chip-var",
                      "▸",
                    )}
                    {/* …and one source per DECLARED output field, nested under
                        it. Each SAVES the canonical `steps.<id>.output.<key>`
                        (the only form the engine resolves) and SHOWS
                        `varLabel(ref)`, i.e. the short `<id>.<key>`. The key
                        goes into the ref VERBATIM — `o.label` is display data
                        and must never be substituted into a ref. */}
                    {fields.length > 0 && (
                      <div className="w6w-exprmodal-subsources">
                        {fields.map((o) => {
                          const ref = `steps.${st.id}.output.${o.key}`;
                          return source(
                            varLabel(ref),
                            { kind: "var", ref },
                            "w6w-expr-chip-var",
                            "·",
                          );
                        })}
                      </div>
                    )}
                  </Fragment>
                );
              })}
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
              aria-multiline={multiline ? "true" : "false"}
              aria-label="Expression"
              data-placeholder="Type text and insert {x} variables, 🔒 secrets, or ▸ step outputs…"
              spellCheck={false}
              onInput={() => {
                sync();
              }}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                const x = target.closest("[data-x]");
                if (x) {
                  e.preventDefault();
                  x.closest(".w6w-expr-chip")?.remove();
                  sync();
                  return;
                }
                // The render affordance: flip a var⇄render chip IN PLACE. The
                // ref never changes — only `data-kind` (via a rebuilt chip
                // from the same `data-ref`, `makeChip`'s only construction
                // path) — and this does NOT bump `paintGen`, exactly like the
                // remove control above.
                const toggle = target.closest("[data-render-toggle]");
                if (toggle) {
                  e.preventDefault();
                  const chip = toggle.closest(".w6w-expr-chip") as HTMLElement | null;
                  if (chip) {
                    const ref = chip.getAttribute("data-ref") ?? "";
                    const nextKind = chip.getAttribute("data-kind") === "render" ? "var" : "render";
                    chip.replaceWith(
                      makeChip(chip.ownerDocument, { kind: nextKind, ref }, { renderToggle: true }),
                    );
                  }
                  sync();
                }
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                // ALWAYS suppressed — with or without Shift, multiline or not.
                // The browser's own line break (a wrapper <div>, or a <br>) is
                // markup we neither paint nor want to depend on.
                e.preventDefault();
                if (!multiline) return;
                const el = editorRef.current;
                if (!el) return;
                // Our own literal "\n" text node, via the same caret helper the
                // source picker inserts chips with. `.w6w-exprmodal-chips` is
                // `pre-wrap`, so it renders as a break. The filler keeps a break
                // at the very END visible (and is skipped by `readParts`, so it
                // never reaches the value).
                insertNodeAtCaret(el, el.ownerDocument.createTextNode("\n"));
                ensureFillerBreak(el);
                sync();
              }}
            />
          </div>
          {usedRefs.length > 0 && (
            <div className="w6w-exprmodal-preview">
              <span className="w6w-exprmodal-pane-label">
                Sample values
                <span className="w6w-muted w6w-small">
                  {" "}
                  — try the expression against example data
                </span>
              </span>
              {usedRefs.map((ref) => (
                <label key={ref} className="w6w-field">
                  <span>{ref}</span>
                  <input
                    type="text"
                    value={samples[ref] ?? ""}
                    placeholder="sample value"
                    onChange={(e) => setSamples((s) => ({ ...s, [ref]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          )}
          <div className="w6w-exprmodal-preview">
            <span className="w6w-exprmodal-pane-label">
              Result
              <span className="w6w-muted w6w-small"> — live preview against the sample values</span>
            </span>
            <pre className="w6w-exprmodal-template">{result || " "}</pre>
          </div>
        </div>
      </div>
    </Modal>
  );
}
