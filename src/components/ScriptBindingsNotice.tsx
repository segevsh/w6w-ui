import { useState } from "react";
import {
  type ScriptLanguage,
  findCodeBindings,
  moveCodeBindingsToInput,
} from "../script-bindings.ts";

/**
 * The Run script Configure tab's warning for `{{ }}` typed into the CODE. The host never
 * substitutes inside code (see `script-bindings.ts`), so such a marker is literal text at run
 * time. Says so, and offers the one explicit fix: move each marker to an `input` read with the
 * binding under Input. Renders nothing when the code has no running marker.
 */
export function ScriptBindingsNotice({
  values,
  readOnly,
  onChange,
}: {
  /** The step's `with`: `code`, `language`, `input`. */
  values: Record<string, unknown>;
  readOnly?: boolean;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const code = typeof values.code === "string" ? values.code : "";
  const language: ScriptLanguage =
    values.language === "python" || values.language === "typescript"
      ? values.language
      : "javascript";
  const found = findCodeBindings(code, language);
  if (found.length === 0) return null;
  const move = () => {
    const r = moveCodeBindingsToInput(code, values.input, language);
    if (!r.ok) {
      setRefusal(r.reason);
      return;
    }
    setRefusal(
      r.left > 0
        ? `${r.left} reference${r.left === 1 ? " sits" : "s sit"} inside a longer Python string — rewrite ${r.left === 1 ? "it" : "them"} to read from input.`
        : null,
    );
    onChange({ ...values, code: r.code, input: r.input });
  };
  return (
    <div role="alert" className="w6w-field-error w6w-script-bindings">
      <span>
        {found.length === 1 ? "This script has a " : `This script has ${found.length} `}
        <code>{"{{ }}"}</code> reference{found.length === 1 ? "" : "s"} in its code. Code is never
        substituted, so at run time {found.length === 1 ? "it is" : "they are"} the literal text.
        Bind the data under <strong>Input</strong> and read it from <code>input</code>.
      </span>
      {!readOnly && (
        <button type="button" className="w6w-btn" onClick={move}>
          Move to Input
        </button>
      )}
      {refusal && <span className="w6w-hint">{refusal}</span>}
    </div>
  );
}
