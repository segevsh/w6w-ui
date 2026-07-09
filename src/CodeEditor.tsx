import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import type { ThemeMode } from "./types.ts";

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Placeholder text shown when value is empty. */
  placeholder?: string;
  /** Minimum editor height. Defaults to "160px". */
  minHeight?: string;
  /** Maximum editor height before scrolling. Defaults to no cap. */
  maxHeight?: string;
  /** Read-only mode. */
  readOnly?: boolean;
  /**
   * Explicit theme. If omitted, auto-detects `data-theme` on `<html>` and falls
   * back to `prefers-color-scheme` — same behavior as `<JsonEditor>`.
   */
  theme?: ThemeMode;
  /** Accessible label for the editor. */
  "aria-label"?: string;
}

/**
 * Plain-text code editor built on CodeMirror 6 — the same surface as
 * `<JsonEditor>` minus JSON language/linting, for editing snippets (e.g. an
 * inline script). Line numbers, bracket matching, and `--w6w-*` theming so it
 * inherits the consumer's palette. No language pack, so it stays dependency-free
 * beyond the CodeMirror core the JSON editor already pulls in.
 */
export function CodeEditor(props: CodeEditorProps) {
  const extensions = useMemo(
    () => [
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

  return (
    <div
      className="w6w-code-editor"
      style={{ minHeight: props.minHeight ?? "160px", maxHeight: props.maxHeight }}
      aria-label={props["aria-label"] ?? "Code editor"}
    >
      <CodeMirror
        value={props.value}
        onChange={props.onChange}
        extensions={extensions}
        placeholder={props.placeholder}
        readOnly={props.readOnly}
        theme={resolveTheme(props.theme)}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: !props.readOnly,
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
