/**
 * lint:tokens — a ratcheting scanner for hard-coded spacing/type literals.
 *
 * `@w6w/ui` declares its spacing/typography scale as `--w6w-*` custom
 * properties (`src/styles/_scale.scss`). This script flags any NEW spacing or
 * type literal added to a `.scss` partial that could have used one of those
 * tokens instead, without demanding the ~186 pre-existing literals be fixed
 * in one pass — that substitution is a separate, judgement-heavy node
 * (T2.1.1). The mechanism, modelled on `scripts/build-css.mjs`'s shape: plain
 * Node ESM, no new dependency, a committed baseline that may only shrink.
 *
 *   node scripts/lint-tokens.mjs            # lint — exit 0/1/2/3, see below
 *   node scripts/lint-tokens.mjs --update   # rewrite the baseline, exit 0
 *
 * Exit codes:
 *   0  every scanned file's violation count equals its baseline entry, and no
 *      offending file is missing from the baseline.
 *   1  a REGRESSION: some file has MORE violations than its baseline entry
 *      (or has violations at all and no baseline entry exists for it).
 *   2  the baseline is STALE: some file has FEWER violations than its
 *      baseline entry, or a baseline entry names a file with zero violations
 *      or a file that no longer exists. Run with --update.
 *   3  unknown flag, or the baseline file could not be read/parsed.
 *
 * Scan set: every `*.scss` file under `src/`. `src/styles.css` — the
 * generated stylesheet (see `build-css.mjs`) — is excluded on purpose:
 * flagging it would double-count every violation already caught in its
 * source `.scss`, and it can't be fixed without editing a generated file.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");
const baselinePath = join(root, "scripts", "lint-tokens.baseline.json");

// ── the property list — spacing/inset/type roles only. Box geometry (width,
// height, min-*, max-*, flex-basis, border-*, border-radius) is deliberately
// NOT here: it is not the spacing ramp, and keeping it out is what stops the
// gate flagging the six lockstep `min-height: 38px` sites and similar
// load-bearing geometry (`building-blocks.md` §5).
const DIMENSION_PROPS = new Set([
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "padding-inline",
  "padding-inline-start",
  "padding-inline-end",
  "padding-block",
  "padding-block-start",
  "padding-block-end",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "margin-inline",
  "margin-inline-start",
  "margin-inline-end",
  "margin-block",
  "margin-block-start",
  "margin-block-end",
  "gap",
  "row-gap",
  "column-gap",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "inset-inline",
  "inset-inline-start",
  "inset-inline-end",
  "inset-block",
  "inset-block-start",
  "inset-block-end",
  "font-size",
]);
const BARE_NUMERIC_PROPS = new Set(["font-weight", "line-height"]);
const FONT_FAMILY_PROP = "font-family";
const ALLOWED_FONT_FAMILY_VALUES = new Set(["var(--w6w-font-sans)", "var(--w6w-font-mono)", "inherit"]);
const PROPERTIES = new Set([...DIMENSION_PROPS, ...BARE_NUMERIC_PROPS, FONT_FAMILY_PROP]);

const LENGTH_RE = /(?:^|[\s(,])-?\d*\.?\d+(px|rem|em)(?![a-zA-Z0-9_-])/;
const BARE_NUMERIC_RE = /^-?\d*\.?\d+$/;

// Declaration matcher: a property name (optionally `--`-prefixed) immediately
// preceded by `;`, `{`, `}` or the start of the file, up to its terminating
// `;`. Whitespace between the anchor and the property name is captured
// separately (group 1) so the line number can be computed at the property
// name itself, not at the anchor or any leading blank lines.
const DECL_RE = /(?<=^|[;{}])(\s*)(--)?([a-zA-Z][a-zA-Z0-9-]*)\s*:\s*([^;{}]+);/g;

// A suppression comment: `/* lint-tokens-allow: <non-empty reason> */`.
const ALLOW_RE = /\/\*\s*lint-tokens-allow:\s*([^*]*?)\s*\*\//g;

/** Blank out `/* … *\/` and `// …` comment content, preserving every
 * character's position (and every newline) so line numbers never shift. */
function stripComments(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (text[i] === "/" && text[i + 1] === "*") {
      let j = text.indexOf("*/", i + 2);
      j = j === -1 ? n : j + 2;
      for (let k = i; k < j; k++) out += text[k] === "\n" ? "\n" : " ";
      i = j;
    } else if (text[i] === "/" && text[i + 1] === "/") {
      let j = text.indexOf("\n", i);
      if (j === -1) j = n;
      for (let k = i; k < j; k++) out += " ";
      i = j;
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}

/** 1-indexed line number of `offset` within `text`. */
function lineOf(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i++) if (text[i] === "\n") line++;
  return line;
}

/** Lines a `lint-tokens-allow` comment (with a non-empty reason) suppresses —
 * its own line, and the line immediately below it. */
function allowedLines(rawText) {
  const allowed = new Set();
  for (const m of rawText.matchAll(ALLOW_RE)) {
    if (m[1].trim().length === 0) continue; // empty reason does not suppress
    const line = lineOf(rawText, m.index);
    allowed.add(line);
    allowed.add(line + 1);
  }
  return allowed;
}

function isViolation(prop, value) {
  if (prop.startsWith("--")) return false; // a token definition is the point
  if (!PROPERTIES.has(prop)) return false;
  if (prop === FONT_FAMILY_PROP) {
    return !ALLOWED_FONT_FAMILY_VALUES.has(value);
  }
  if (BARE_NUMERIC_PROPS.has(prop)) {
    return BARE_NUMERIC_RE.test(value);
  }
  return LENGTH_RE.test(value);
}

