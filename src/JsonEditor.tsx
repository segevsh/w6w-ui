import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import type { ThemeMode } from "./types.ts";

export interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Fired whenever the current value parses as JSON, with the parsed value.
   * Never fires while the value is invalid — pair it with a validity flag if
   * you want to react to invalidation too (e.g., disable a Save button).
   */
  onValidChange?: (parsed: unknown) => void;
  /** Optional callback fired on every keystroke with parse validity + error. */
  onValidityChange?: (result: { valid: boolean; error?: string }) => void;

  /** Placeholder text shown when value is empty. */
  placeholder?: string;
  /** Minimum editor height. Defaults to "240px". */
  minHeight?: string;
  /** Maximum editor height before scrolling. Defaults to no cap. */
  maxHeight?: string;

  /** Read-only mode — useful for previewing a stored definition. */
  readOnly?: boolean;

  /**
   * Explicit theme. If omitted, the editor auto-detects `data-theme` on
   * `<html>` and falls back to `prefers-color-scheme` — same behavior as
   * `<AppIcon>`. Uses CodeMirror's built-in one-dark for dark mode.
   */
  theme?: ThemeMode;

  /** Accessible label for the editor. */
  "aria-label"?: string;
}

/**
 * JSON editor built on CodeMirror 6. Syntax highlighting, folding, gutter with
 * lint markers for invalid JSON. Themed with the `--w6w-*` custom properties so
 * it inherits from the consumer's palette.
 *
 * ```tsx
 * <JsonEditor value={text} onChange={setText}
 *   onValidChange={(parsed) => setDefinition(parsed)}
 *   minHeight="320px" />
 * ```
 */
export function JsonEditor(props: JsonEditorProps) {
  const extensions = useMemo(
    () => [
      json(),
      linter(jsonParseLinter()),
      lintGutter(),
      EditorView.theme({
        "&": {
          fontSize: "13px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          backgroundColor: "var(--w6w-panel-2)",
          color: "var(--w6w-text)",
          border: "1px solid var(--w6w-border)",
          borderRadius: "8px",
        },
        "&.cm-focused": { outline: "2px solid var(--w6w-accent)" },
        ".cm-gutters": {
          backgroundColor: "var(--w6w-panel)",
          color: "var(--w6w-muted)",
          border: "none",
          borderRight: "1px solid var(--w6w-border)",
        },
        ".cm-scroller": { overflow: "auto" },
      }),
    ],
    [],
  );

  function handleChange(next: string) {
    props.onChange(next);
    if (!props.onValidChange && !props.onValidityChange) return;
    if (next.trim().length === 0) {
      props.onValidityChange?.({ valid: false, error: "Empty" });
      return;
    }
    try {
      const parsed = JSON.parse(next);
      props.onValidChange?.(parsed);
      props.onValidityChange?.({ valid: true });
    } catch (e) {
      props.onValidityChange?.({ valid: false, error: (e as Error).message });
    }
  }

  return (
    <div
      className="w6w-json-editor"
      style={{ minHeight: props.minHeight ?? "240px", maxHeight: props.maxHeight }}
      aria-label={props["aria-label"] ?? "JSON editor"}
    >
      <CodeMirror
        value={props.value}
        onChange={handleChange}
        extensions={extensions}
        placeholder={props.placeholder}
        readOnly={props.readOnly}
        theme={resolveTheme(props.theme)}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !props.readOnly,
          autocompletion: true,
          bracketMatching: true,
          closeBrackets: true,
        }}
      />
    </div>
  );
}

/** Resolve CodeMirror's theme prop from an optional explicit ThemeMode. */
function resolveTheme(explicit?: ThemeMode): "light" | "dark" {
  if (explicit) return explicit;
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
