// Run: node --test src/__tests__/scale-tokens.test.ts  (Node 24, type-stripped)
//
// T1.1.1 — the spacing/type scale's "Published interface" is a contract with
// five other nodes (T2.1.1 ui, T2.2.1 studio, T2.3.1 admin, T2.4.1 frontend,
// and the doc T3.x cites), so this suite asserts against the COMPILED
// artifact (`src/styles.css` — what every consumer actually imports), not the
// authored `.scss`: a drift between the two is exactly what `check:css`
// exists to catch, but this suite is what pins the 30 names+values
// themselves, name-for-name and value-for-value against §"Published
// interface" of the contract.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..");
const cssPath = join(srcDir, "styles.css");
const scalePartialPath = join(srcDir, "styles", "_scale.scss");

/** Exactly the 30 tokens of the contract's "Published interface", in the
 * order they're declared there. */
const EXPECTED_TOKENS: Record<string, string> = {
  "--w6w-sp-1": "4px",
  "--w6w-sp-2": "8px",
  "--w6w-sp-3": "12px",
  "--w6w-sp-4": "16px",
  "--w6w-sp-5": "20px",
  "--w6w-sp-6": "24px",
  "--w6w-sp-8": "32px",
  "--w6w-sp-10": "40px",
  "--w6w-sp-12": "48px",
  "--w6w-sp-16": "64px",
  "--w6w-sp-20": "80px",
  "--w6w-sp-0-5": "2px",
  "--w6w-sp-1-5": "6px",
  "--w6w-sp-2-5": "10px",
  "--w6w-fs-xs": "0.75rem",
  "--w6w-fs-sm": "0.875rem",
  "--w6w-fs-base": "1rem",
  "--w6w-fs-lg": "1.125rem",
  "--w6w-fs-xl": "1.25rem",
  "--w6w-fs-2xl": "1.5rem",
  "--w6w-fs-3xl": "2rem",
  "--w6w-fw-regular": "400",
  "--w6w-fw-medium": "500",
  "--w6w-fw-semibold": "600",
  "--w6w-fw-bold": "700",
  "--w6w-lh-tight": "1.2",
  "--w6w-lh-normal": "1.5",
  "--w6w-lh-relaxed": "1.7",
  "--w6w-font-sans": 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  "--w6w-font-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
};

test("EXPECTED_TOKENS precondition — exactly 30 entries", () => {
  assert.equal(Object.keys(EXPECTED_TOKENS).length, 30);
});

/** Blank out `/* … *\/` and `// …` comments, preserving line breaks — so a
 * header comment that quotes non-working CSS for illustration (e.g.
 * `_scale.scss`'s own `@media (min-width: var(--w6w-bp-md))` example) is
 * never mistaken for live code. */
function stripComments(text: string): string {
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

/** Every balanced-brace `{ ... }` body immediately following a literal
 * top-level occurrence of `selector` (e.g. `:where(:root)`), wherever it sits
 * (top level or nested inside `@media`) — the union of all such bodies is
 * what "declared in a :where(:root) block" means for this suite. */
function blocksFor(css: string, selector: string): string[] {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(selector, from);
    if (at === -1) break;
    let i = at + selector.length;
    while (css[i] === " " || css[i] === "\n" || css[i] === "\t") i++;
    if (css[i] !== "{") {
      from = at + selector.length;
      continue;
    }
    let depth = 1;
    let j = i + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    bodies.push(css.slice(i + 1, j - 1));
    from = j;
  }
  return bodies;
}

/** Custom-property declarations (`--name: value;`) found in `css`, as a Map. */
function customProps(css: string): Map<string, string> {
  const props = new Map<string, string>();
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  for (const m of css.matchAll(re)) {
    props.set(m[1], m[2].trim());
  }
  return props;
}

test("styles.css — the compiled artifact contains a :where(:root) block", () => {
  const css = readFileSync(cssPath, "utf8");
  const bodies = blocksFor(css, ":where(:root)");
  assert.ok(bodies.length > 0, "no :where(:root) block found in the compiled CSS");
});

