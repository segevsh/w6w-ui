/**
 * `{{ }}` inside a Run script's CODE. The host never templates `@w6w/script`'s `code` (the
 * engine's `LITERAL_PARAMS`, node-types RFC amendment 2026-10-30): a marker typed into the code
 * reaches the sandbox as literal text — `'{{ nodes.a.output.total }}'` is that exact string at
 * run time, never the value. A script reads run data from its read-only globals instead:
 * `run.nodes.<id>.output` (also `run.trigger`, `run.foreach`), the workflow state tree as
 * `state.<name>` (or `vars.<name>`, the same tree with no `run` fall-through), and
 * `consts.<name>` (Python indexes them). `state.nodes…` is the older spelling of `run.nodes…`:
 * it still works in saved scripts, but is never inserted.
 *
 * {@link findCodeBindings} finds the markers that would run (strings and code, not comments),
 * {@link codeReadFor} spells one reference as that code read, and
 * {@link convertCodeBindingsToReads} rewrites every convertible marker in a script — what the
 * step editor does when a script opens, behind a visible note with Undo.
 */

export type ScriptLanguage = "javascript" | "typescript" | "python";

/** Where a marker sits: plain code, or inside a string literal of the given quote. */
type Context = { kind: "code" } | { kind: "string"; quote: string; start: number; end: number };

export interface CodeBinding {
  /** Offset of the `{{` in the code. */
  start: number;
  /** Offset just past the `}}`. */
  end: number;
  /** The marker's inner text, trimmed — what Input binds (`{{ <ref> }}`). */
  ref: string;
  context: Context;
}

const MARKER = /\{\{\s*([^{}]*?)\s*\}\}/g;

/**
 * Every `{{ … }}` in `code` that is not inside a comment, with the string literal (if any)
 * around it. A small scanner, not a parser: it tracks `'…'`, `"…"` (and, in JavaScript,
 * `` `…` ``; in Python, triple quotes) and the language's comments, which is what deciding
 * "would this marker run" needs.
 */
export function findCodeBindings(
  code: string,
  language: ScriptLanguage = "javascript",
): CodeBinding[] {
  const python = language === "python";
  // Map each offset to the literal (if any) it sits in; comments are recorded as null.
  const literals: { start: number; end: number; quote: string }[] = [];
  const comments: { start: number; end: number }[] = [];
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    const two = code.slice(i, i + 2);
    const three = code.slice(i, i + 3);
    if ((python && c === "#") || (!python && two === "//")) {
      const nl = code.indexOf("\n", i);
      const end = nl === -1 ? code.length : nl;
      comments.push({ start: i, end });
      i = end;
    } else if (!python && two === "/*") {
      const close = code.indexOf("*/", i + 2);
      const end = close === -1 ? code.length : close + 2;
      comments.push({ start: i, end });
      i = end;
    } else if (python && (three === '"""' || three === "'''")) {
      const close = code.indexOf(three, i + 3);
      const end = close === -1 ? code.length : close + 3;
      literals.push({ start: i, end, quote: three });
      i = end;
    } else if (c === "'" || c === '"' || (!python && c === "`")) {
      let j = i + 1;
      while (j < code.length && code[j] !== c) {
        if (code[j] === "\\") j++;
        else if (c !== "`" && code[j] === "\n") break;
        j++;
      }
      const end = Math.min(j + 1, code.length);
      literals.push({ start: i, end, quote: c });
      i = end;
    } else {
      i++;
    }
  }
  const out: CodeBinding[] = [];
  for (const m of code.matchAll(MARKER)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (comments.some((c) => start >= c.start && start < c.end)) continue;
    const lit = literals.find((l) => start > l.start && start < l.end);
    out.push({
      start,
      end,
      ref: m[1],
      context: lit ? { kind: "string", ...lit } : { kind: "code" },
    });
  }
  return out;
}

/** A reference the converter understands: a root, then `.name`, `[0]` or `["key"]` steps. */
const REF = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$-]*|\[\d+\]|\["[^"\\]*"\]|\['[^'\\]*'\])*$/;
const STEP = /\.([A-Za-z_$][\w$-]*)|\[(\d+)\]|\["([^"\\]*)"\]|\['([^'\\]*)'\]/g;

/** Where each `{{ }}` root lives among a script's globals. */
const ROOTS: Record<string, string[]> = {
  nodes: ["run", "nodes"],
  steps: ["run", "nodes"],
  trigger: ["run", "trigger"],
  foreach: ["run", "foreach"],
  state: ["state"],
  var: ["state"],
  vars: ["state"],
  const: ["consts"],
  consts: ["consts"],
};

