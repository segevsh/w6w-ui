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
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s*from\s*)?["']([^"']+)["']|\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

/** Every module specifier in the WHOLE file text (multi-line aware), with its 1-based line. */
function specifiers(source: string): Array<{ spec: string; line: number }> {
  const out: Array<{ spec: string; line: number }> = [];
  for (const m of source.matchAll(SPECIFIER)) {
    const spec = m[1] ?? m[2];
    if (spec === undefined) continue;
    const line = source.slice(0, m.index).split("\n").length;
    out.push({ spec, line });
  }
  return out;
}

type Rule = { name: string; spec: (spec: string) => boolean } | { name: string; text: RegExp };

const RULES: Rule[] = [
  { name: "embed-import", spec: (s) => s === "@w6w/embed" || s.startsWith("@w6w/embed/") },
  {
    name: "router",
    spec: (s) =>
      s === "react-router" ||
      s.startsWith("react-router/") ||
      s === "react-router-dom" ||
      s.startsWith("react-router-dom/"),
  },
  {
    name: "window-location",
    text: /\bwindow\.location\b|\bglobalThis\.location\b|\bhistory\.pushState\(/,
  },
];

/**
 * `rule: line` for every violation in `source` (1-based lines). Specifier rules run over the
 * whole file text so a wrapped `import {\n A,\n} from "…"` is caught, reported at the line
 * of its `import`/`export` keyword; text rules run per line.
 */
function scan(source: string): Array<{ rule: string; line: number }> {
  const hits: Array<{ rule: string; line: number }> = [];
  const specs = specifiers(source);
  for (const rule of RULES) {
    if ("spec" in rule) {
      for (const s of specs) if (rule.spec(s.spec)) hits.push({ rule: rule.name, line: s.line });
    } else {
      source.split("\n").forEach((text, i) => {
        if (rule.text.test(text)) hits.push({ rule: rule.name, line: i + 1 });
      });
    }
  }
  return hits.sort((x, y) => x.line - y.line);
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
  // Multi-line forms (Biome wraps imports over 100 columns) are caught, at the keyword's line.
  const multi: Array<[string, string, string]> = [
    ["embed-import", `\nimport {\n  visibleRows,\n} from "@w6w/embed/lib";`, "import-from"],
    ["embed-import", `\nimport type {\n  A,\n  B,\n} from "@w6w/embed";`, "import-type"],
    ["embed-import", `\nexport {\n  x,\n} from "@w6w/embed";`, "export-from"],
    ["embed-import", `\nconst m = await import(\n  "@w6w/embed/editor"\n);`, "dynamic"],
    ["router", `\nimport {\n  Link,\n} from "react-router-dom";`, "router"],
    ["embed-import", `\nconst m = require("@w6w/embed");`, "require"],
  ];
  for (const [rule, src, label] of multi)
    assert.deepEqual(scan(src), [{ rule, line: 2 }], `${rule} ${label}`);
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
