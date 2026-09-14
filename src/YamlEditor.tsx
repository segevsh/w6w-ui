import { yaml } from "@codemirror/lang-yaml";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import { CheckGlyph, CopyGlyph } from "./components/Copyable.tsx";
import { useCopyToClipboard } from "./components/use-copy.ts";
import { useEffectiveTheme } from "./theme.ts";
import type { ThemeMode } from "./types.ts";

export interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;

  /** Placeholder text shown when value is empty. */
  placeholder?: string;
  /** Minimum editor height. Defaults to "240px". */
  minHeight?: string;
  /** Maximum editor height before scrolling. Defaults to no cap. */
  maxHeight?: string;
  /**
   * Explicit editor height. Pass `"100%"` to fill a flex parent (the whole-config
   * "code" view). Omit to let the editor grow with its content between
   * `minHeight` and `maxHeight` — an inline YAML/group field wants this.
   */
  height?: string;

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

  /**
   * Render an in-box copy-to-clipboard button, a direct child of this
   * component's own `.w6w-yaml-editor` wrapper (sibling to the CodeMirror
   * mount — no extra DOM node). Copies the current `value` verbatim.
   *
   * Off by default: the other mounts of this component must render byte-
   * identically to before this prop existed.
   */
  copyable?: boolean;
}

/**
 * YAML editor built on CodeMirror 6. Syntax highlighting, folding, gutter,
 * and line numbers. Themed with the `--w6w-*` custom properties so it
 * inherits from the consumer's palette.
 *
 * ```tsx
 * <YamlEditor value={text} onChange={setText} minHeight="320px" />
 * ```
 */
export function YamlEditor(props: YamlEditorProps) {
  const theme = useEffectiveTheme(props.theme);
  // Only mounted when `copyable` is on, but the hook itself must run
  // unconditionally (Rules of Hooks) — it is inert (no button, no listener)
  // until `copy()` is actually invoked from the button below.
  const { copied, copy } = useCopyToClipboard(props.value);
  const extensions = useMemo(
    () => [
      yaml(),
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
  }

  return (
    <div className="w6w-yaml-editor" aria-label={props["aria-label"] ?? "YAML editor"}>
      <CodeMirror
        value={props.value}
        onChange={handleChange}
        extensions={extensions}
        placeholder={props.placeholder}
        readOnly={props.readOnly}
        // `readOnly` alone only blocks CodeMirror's own transactions
        // (`EditorState.readOnly`) — it leaves the content DOM
        // `contenteditable="true"`, so a screen reader / a11y test still sees
        // it as an editable field. `editable` is the separate switch that
        // actually sets `contenteditable` (`EditorView.editable`); tying it to
        // `readOnly` here makes the prop mean what its name says.
        editable={!props.readOnly}
        theme={theme}
        height={props.height}
        minHeight={props.minHeight ?? "240px"}
        maxHeight={props.maxHeight}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !props.readOnly,
          autocompletion: true,
          bracketMatching: true,
          closeBrackets: true,
        }}
      />
      {props.copyable && (
        <>
          <button
            type="button"
            className={`w6w-icon-btn w6w-copyable-btn${copied ? " is-copied" : ""}`}
            aria-label="Copy"
            onClick={() => void copy()}
          >
            {copied ? <CheckGlyph /> : <CopyGlyph />}
          </button>
          {/* Same live-region convention as `Copyable.tsx:141-147`: the
              button's accessible name stays constant, so this announces the
              result. */}
          <span className="w6w-copyable-status" aria-live="polite">
            {copied ? "Copied" : ""}
          </span>
        </>
      )}
    </div>
  );
}
