/**
 * `{{ }}` inside a Run script's CODE. The host never templates `@w6w/script`'s `code` (the
 * engine's `LITERAL_PARAMS`, node-types RFC amendment 2026-10-30): a script reads run data
 * through its `input` param, whose bindings resolve type-preserved. A marker typed into the
 * code therefore reaches the sandbox as literal text — `'{{ nodes.a.output.total }}'` is that
 * exact string at run time, never the value.
 *
 * {@link findCodeBindings} finds the markers that would run (strings and code, not comments),
 * and {@link moveCodeBindingsToInput} rewrites each to an `input` read and adds the binding
 * under Input — the explicit, one-click fix the Configure tab offers. Nothing here runs
 * implicitly: a script is never rewritten without the author pressing the button.
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

/** The `input` key a ref is read under: its last path segment, made an identifier. */
function nameCandidates(ref: string): string[] {
  const segs = ref.split(".").map((s) => s.replace(/[^A-Za-z0-9_]/g, "_"));
  const tail =
    segs.length >= 3 && (segs[0] === "nodes" || segs[0] === "steps")
      ? segs[2] === "output" && segs.length > 3
        ? segs.slice(3)
        : [segs[1]]
      : segs.slice(1).length > 0
        ? segs.slice(1)
        : segs;
  const out: string[] = [];
  for (let n = 1; n <= tail.length; n++) out.push(tail.slice(-n).join("_"));
  return out.map((s) => (/^[A-Za-z_]/.test(s) ? s : `v_${s}`)).filter((s) => s !== "");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export type MoveResult =
  | { ok: true; code: string; input: Record<string, unknown>; moved: number; left: number }
  | { ok: false; reason: string };

/**
 * Rewrite each running `{{ ref }}` in `code` to an `input` read, binding `"{{ ref }}"` under
 * that name in Input:
 *  - a marker that IS a whole string literal (`'{{ ref }}'`) becomes `input.<name>`, keeping
 *    the value's type;
 *  - a bare marker in code becomes `input.<name>`;
 *  - inside a JavaScript template literal it becomes `${input.<name>}`;
 *  - inside a longer JavaScript `'…'`/`"…"` string it is spliced in by concatenation;
 *  - anywhere else (part of a Python string) it is left for the author, and counted in `left`.
 *
 * Input must be empty or an object: a whole-value binding (`{{ nodes.a.output }}`) is the
 * script's single `input`, and turning it into an object would change what the code reads.
 */
export function moveCodeBindingsToInput(
  code: string,
  input: unknown,
  language: ScriptLanguage = "javascript",
): MoveResult {
  const python = language === "python";
  const empty = input === undefined || input === null || input === "";
  if (!empty && (!isPlainObject(input) || "$" in input)) {
    return {
      ok: false,
      reason:
        "Input already holds a single value, so the script can't read named fields from it. Make Input an object first.",
    };
  }
  const next: Record<string, unknown> = empty ? {} : { ...(input as Record<string, unknown>) };
  const nameOf = new Map<string, string>();
  const pick = (ref: string): string => {
    const known = nameOf.get(ref);
    if (known) return known;
    const binding = `{{ ${ref} }}`;
    const candidates = nameCandidates(ref);
    let name = candidates.find((c) => !(c in next) || next[c] === binding);
    if (!name) {
      const stem = candidates[candidates.length - 1] ?? "value";
      for (let n = 2; !name; n++) if (!(`${stem}_${n}` in next)) name = `${stem}_${n}`;
    }
    next[name] = binding;
    nameOf.set(ref, name);
    return name;
  };
  const read = (name: string) => (python ? `input["${name}"]` : `input.${name}`);

  let out = "";
  let cursor = 0;
  let moved = 0;
  let left = 0;
  for (const b of findCodeBindings(code, language)) {
    const ctx = b.context;
    if (ctx.kind === "code") {
      out += code.slice(cursor, b.start) + read(pick(b.ref));
      cursor = b.end;
      moved++;
      continue;
    }
    const q = ctx.quote;
    if (b.start === ctx.start + q.length && b.end === ctx.end - q.length) {
      out += code.slice(cursor, ctx.start) + read(pick(b.ref));
      cursor = ctx.end;
      moved++;
    } else if (!python && q === "`") {
      out += `${code.slice(cursor, b.start)}\${${read(pick(b.ref))}}`;
      cursor = b.end;
      moved++;
    } else if (!python) {
      out += `${code.slice(cursor, b.start)}${q} + ${read(pick(b.ref))} + ${q}`;
      cursor = b.end;
      moved++;
    } else {
      left++;
    }
  }
  out += code.slice(cursor);
  return { ok: true, code: out, input: next, moved, left };
}
