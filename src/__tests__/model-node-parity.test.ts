// Run (from packages/ui): node --max-old-space-size=2048 --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/model-node-parity.test.ts
//
// acc-3 / DC-4: the `@w6w/model` palette entries in `INTERNAL_NODES` must match
// the internal-app manifest (action keys, each action's param keys and
// `required` set). The manifest is the SIBLING repo's source
// (`internal-apps/apps/model/index.ts`, N4), read as text — ui never imports it.
// The ONE sanctioned divergence is `route`: `string` in the manifest, the ui-only
// `model-route` in the entry (same precedent as `vars` <-> `json`).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { INTERNAL_NODES, MODEL_APP, internalNodeDef } from "../flow-types.ts";

const MANIFEST = fileURLToPath(
  new URL("../../../internal-apps/apps/model/index.ts", import.meta.url),
);

interface ParsedAction {
  params: Map<string, { required: boolean; type: string }>;
}

/** Parse `{ key, params: [{ key, type, required }] }` actions out of the manifest source. */
function parseManifest(src: string): Map<string, ParsedAction> {
  const out = new Map<string, ParsedAction>();
  // Each action is a top-level `const x: ActionDefinition = { ... };` block.
  const blocks = src.match(/^const \w+: ActionDefinition = \{[\s\S]*?^\};/gm) ?? [];
  for (const block of blocks) {
    const key = /^ {2}key: "([^"]+)"/m.exec(block)?.[1];
    assert.ok(key, "action block has a key");
    const params = new Map<string, { required: boolean; type: string }>();
    const list = /^ {2}params: \[([\s\S]*?)^ {2}\],/m.exec(block)?.[1] ?? "";
    for (const m of list.matchAll(/^ {4}\{\n([\s\S]*?)^ {4}\},/gm)) {
      const body = m[1] ?? "";
      const pk = /^ {6}key: "([^"]+)"/m.exec(body)?.[1];
      assert.ok(pk, `param in ${key} has a key`);
      params.set(pk, {
        type: /^ {6}type: "([^"]+)"/m.exec(body)?.[1] ?? "",
        required: /^ {6}required: true/m.test(body),
      });
    }
    out.set(key, { params });
  }
  return out;
}

const sortSet = (xs: Iterable<string>) => [...xs].sort();

test("internalNodeDef resolves @w6w/model actions", () => {
  assert.equal(MODEL_APP, "@w6w/model");
  for (const a of ["complete", "list-models", "allowance"]) {
    assert.equal(internalNodeDef(MODEL_APP, a)?.action, a);
  }
  const route = internalNodeDef(MODEL_APP, "complete")?.params.find((p) => p.key === "route");
  assert.equal(route?.type, "model-route");
});

test("@w6w/model palette entries match the internal-app manifest", () => {
  const manifest = parseManifest(readFileSync(MANIFEST, "utf8"));
  const entries = INTERNAL_NODES.filter((n) => n.app === MODEL_APP);
  assert.ok(manifest.size > 0, "manifest parsed at least one action");
  assert.deepEqual(
    sortSet(entries.map((e) => e.action)),
    sortSet(manifest.keys()),
    "action key set",
  );
  for (const e of entries) {
    const m = manifest.get(e.action);
    assert.ok(m, e.action);
    assert.deepEqual(
      sortSet(e.params.map((p) => p.key)),
      sortSet(m.params.keys()),
      `${e.action}: param key set`,
    );
    assert.deepEqual(
      sortSet(e.params.filter((p) => p.required).map((p) => p.key)),
      sortSet([...m.params].filter(([, v]) => v.required).map(([k]) => k)),
      `${e.action}: required set`,
    );
    for (const p of e.params) {
      const want = m.params.get(p.key)?.type;
      const ok = p.type === want || (p.type === "model-route" && want === "string");
      assert.ok(ok, `${e.action}.${p.key}: ui "${p.type}" vs manifest "${want}"`);
    }
  }
});
