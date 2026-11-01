import { useEffect, useRef, useState } from "react";
import {
  type ScriptLanguage,
  convertCodeBindingsToReads,
  findCodeBindings,
} from "../script-bindings.ts";

function languageOf(values: Record<string, unknown>): ScriptLanguage {
  return values.language === "python" || values.language === "typescript"
    ? values.language
    : "javascript";
}

export interface ScriptConversion {
  /** What the open-time conversion did, until Undo. */
  converted: number;
  undo: () => void;
}

/**
 * A Run script's `{{ }}` markers, converted when the step opens. The host never substitutes
 * inside code (see `script-bindings.ts`), so a marker there is literal text at run time. When
 * the step opens, each convertible marker is rewritten to the code read it names
 * (`run.nodes.<id>.output…`, `state.…`, `consts.…`); {@link ScriptBindingsNotice} says so,
 * with Undo. Runs once per mount of the step editor, so after Undo the code stays as it was
 * until the step is opened again. Read-only (or not a script), nothing is rewritten.
 */
export function useScriptConversion({
  enabled,
  values,
  onChange,
}: {
  /** A writable `@w6w/script` step. */
  enabled: boolean;
  /** The step's `with`: `code`, `language`, `input`. */
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}): ScriptConversion | null {
  const [done, setDone] = useState<{
    original: string;
    converted: number;
  } | null>(null);
  const ran = useRef(false);
  const code = typeof values.code === "string" ? values.code : "";

  useEffect(() => {
    if (!enabled || ran.current) return;
    ran.current = true;
    const r = convertCodeBindingsToReads(code, languageOf(values));
    if (r.converted === 0) return;
    setDone({ original: code, converted: r.converted });
    onChange({ ...values, code: r.code });
  }, [enabled, code, values, onChange]);

  if (!done) return null;
  return {
    converted: done.converted,
    undo: () => {
      onChange({ ...values, code: done.original });
      setDone(null);
    },
  };
}

/**
 * The quiet line under a Run script's Configure tab: "Converted 2 references to code reads ·
 * Undo" after the open-time conversion, and, for any marker still in the code, that it stays
 * literal text. Renders nothing otherwise.
 */
export function ScriptBindingsNotice({
  values,
  conversion,
  readOnly,
}: {
  /** The step's `with`: `code`, `language`. */
  values: Record<string, unknown>;
  conversion: ScriptConversion | null;
  readOnly?: boolean;
}) {
  const code = typeof values.code === "string" ? values.code : "";
  const done = conversion;
  const left = findCodeBindings(code, languageOf(values)).length;
  if (!done && left === 0) return null;
  return (
    <output className="w6w-hint w6w-script-converted">
      {done && (
        <>
          Converted {done.converted} reference{done.converted === 1 ? "" : "s"} to code reads
          {!readOnly && (
            <>
              {" · "}
              <button type="button" className="w6w-script-converted-undo" onClick={done.undo}>
                Undo
              </button>
            </>
          )}
          {left > 0 && " · "}
        </>
      )}
      {left > 0 && (
        <>
          {left} <code>{"{{ }}"}</code> left in the code stay
          {left === 1 ? "s" : ""} literal text — read {left === 1 ? "it" : "them"} from{" "}
          <code>state</code>, or bind under Custom input
        </>
      )}
    </output>
  );
}