/** Every SCSS declaration violation in one file, as `{ line, prop, value }`. */
function scanFile(absPath) {
  const raw = readFileSync(absPath, "utf8");
  const allowed = allowedLines(raw);
  const code = stripComments(raw);
  const violations = [];
  for (const m of code.matchAll(DECL_RE)) {
    const leading = m[1];
    const dashes = m[2] ?? "";
    const name = m[3];
    const prop = dashes + name;
    const value = m[4].trim();
    const propStart = m.index + leading.length;
    const line = lineOf(code, propStart);
    if (allowed.has(line)) continue;
    if (isViolation(prop, value)) violations.push({ line, prop, value });
  }
  return violations;
}

/** Every `*.scss` file under `src/`, as repo-relative POSIX paths, sorted. */
function walkScss(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkScss(abs));
    } else if (entry.isFile() && entry.name.endsWith(".scss")) {
      out.push(abs);
    }
  }
  return out;
}

function toRelPosix(abs) {
  return relative(root, abs).split("\\").join("/");
}

function readBaseline() {
  const text = readFileSync(baselinePath, "utf8");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || typeof parsed.files !== "object" || parsed.files === null) {
    throw new Error("baseline missing a \"files\" object");
  }
  return parsed.files;
}

function writeBaseline(files) {
  const sorted = {};
  for (const key of Object.keys(files).sort()) sorted[key] = files[key];
  const doc = {
    $comment:
      "Ratchet baseline for lint:tokens — pre-existing spacing/type literals. Counts may only go DOWN. Regenerate: node scripts/lint-tokens.mjs --update",
    files: sorted,
  };
  writeFileSync(baselinePath, `${JSON.stringify(doc, null, 2)}\n`);
}

function usage() {
  console.error(
    [
      "Usage: node scripts/lint-tokens.mjs [--update]",
      "  (no flag)  lint against the committed baseline — exit 0 clean, 1 on a",
      "             regression, 2 if the baseline is stale",
      "  --update   rewrite scripts/lint-tokens.baseline.json to match the",
      "             current tree, exit 0",
    ].join("\n"),
  );
}

function main() {
  const args = process.argv.slice(2);
  const update = args.includes("--update");
  const unknown = args.filter((a) => a !== "--update");
  if (unknown.length > 0) {
    usage();
    process.exit(3);
  }

  const files = walkScss(srcDir).map(toRelPosix).sort();
  /** @type {Map<string, Array<{line:number, prop:string, value:string}>>} */
  const found = new Map();
  for (const rel of files) {
    const violations = scanFile(join(root, rel));
    if (violations.length > 0) found.set(rel, violations);
  }

  if (update) {
    const counts = {};
    for (const [rel, violations] of found) counts[rel] = violations.length;
    writeBaseline(counts);
    const total = Object.values(counts).reduce((a, c) => a + c, 0);
    console.log(`lint:tokens --update — wrote ${Object.keys(counts).length} files, ${total} violations.`);
    process.exit(0);
  }

  let baseline;
  try {
    baseline = readBaseline();
  } catch (err) {
    console.error(`lint:tokens — could not read baseline: ${err.message}`);
    usage();
    process.exit(3);
  }

  const fileSet = new Set(files);
  const regressions = [];
  const stale = [];

  for (const [rel, violations] of found) {
    const base = baseline[rel];
    if (base === undefined) {
      regressions.push({ rel, now: violations.length, base: undefined, violations });
    } else if (violations.length > base) {
      regressions.push({ rel, now: violations.length, base, violations });
    } else if (violations.length < base) {
      stale.push({ rel, now: violations.length, base, reason: "fewer violations than the baseline" });
    }
  }
  for (const rel of Object.keys(baseline)) {
    if (found.has(rel)) continue; // already compared above
    if (!fileSet.has(rel)) {
      stale.push({ rel, now: 0, base: baseline[rel], reason: "file no longer exists" });
    } else {
      // File exists, scanned clean (zero current violations) but the baseline
      // still names it — either it improved to zero, or the entry is bogus.
      stale.push({ rel, now: 0, base: baseline[rel], reason: "zero current violations" });
    }
  }

  if (regressions.length > 0) {
    console.error("lint:tokens — REGRESSION: new hard-coded spacing/type literal(s) found.");
    for (const r of regressions) {
      console.error(
        `  ${r.rel} — ${r.now} violation(s), baseline ${r.base === undefined ? "none" : r.base}:`,
      );
      for (const v of r.violations) {
        console.error(`    ${r.rel}:${v.line}  ${v.prop}: ${v.value};`);
      }
    }
    console.error("If this literal is intentional, add a `/* lint-tokens-allow: <reason> */` comment.");
    process.exit(1);
  }

  if (stale.length > 0) {
    console.error("lint:tokens — STALE baseline: some entries no longer match the tree.");
    for (const s of stale) {
      console.error(`  ${s.rel} — baseline ${s.base}, now ${s.now} (${s.reason})`);
    }
    console.error("run: node scripts/lint-tokens.mjs --update");
    process.exit(2);
  }

  const totalNow = [...found.values()].reduce((a, v) => a + v.length, 0);
  const totalBase = Object.values(baseline).reduce((a, c) => a + c, 0);
  console.log(`lint:tokens — ${totalNow} violations in ${found.size} files (baseline: ${totalBase})`);
  process.exit(0);
}

main();