test("styles.css — every one of the 30 tokens is declared, in a :where(:root) block, with its exact value", () => {
  const css = readFileSync(cssPath, "utf8");
  const bodies = blocksFor(css, ":where(:root)");
  const props = customProps(bodies.join("\n"));
  for (const [name, value] of Object.entries(EXPECTED_TOKENS)) {
    assert.ok(props.has(name), `${name} is not declared in any :where(:root) block`);
    assert.equal(props.get(name), value, `${name} has the wrong value`);
  }
});

test("styles.css — the --w6w-(sp|fs|fw|lh|font)-* key set is EXACTLY the 30 tokens (no extras, none missing)", () => {
  const css = readFileSync(cssPath, "utf8");
  const bodies = blocksFor(css, ":where(:root)");
  const props = customProps(bodies.join("\n"));
  const scaleKeys = [...props.keys()].filter((k) => /^--w6w-(sp|fs|fw|lh|font)-/.test(k)).sort();
  assert.deepEqual(scaleKeys, Object.keys(EXPECTED_TOKENS).sort());
});

test("styles.css — the scale block is NOT declared under bare :root (specificity 0 is load-bearing)", () => {
  // A block emitted as `:root { --w6w-sp-1: 4px; ... }` instead of
  // `:where(:root)` would still contain the right names/values, so the two
  // assertions above cannot see the difference — this one specifically checks
  // the SELECTOR the tokens sit under, so a `:root`-only emission (not inside
  // any `:where(...)`) still fails here even though its declarations are
  // otherwise byte-identical.
  const css = readFileSync(cssPath, "utf8");
  const whereBodies = blocksFor(css, ":where(:root)");
  const whereProps = customProps(whereBodies.join("\n"));
  for (const name of Object.keys(EXPECTED_TOKENS)) {
    assert.ok(whereProps.has(name), `${name} was not found inside a :where(:root) block`);
  }
});

test("_scale.scss — declares the three Sass breakpoint variables, !default, with the pinned values", () => {
  const scss = readFileSync(scalePartialPath, "utf8");
  assert.match(scss, /\$w6w-bp-sm:\s*640px\s*!default;/);
  assert.match(scss, /\$w6w-bp-md:\s*900px\s*!default;/);
  assert.match(scss, /\$w6w-bp-lg:\s*1200px\s*!default;/);
});

test("no .scss file under src/ contains `@media (min-width: var(` outside a comment", () => {
  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(abs));
      else if (entry.name.endsWith(".scss")) out.push(abs);
    }
    return out;
  }
  const offenders: string[] = [];
  for (const file of walk(srcDir)) {
    const stripped = stripComments(readFileSync(file, "utf8"));
    if (stripped.includes("@media (min-width: var(")) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
  // Precondition: the partial's own header comment DOES quote this string —
  // if it didn't, the assertion above would be vacuous (never exercising the
  // comment-stripping this test exists to prove).
  const raw = readFileSync(scalePartialPath, "utf8");
  assert.match(raw, /@media \(min-width: var\(--w6w-bp-md\)\)/);
});

test("blocksFor/customProps precondition — the helpers correctly parse a synthetic nested case", () => {
  // A guard on the test's own parsing helpers: a token declared inside
  // `@media (prefers-color-scheme: dark) { :where(:root) { ... } }` must
  // still be found (nested), and a `:where([data-theme=...])` block must NOT
  // contribute to the `:where(:root)` result set.
  const synthetic = `
    :where(:root) { --a: 1px; }
    @media (prefers-color-scheme: dark) {
      :where(:root) { --b: 2px; }
    }
    :where([data-theme="dark"]) { --a: 9px; }
  `;
  const bodies = blocksFor(synthetic, ":where(:root)");
  const props = customProps(bodies.join("\n"));
  assert.equal(props.get("--a"), "1px");
  assert.equal(props.get("--b"), "2px");
});
