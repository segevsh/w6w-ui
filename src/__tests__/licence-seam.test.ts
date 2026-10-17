// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/licence-seam.test.ts
//
// Licence seam (STRATEGY §5.1): `@w6w/ui` is MIT, `@w6w/embed` is FSL. The dependency may only
// point ui <- embed, never the other way, and ui stays router-free and location-free so any host
// can mount it. Source scan over `src/**` (tests excluded: they hold the negative-control
// samples); each named rule has a sample proving it fires, plus a census proving the scan saw
// the files it claims to. Same idiom as studio's `packages/embed/src/__tests__/source-scan.test.ts`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const uiRoot = fileURLToPath(new URL("../..", import.meta.url));
const srcRoot = join(uiRoot, "src");

const SPECIFIER =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function specifiers(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(SPECIFIER)) {
    const spec = m[1] ?? m[2];
    if (spec !== undefined) out.push(spec);
  }
  return out;
}

interface Rule {
  name: string;
  /** Returns true when the source text of one file breaks the rule on this line. */
  line(line: string, specs: readonly string[]): boolean;
}

const RULES: Rule[] = [
  {
    name: "embed-import",
    line: (_l, specs) => specs.some((s) => s === "@w6w/embed" || s.startsWith("@w6w/embed/")),
  },
  {
    name: "router",
    line: (_l, specs) =>
      specs.some(
        (s) =>
          s === "react-router" ||
          s.startsWith("react-router/") ||
          s === "react-router-dom" ||
          s.startsWith("react-router-dom/"),
      ),
  },
  {
    name: "window-location",
    line: (l) => /\bwindow\.location\b|\bglobalThis\.location\b|\bhistory\.pushState\(/.test(l),
  },
];

/** `rule: line` for every violation in `source` (1-based lines). Specifiers are judged per line. */
function scan(source: string): Array<{ rule: string; line: number }> {
  const hits: Array<{ rule: string; line: number }> = [];
  source.split("\n").forEach((text, i) => {
    const specs = specifiers(text);
    for (const rule of RULES)
      if (rule.line(text, specs)) hits.push({ rule: rule.name, line: i + 1 });
  });
  return hits;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("licence seam: no ui source imports @w6w/embed or a router, or touches window.location", () => {
  const violations = sourceFiles(srcRoot).flatMap((file) =>
    scan(readFileSync(file, "utf8")).map((h) => `${h.rule}: ${relative(uiRoot, file)}:${h.line}`),
  );
  assert.deepEqual(violations, []);
});

test("licence seam: every rule fires on its own negative control", () => {
  const samples: Record<string, string> = {
    "embed-import": `import { visibleRows } from "@w6w/embed/lib";`,
    router: `import { Link } from "react-router-dom";`,
    "window-location": "const _u = window.location.href;",
  };
  assert.equal(RULES.length, Object.keys(samples).length);
  for (const rule of RULES) {
    const sample = samples[rule.name];
    assert.ok(sample, `${rule.name} has a sample`);
    assert.deepEqual(scan(sample), [{ rule: rule.name, line: 1 }], rule.name);
  }
  // Forms beyond the plain import: export-from and dynamic import also count.
  assert.equal(scan(`export * from "@w6w/embed";`)[0]?.rule, "embed-import");
  assert.equal(scan(`const m = await import("@w6w/embed/editor");`)[0]?.rule, "embed-import");
  // A comment that merely names the package is legal (specifiers are matched, not words).
  assert.deepEqual(scan("// imports nothing from @w6w/embed"), []);
});

test("licence seam: the census saw the sources, including every package.json exports entry", () => {
  const files = sourceFiles(srcRoot);
  assert.ok(files.length >= 121, `scanned only ${files.length} files`);
  const rel = new Set(files.map((f) => `./${relative(uiRoot, f).split("\\").join("/")}`));
  const pkg = JSON.parse(readFileSync(join(uiRoot, "package.json"), "utf8")) as {
    exports: Record<string, unknown>;
  };
  let entries = 0;
  for (const value of Object.values(pkg.exports)) {
    if (typeof value !== "object" || value === null) continue;
    const target =
      (value as Record<string, string>).import ?? (value as Record<string, string>).types;
    assert.ok(target, "object export has a source target");
    entries++;
    assert.ok(rel.has(target), `exports entry ${target} was scanned`);
  }
  assert.ok(entries >= 3, `expected the object-valued exports, saw ${entries}`);
});
