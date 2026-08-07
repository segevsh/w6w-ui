// Run: node --test src/components/__tests__/UptimeStrip.test.ts  (Node 24, type-stripped)
//
// Node's type-stripping does NOT transform JSX, so the component is transpiled
// with the package's own `typescript` and rendered with its own `react-dom` —
// both already devDependencies, so this adds no dependency. The point is to
// assert what the strip actually RENDERS (a cell per day, a per-state class, a
// title on every cell, no colour literal), which a grep over the source cannot.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { UptimeDay, UptimeStripProps } from "../UptimeStrip.tsx";

const here = dirname(fileURLToPath(import.meta.url));
// Inside node_modules so the emitted `react/jsx-runtime` import resolves, and so
// the scratch file is invisible to git / tsc / biome.
const outDir = join(here, "..", "..", "..", "node_modules", ".w6w-jsx-test");
const outFile = join(outDir, "UptimeStrip.mjs");

mkdirSync(outDir, { recursive: true });
writeFileSync(
  outFile,
  ts.transpileModule(readFileSync(join(here, "..", "UptimeStrip.tsx"), "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText,
);
after(() => rmSync(outDir, { recursive: true, force: true }));

const { UptimeStrip } = (await import(pathToFileURL(outFile).href)) as {
  UptimeStrip: (props: UptimeStripProps) => ReturnType<typeof createElement>;
};

const render = (props: UptimeStripProps) => renderToStaticMarkup(createElement(UptimeStrip, props));

const day = (n: number, state: UptimeDay["state"]): UptimeDay => ({
  day: `2026-07-${String(n).padStart(2, "0")}`,
  state,
});

const THIRTY: UptimeDay[] = Array.from({ length: 30 }, (_, i) =>
  day(i + 1, i === 6 ? "down" : i === 12 || i === 13 ? "degraded" : i > 26 ? "unknown" : "ok"),
);

test("renders one cell per supplied entry — not a fixed 30", () => {
  for (const n of [1, 7, 30, 45]) {
    const html = render({ days: THIRTY.slice(0, n) });
    assert.equal(
      html.split("w6w-uptime-cell ").length - 1,
      Math.min(n, THIRTY.length),
      `expected ${n} cells`,
    );
  }
});

test("each state gets its own cell class, and only the four states exist", () => {
  const html = render({ days: THIRTY });
  for (const state of ["ok", "degraded", "down", "unknown"]) {
    assert.match(html, new RegExp(`class="w6w-uptime-cell w6w-uptime-cell-${state}"`), state);
  }
  const classes = new Set(
    [...html.matchAll(/w6w-uptime-cell-([a-z]+)/g)].map((m) => m[1] as string),
  );
  assert.deepEqual([...classes].sort(), ["degraded", "down", "ok", "unknown"]);
});

test("every cell carries a title with its day and state — colour is never the only signal", () => {
  const html = render({ days: THIRTY });
  assert.equal(html.split("title=").length - 1, THIRTY.length);
  assert.ok(html.includes('title="2026-07-07 — Down"'), html.slice(0, 400));
  assert.ok(html.includes('title="2026-07-13 — Degraded"'));
  assert.ok(html.includes('title="2026-07-01 — Operational"'));
  assert.ok(html.includes('title="2026-07-28 — Unknown"'));
});

test("a per-day label overrides the default tooltip", () => {
  const html = render({ days: [{ day: "2026-07-01", state: "down", label: "all day" }] });
  assert.ok(html.includes('title="all day"'));
  assert.ok(!html.includes("Down"));
});

test("no colour literal and no inline style reaches the markup — tokens do the colouring", () => {
  const html = render({ days: THIRTY });
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(html, /rgb|style=/);
});

test("the strip is exposed as one labelled image", () => {
  assert.match(render({ days: THIRTY }), /role="img" aria-label="30-day status"/);
  assert.match(
    render({ days: THIRTY, ariaLabel: "Slack, last 30 days" }),
    /aria-label="Slack, last 30 days"/,
  );
});

test("no days renders nothing at all", () => {
  assert.equal(render({ days: [] }), "");
});
