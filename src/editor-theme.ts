/**
 * The ONE `EditorView.theme` spec shared by the three CodeMirror editors
 * (`JsonEditor`, `CodeEditor`, `YamlEditor`) — previously copy-pasted verbatim
 * into each of them.
 *
 * Plain object, **no imports**, so `node --test` asserts it directly. Every
 * colour/spacing value is a `--w6w-*` custom property so the editors inherit
 * the consumer's palette.
 *
 * Focus mirrors `styles/_fields.scss` (`.w6w-field input:focus { outline: none;
 * border-color: var(--w6w-accent) }`) instead of drawing an accent ring. The
 * rule must STAY with an explicit `outline: "none"` — deleting it falls back to
 * CodeMirror's base theme (`outline: 1px dotted #212121` in
 * `@codemirror/view`), which is still an outline.
 *
 * `".cm-scroller"`'s `borderRadius: "7px"` (8px − the 1px `"&"` border) clips
 * the gutters and active line to the rounded border. `"&"` never gets
 * `overflow: hidden`, which would clip lint/hover tooltips mounted inside the
 * editor.
 *
 * `".cm-content"` only sets the vertical longhands: `styles/_fx.scss` owns
 * `padding-right` while the ƒx/copy overlay is present.
 */
export const EDITOR_THEME_SPEC: Record<string, Record<string, string>> = {
  "&": {
    fontSize: "13px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    backgroundColor: "var(--w6w-panel-2)",
    color: "var(--w6w-text)",
    border: "1px solid var(--w6w-border)",
    borderRadius: "8px",
  },
  "&.cm-focused": { outline: "none", borderColor: "var(--w6w-accent)" },
  ".cm-gutters": {
    backgroundColor: "var(--w6w-panel)",
    color: "var(--w6w-muted)",
    border: "none",
    borderRight: "1px solid var(--w6w-border)",
  },
  ".cm-scroller": { overflow: "auto", borderRadius: "7px" },
  ".cm-content": {
    paddingTop: "var(--w6w-sp-2)",
    paddingBottom: "var(--w6w-sp-2)",
  },
  ".cm-line": { paddingLeft: "var(--w6w-sp-2)" },
};