/**
 * The keys the `run` global exposes (`nodes`, `steps`, `trigger`, `foreach`), derived from
 * {@link ROOTS}. The Script `state` global falls through to `run.<key>` for these when the tree
 * has no such key, so a tree key with one of these names is read on `vars` (no fall-through).
 */
const RUN_KEYS = new Set(
  Object.entries(ROOTS)
    .filter(([, base]) => base[0] === "run")
    .map(([root]) => root),
);

/** `state`, `var` and `vars` are one tree (the roots that map to the `state` global). */
const isStateRoot = (root: string): boolean => ROOTS[root]?.[0] === "state";

/**
 * The code that reads what `{{ ref }}` names: `nodes.a.output.total` →
 * `run.nodes.a.output.total` (JavaScript/TypeScript) or `run["nodes"]["a"]["output"]["total"]`
 * (Python); `state.x` / `var.x` / `vars.x` → `state.x`; `const.tier` → `consts.tier`. A state
 * ref with no path, or whose first key is one `run` exposes (`state.nodes.x`), reads `vars`
 * instead, which has no fall-through to `run`, so it reads the tree exactly as the expression
 * does. `null` for anything a script cannot read that way — `secrets.*`, `documents.*`, a
 * Function's `inputs.*`, or an expression with operators or filters.
 */
export function codeReadFor(ref: string, language: ScriptLanguage = "javascript"): string | null {
  const text = ref.trim();
  if (!REF.test(text)) return null;
  const root = /^[A-Za-z_$][\w$]*/.exec(text)?.[0] ?? "";
  const base = ROOTS[root];
  if (!base) return null;
  const path: (string | number)[] = [...base.slice(1)];
  for (const m of text.slice(root.length).matchAll(STEP)) {
    path.push(m[2] !== undefined ? Number(m[2]) : (m[1] ?? m[3] ?? m[4]));
  }
  let out = base[0];
  if (isStateRoot(root)) {
    const first = path[0];
    if (first === undefined || (typeof first === "string" && RUN_KEYS.has(first))) out = "vars";
  }
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else if (language !== "python" && /^[A-Za-z_$][\w$]*$/.test(seg)) out += `.${seg}`;
    else out += `[${JSON.stringify(seg)}]`;
  }
  return out;
}

export interface ConvertResult {
  code: string;
  /** Markers rewritten to code reads. */
  converted: number;
  /** Markers left as they were: not a readable reference, or inside a string they can't leave. */
  left: number;
}

/**
 * Rewrite each running `{{ ref }}` in `code` to the code read {@link codeReadFor} gives:
 *  - a marker that IS a whole string literal (`'{{ ref }}'`) becomes the read, keeping the
 *    value's type;
 *  - a bare marker in code becomes the read;
 *  - inside a JavaScript template literal it becomes `${read}`;
 *  - inside a longer `'…'`/`"…"` string it is spliced in by concatenation (`str(read)` in Python);
 *  - anything else (a Python triple-quoted or prefixed string, a reference with no code read) is
 *    left as it was and counted in `left`.
 */
export function convertCodeBindingsToReads(
  code: string,
  language: ScriptLanguage = "javascript",
): ConvertResult {
  const python = language === "python";
  let out = "";
  let cursor = 0;
  let converted = 0;
  let left = 0;
  for (const b of findCodeBindings(code, language)) {
    const read = codeReadFor(b.ref, language);
    if (read === null) {
      left++;
      continue;
    }
    const ctx = b.context;
    if (ctx.kind === "code") {
      out += code.slice(cursor, b.start) + read;
      cursor = b.end;
      converted++;
      continue;
    }
    const q = ctx.quote;
    const atStart = b.start === ctx.start + q.length;
    const atEnd = b.end === ctx.end - q.length;
    if (atStart && atEnd) {
      out += code.slice(cursor, ctx.start) + read;
      cursor = ctx.end;
      converted++;
    } else if (!python && q === "`") {
      out += `${code.slice(cursor, b.start)}\${${read}}`;
      cursor = b.end;
      converted++;
    } else if (q.length === 1 && !(python && /[A-Za-z]/.test(code[ctx.start - 1] ?? ""))) {
      const piece = python ? `str(${read})` : read;
      out += atStart
        ? `${code.slice(cursor, ctx.start)}${piece} + ${q}`
        : `${code.slice(cursor, b.start)}${q} + ${piece}`;
      if (atEnd) {
        cursor = ctx.end;
      } else {
        if (!atStart) out += ` + ${q}`;
        cursor = b.end;
      }
      converted++;
    } else {
      left++;
    }
  }
  out += code.slice(cursor);
  return { code: out, converted, left };
}
