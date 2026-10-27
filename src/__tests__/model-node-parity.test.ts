// Run (from packages/ui): node --max-old-space-size=2048 --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/model-node-parity.test.ts
//
// acc-3 / DC-4: the `@w6w/model` palette entries in `INTERNAL_NODES` must match
// the internal-app manifest (action keys, each action's param keys, `required`
// set, and every param's static `options`, `default` and `placeholder` — a
// default or option the host rejects makes every editor-built step fail). The manifest is the SIBLING repo's source
// (`internal-apps/apps/model/index.ts`, N4), read as text — ui never imports it.
// The ONE sanctioned divergence is `route`: `string` in the manifest, the ui-only
// `model-route` in the entry (same precedent as `vars` <-> `json`).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { INTERNAL_NODES, MODEL_APP, internalNodeDef, internalNodeDefaults } from "../flow-types.ts";

const MANIFEST = fileURLToPath(
  new URL("../../../internal-apps/apps/model/index.ts", import.meta.url),
);

interface ParsedParam {
  required: boolean;
  type: string;
  /** `[value, label]` pairs of a static option list, in order. */
  options: Array<[string, string]>;
  /** The literal `default:` text, JSON-parsed; `undefined` when absent. */
  default: unknown;
  placeholder: string | undefined;
}

interface ParsedAction {
  params: Map<string, ParsedParam>;
}

/** Parse `{ key, params: [{ key, type, required }] }` actions out of the manifest source. */
function parseManifest(src: string): Map<string, ParsedAction> {
  const labels = new Map<string, string>();
  const lb = /const DIALECT_LABELS[\s\S]*?= \{([\s\S]*?)\};/.exec(src)?.[1] ?? "";
  for (const l of lb.matchAll(/(\w+): "([^"]*)"/g)) labels.set(l[1] ?? "", l[2] ?? "");
  const out = new Map<string, ParsedAction>();
  // Each action is a top-level `const x: ActionDefinition = { ... };` block.
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
        type: /^ {6}type: "([^"]+)"/m.exec(body)?.[1] ?? "",
        required: /^ {6}required: true/m.test(body),
        options: /^ {6}options: COMPLETION_OUTPUT_DIALECTS\.map\(/m.test(body)
          ? coreDialects().map((v): [string, string] => [v, labels.get(v) ?? ""])
          : [...body.matchAll(/^ {8}\{ value: "([^"]*)", label: "([^"]*)" \},$/gm)].map(
              (o): [string, string] => [o[1] ?? "", o[2] ?? ""],
            ),
        default: def === undefined ? undefined : JSON.parse(def),
        placeholder: /^ {6}placeholder: "([^"]*)"/m.exec(body)?.[1],
      });
    }
    out.set(key, { params });
  }
  return out;
}

const CORE_DIALECTS = fileURLToPath(
  new URL("../../../core/packages/types/src/model-completion.ts", import.meta.url),
);

/** The dialect values, read from core's `COMPLETION_OUTPUT_DIALECTS` const (not hardcoded). */
function coreDialects(): string[] {
  const m = /COMPLETION_OUTPUT_DIALECTS = \[([^\]]*)\]/.exec(readFileSync(CORE_DIALECTS, "utf8"));
  assert.ok(m, "COMPLETION_OUTPUT_DIALECTS found in core");
  return [...(m[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1] ?? "");
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
      const mp = m.params.get(p.key);
      const want = mp?.type;
      const ok = p.type === want || (p.type === "model-route" && want === "string");
      assert.ok(ok, `${e.action}.${p.key}: ui "${p.type}" vs manifest "${want}"`);
      const uiOptions = Array.isArray(p.options)
        ? p.options.map((o): [string, string] => [String(o.value), o.label])
        : [];
      assert.deepEqual(uiOptions, mp?.options, `${e.action}.${p.key}: options`);
      assert.deepEqual(p.default, mp?.default, `${e.action}.${p.key}: default`);
      assert.equal(p.placeholder, mp?.placeholder, `${e.action}.${p.key}: placeholder`);
    }
  }
});

test("@w6w/model complete seeds only values the host accepts", () => {
  // The host (`runInternalNode`, case MODEL_APP) takes dialect bridge|openai|anthropic|ollama
  // and response output|raw, each optional — unset keeps the provider's shape / both.
  const node = internalNodeDef(MODEL_APP, "complete");
  const opt = (k: string) =>
    node?.params.find((p) => p.key === k)?.options as Array<{ value: string }> | undefined;
  assert.deepEqual(
    opt("dialect")?.map((o) => o.value),
    coreDialects(),
  );
  assert.deepEqual(
    opt("response")?.map((o) => o.value),
    ["output", "raw"],
  );
  const defaults = internalNodeDefaults(MODEL_APP, "complete");
  assert.equal(defaults.dialect, undefined);
  assert.equal(defaults.response, undefined);
});
