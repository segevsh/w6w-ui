import type { EditorView } from "@codemirror/view";
import { type ReactNode, useRef, useState } from "react";
import { CodeEditor } from "../CodeEditor.tsx";
import { type ScriptLanguage, codeReadFor } from "../script-bindings.ts";
import type { ActionParam } from "../types.ts";
import { ExpressionEditorModal } from "./ExpressionEditorModal.tsx";
import { useExpressionOptions } from "./ExpressionOptions.tsx";
import { wholeValueRef } from "./json-compose.ts";

/**
 * A Run script's code (`ActionParam.scriptReads`). The host never substitutes `{{ }}` in code, so
 * every way of inserting data here writes the code read instead: a step chip inserts
 * `run.nodes.<id>.output`, and ƒx opens the reference picker and inserts what was picked as
 * `run.nodes.…`, `state.…` or `consts.…` (Python indexes them). Below the editor: one short
 * line, and a collapsed "How to read data" with three examples in the step's language.
 */
export function ScriptCodeField({
  param,
  value,
  language,
  label,
  req,
  readOnly,
  onChange,
}: {
  param: ActionParam;
  value: string;
  language: ScriptLanguage;
  label: string;
  req: ReactNode;
  readOnly?: boolean;
  onChange: (next: string) => void;
}) {
  const view = useRef<EditorView | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const exprOptions = useExpressionOptions();
  const steps = exprOptions.steps ?? [];
  const python = language === "python";

  const insert = (text: string) => {
    const v = view.current;
    if (!v) {
      onChange(value + text);
      return;
    }
    v.dispatch(v.state.replaceSelection(text));
    v.focus();
  };
  // The picker hands back `"{{ ref }}"`, or a composed JSON value holding such strings: insert
  // the code read, with each reference inside a composed value spelled the same way.
  const insertPicked = (picked: unknown) => {
    const ref = wholeValueRef(picked);
    if (ref !== null) {
      const read = codeReadFor(ref, language);
      if (read) insert(read);
      return;
    }
    if (picked === undefined || picked === "") return;
    insert(
      JSON.stringify(picked, null, 2).replace(
        /"\{\{\s*([^{}"]*?)\s*\}\}"/g,
        (m, r: string) => codeReadFor(r, language) ?? m,
      ),
    );
  };

  const stepId = steps[0]?.id ?? "<step-id>";
  const examples = python
    ? [
        [`run["nodes"]["${stepId}"]["output"]`, "a step's output"],
        ['state["region"]', "a workflow state value"],
        ['consts["api_base"]', "a constant"],
      ]
    : [
        [`run.nodes.${stepId}.output`, "a step's output"],
        ["state.region", "a workflow state value"],
        ["consts.api_base", "a constant"],
      ];
  const width = Math.max(...examples.map(([c]) => c.length));
  const comment = python ? "#" : "//";

  return (
    <div className="w6w-field w6w-script-code">
      <span>
        {label}
        {req}
      </span>
      <CodeEditor
        value={value}
        readOnly={readOnly}
        minHeight="180px"
        language={python ? "python" : "javascript"}
        aria-label={`${param.key} code`}
        onChange={onChange}
        onCreateEditor={(v) => {
          view.current = v;
        }}
      />
      {!readOnly && (
        <div className="w6w-seed-chips w6w-script-insert">
          <span className="w6w-muted w6w-small">Insert</span>
          {steps.map((s) => {
            const read = codeReadFor(`nodes.${s.id}.output`, language) ?? "";
            return (
              <button
                key={s.id}
                type="button"
                className="w6w-chip w6w-seed-chip"
                title={`Insert ${read}`}
                onClick={() => insert(read)}
              >
                <code>{s.id}</code>
              </button>
            );
          })}
          <button
            type="button"
            className="w6w-chip w6w-seed-chip"
            title="Pick a step field, variable or constant to insert as code"
            aria-label={`Insert a value into ${label}`}
            onClick={() => setPickerOpen(true)}
          >
            ƒx
          </button>
        </div>
      )}
      {param.hint && <span className="w6w-hint">{param.hint}</span>}
      <details className="w6w-script-help">
        <summary className="w6w-muted w6w-small">How to read data</summary>
        <pre className="w6w-script-help-examples">
          {examples.map(([code, what]) => `${code.padEnd(width)}  ${comment} ${what}`).join("\n")}
        </pre>
        <span className="w6w-hint">
          <code>input</code> is the same as <code>run</code> unless you set Custom input.
        </span>
        <span className="w6w-hint">
          <code>state.nodes…</code> is the older spelling of <code>run.nodes…</code> and still works
          in saved scripts; use <code>run.nodes…</code> in new ones.
        </span>
      </details>
      {pickerOpen && (
        <ExpressionEditorModal
          mode="json-binding"
          value={undefined}
          jsonValue={undefined}
          options={exprOptions}
          fieldLabel={label}
          whole
          onSaveJson={insertPicked}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
