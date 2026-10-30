// Run (from packages/ui): node --max-old-space-size=2048 --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/flow-control-parity.test.ts
//
// T2.2.1 (D-A7, intake 3.2): the `@w6w/control` palette entries in `INTERNAL_NODES` must agree
// with the internal-app manifest (`internal-apps/apps/flow-control/index.ts`, read as text, never
// imported): action key set, each action's param key set, and for every shared param its
// `required`, `default`, `hidden` and `whole`. Mirrors `model-node-parity.test.ts`.
//
// SANCTIONED divergences (recorded, not fixed; each must STILL diverge or the test fails):
//  - parallel.branches, parallel.strategy: in the manifest, absent from the ui entry.
//  - wait.until: in the manifest, absent from the ui entry (WaitEditor owns it).
//  - aggregate.mode, merge.mode: default "array" in ui, "object" in the manifest.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CONTROL_APP, INTERNAL_NODES, internalNodeDef } from "../flow-types.ts";

const MANIFEST = fileURLToPath(
  new URL("../../../internal-apps/apps/flow-control/index.ts", import.meta.url),
);

interface ParsedParam {
  required: boolean;
  hidden: boolean;
  whole: boolean;
  default: unknown;
}

function parseManifest(src: string): Map<string, Map<string, ParsedParam>> {
  const out = new Map<string, Map<string, ParsedParam>>();
  const blocks = src.match(/^const \w+: ActionDefinition = \{[\s\S]*?^\};/gm) ?? [];
  for (const block of blocks) {
    const key = /^ {2}key: "([^"]+)"/m.exec(block)?.[1];
    assert.ok(key, "action block has a key");
    const params = new Map<string, ParsedParam>();
    const list = /^ {2}params: \[([\s\S]*?)^ {2}\],/m.exec(block)?.[1] ?? "";
    for (const m of list.matchAll(/^ {4}\{\n([\s\S]*?)^ {4}\},/gm)) {
      const body = m[1] ?? "";
      const pk = /^ {6}key: "([^"]+)"/m.exec(body)?.[1];
      assert.ok(pk, `param in ${key} has a key`);
      const def = /^ {6}default: (.+),$/m.exec(body)?.[1];
      params.set(pk, {
        required: /^ {6}required: true/m.test(body),
        hidden: /^ {6}hidden: true/m.test(body),
        whole: /^ {6}whole: true/m.test(body),
        default: def === undefined ? undefined : JSON.parse(def),
      });
    }
    out.set(key, params);
  }
  return out;
}

type Dim = "absent-from-ui" | "default";
const SANCTIONED: Array<{ action: string; param: string; dim: Dim }> = [
  { action: "parallel", param: "branches", dim: "absent-from-ui" },
  { action: "parallel", param: "strategy", dim: "absent-from-ui" },
  { action: "wait", param: "until", dim: "absent-from-ui" },
  { action: "aggregate", param: "mode", dim: "default" },
  { action: "merge", param: "mode", dim: "default" },
];
const sanctioned = (action: string, param: string, dim: Dim) =>
  SANCTIONED.some((s) => s.action === action && s.param === param && s.dim === dim);
const sortSet = (xs: Iterable<string>) => [...xs].sort();

test("foreach ui entry: items whole+required, body/parallelism hidden, no defaults", () => {
  const p = internalNodeDef(CONTROL_APP, "foreach")?.params ?? [];
  assert.deepEqual(
    p.map((x) => x.key),
    ["items", "body", "parallelism"],
  );
  const flags = p.map((x) => ({
    key: x.key,
    required: x.required === true,
    whole: x.whole === true,
    hidden: x.hidden === true,
    hasDefault: x.default !== undefined,
  }));
  assert.deepEqual(flags, [
    { key: "items", required: true, whole: true, hidden: false, hasDefault: false },
    { key: "body", required: false, whole: false, hidden: true, hasDefault: false },
    { key: "parallelism", required: false, whole: false, hidden: true, hasDefault: false },
  ]);
});

test(
  "@w6w/control palette entries match the flow-control manifest",
  { skip: existsSync(MANIFEST) ? false : "internal-apps sibling checkout not present" },
  () => {
    const manifest = parseManifest(readFileSync(MANIFEST, "utf8"));
    const entries = INTERNAL_NODES.filter((n) => n.app === CONTROL_APP);
    assert.equal(manifest.size, 6, "manifest parsed 6 actions");
    assert.deepEqual(
      sortSet(entries.map((e) => e.action)),
      sortSet(manifest.keys()),
      "action key set",
    );
    const staleCheck = new Set<string>();
    for (const e of entries) {
      const m = manifest.get(e.action);
      assert.ok(m, e.action);
      const uiKeys = new Set(e.params.map((p) => p.key));
      for (const k of m.keys()) {
        if (uiKeys.has(k)) continue;
        assert.ok(
          sanctioned(e.action, k, "absent-from-ui"),
          `${e.action}.${k}: in manifest, absent from ui, not sanctioned`,
        );
        staleCheck.add(`${e.action}.${k}.absent-from-ui`);
      }
      for (const k of uiKeys) {
        assert.ok(m.has(k), `${e.action}.${k}: in ui, absent from manifest`);
      }
      for (const p of e.params) {
        const mp = m.get(p.key);
        assert.ok(mp, `${e.action}.${p.key}`);
        const at = `${e.action}.${p.key}`;
        assert.equal(p.required === true, mp.required, `${at}: required`);
        assert.equal(p.hidden === true, mp.hidden, `${at}: hidden`);
        assert.equal(p.whole === true, mp.whole, `${at}: whole`);
        const same = JSON.stringify(p.default) === JSON.stringify(mp.default);
        if (!same) {
          assert.ok(
            sanctioned(e.action, p.key, "default"),
            `${at}: default differs, not sanctioned`,
          );
          staleCheck.add(`${at}.default`);
        }
      }
    }
    for (const s of SANCTIONED) {
      assert.ok(
        staleCheck.has(`${s.action}.${s.param}.${s.dim}`),
        `stale sanction: ${s.action}.${s.param} no longer diverges (${s.dim})`,
      );
    }
  },
);
