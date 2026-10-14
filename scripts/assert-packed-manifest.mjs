#!/usr/bin/env node
// usage: node scripts/assert-packed-manifest.mjs <path/to/w6w-ui-X.Y.Z.tgz>
//
// Asserts that the tarball about to be published is the one we meant to ship:
// the manifest INSIDE it points at `./dist/*` (a `publishConfig` override that
// only `pnpm pack` applies — `npm pack`/`npm publish` of a directory ignore it
// and would ship a manifest pointing at `src/*`), every exports target exists
// in the tarball, no dependency is a non-registry spec, and no test/story
// files rode along. Exits 0 when all hold; otherwise prints each reason and
// exits 1 (2 on a usage error).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tgz = process.argv[2];
if (!tgz) {
  console.error("usage: assert-packed-manifest.mjs <tarball>");
  process.exit(2);
}

const problems = [];
const bad = (msg) => problems.push(msg);

const files = new Set(
  execFileSync("tar", ["-tzf", tgz], { encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\n")
    .filter(Boolean)
    .map((f) => f.replace(/^package\//, "")),
);
if (!files.has("package.json")) {
  console.error("FAIL: tarball has no package/package.json");
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), "ui-packed-manifest-"));
let m;
try {
  execFileSync("tar", ["-xzf", tgz, "-C", scratch, "package/package.json"]);
  m = JSON.parse(readFileSync(join(scratch, "package", "package.json"), "utf8"));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const exists = (target) => {
  const rel = target.replace(/^\.\//, "");
  if (!rel.includes("*")) return files.has(rel);
  const [a, b] = rel.split("*");
  return [...files].some((f) => f.startsWith(a) && f.endsWith(b) && f.length > a.length + b.length - 1);
};

for (const k of ["main", "module", "types"]) {
  if (typeof m[k] !== "string" || !m[k].startsWith("./dist/")) {
    bad(`manifest.${k} is ${JSON.stringify(m[k])}, expected ./dist/*`);
  }
}

const targets = (v) =>
  typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(targets) : [];
const exp = m.exports ?? {};
for (const key of [".", "./flow", "./code"]) {
  if (!(key in exp)) bad(`exports["${key}"] missing`);
  for (const t of targets(exp[key])) {
    if (!t.startsWith("./dist/")) bad(`exports["${key}"] target ${t} is not under ./dist/`);
  }
}
for (const [key, v] of Object.entries(exp)) {
  for (const t of targets(v)) {
    if (!exists(t)) bad(`exports["${key}"] target ${t} is not in the tarball`);
  }
}
for (const k of ["main", "module", "types"]) {
  if (typeof m[k] === "string" && !exists(m[k])) bad(`manifest.${k} ${m[k]} is not in the tarball`);
}

const NON_REGISTRY = /^(link|github|file|workspace|git)(:|\+)/;
for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
  for (const [name, spec] of Object.entries(m[field] ?? {})) {
    if (NON_REGISTRY.test(String(spec))) bad(`${field}["${name}"] is ${spec} (non-registry spec)`);
  }
}

if (m.license !== "MIT") bad(`license is ${JSON.stringify(m.license)}, expected MIT`);
for (const f of ["LICENSE", "README.md"]) {
  if (!files.has(f)) bad(`${f} is not in the tarball`);
}
for (const f of files) {
  if (/__tests__|\.stories\.|test-jsx-loader/.test(f)) bad(`test/story file packed: ${f}`);
}

if (problems.length) {
  console.error(`FAIL: ${tgz}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`OK: ${tgz} (${files.size} entries; ${m.name}@${m.version})`);
