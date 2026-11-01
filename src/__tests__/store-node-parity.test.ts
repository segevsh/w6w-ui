// Run (from packages/ui): node --max-old-space-size=2048 --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/store-node-parity.test.ts
//
// The `@w6w/store` palette entries in `INTERNAL_NODES` must match the internal-app manifest
// (action keys, each action's param keys, `required` set, and every param's `type`, static
// `options`, `default` and `placeholder` — a default or option the host rejects makes every
// editor-built step fail) AND the S-4 seam, restated below as an independent literal so a
// drifted manifest and a drifted entry can't agree on the wrong thing. The manifest is the
// SIBLING repo's source (`internal-apps/apps/store/index.ts`), read as text — ui never
// imports it. The TWO sanctioned divergences are `store`: `string` in the manifest, the ui-only
// `data-store` in the entry (same precedent as `@w6w/model`'s `route` <-> `model-route`), and
// `key`: `string` in the manifest, the ui-only `data-store-key` entry picker. Each is keyed to
// its param — an unkeyed sanction would let a `key` -> `data-store` drift pass.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { INTERNAL_NODES, STORE_APP, internalNodeDef, internalNodeDefaults } from "../flow-types.ts";

const MANIFEST = fileURLToPath(
  new URL("../../../internal-apps/apps/store/index.ts", import.meta.url),
);

/** S-4's action set, in order. */
const S4_ACTIONS = ["get", "set", "delete", "increment", "list", "query", "insert"];

/** S-4's top-level output keys per action (pinned decision 3). */
const S4_OUTPUT: Record<string, string[]> = {
  get: ["found", "key", "value", "version", "expiresAt"],
  set: ["key", "value", "version", "expiresAt"],
  delete: ["key", "deleted"],
  increment: ["key", "value", "version"],
  list: ["items", "nextCursor"],
  query: ["items"],
  insert: ["key", "value", "version"],
};

/** The only defaults S-4 gives, as `action.param`. */
const S4_DEFAULTS: Record<string, unknown> = {
  "get.required": false,
  "increment.by": 1,
  "list.limit": 50,
};

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
        options: [...body.matchAll(/^ {8}\{ value: "([^"]*)", label: "([^"]*)" \},$/gm)].map(
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

const sortSet = (xs: Iterable<string>) => [...xs].sort();

const entries = () => INTERNAL_NODES.filter((n) => n.app === STORE_APP);

test("internalNodeDef resolves every @w6w/store action, with the S-4 action set", () => {
  assert.equal(STORE_APP, "@w6w/store");
  assert.deepEqual(
    entries().map((e) => e.action),
    S4_ACTIONS,
  );
  for (const a of S4_ACTIONS) assert.equal(internalNodeDef(STORE_APP, a)?.action, a);
});

test("every @w6w/store entry's store param is the data-store picker type", () => {
  for (const e of entries()) {
    assert.equal(e.params.find((p) => p.key === "store")?.type, "data-store", `${e.action}.store`);
  }
});

test("every @w6w/store entry's key param is the data-store-key picker type", () => {
  for (const e of entries()) {
    const key = e.params.find((p) => p.key === "key");
    if (key) assert.equal(key.type, "data-store-key", `${e.action}.key`);
  }
  assert.deepEqual(
    entries()
      .filter((e) => e.params.some((p) => p.key === "key"))
      .map((e) => e.action),
    ["get", "set", "delete", "increment"],
  );
});

test("@w6w/store entries carry no scope param and one distinct label each", () => {
  const FORBIDDEN = ["scope", "account", "project", "tenant", "subject", "input"];
  for (const e of entries()) {
    for (const p of e.params) assert.ok(!FORBIDDEN.includes(p.key), `${e.action}.${p.key}`);
    assert.equal(e.displayName, "Store");
    assert.equal(e.ports?.in, 1);
    assert.equal(e.ports?.out, 1);
  }
  const labels = INTERNAL_NODES.map((n) => n.label);
  assert.equal(new Set(labels).size, labels.length, "every palette label is distinct");
});

test("@w6w/store output keys equal S-4's top-level output", () => {
  for (const e of entries()) {
    assert.deepEqual(
      e.output?.map((o) => o.key),
      S4_OUTPUT[e.action],
      `${e.action}: output keys`,
    );
  }
});

test("internalNodeDefaults seeds only required:false, by:1 and limit:50", () => {
  const seeded: Record<string, unknown> = {};
  for (const a of S4_ACTIONS) {
    for (const [k, v] of Object.entries(internalNodeDefaults(STORE_APP, a))) {
      seeded[`${a}.${k}`] = v;
    }
  }
  assert.deepEqual(seeded, S4_DEFAULTS);
});

// The release workflow checks out only ui + core, so the sibling manifest is absent there;
// skip rather than fail on a missing checkout. Locally (and wherever internal-apps sits
// beside ui) the parity check runs in full — a run that reports `# skipped 1` here has NOT
// verified the palette against the manifest.
const HAS_MANIFEST = existsSync(MANIFEST);

test(
  "@w6w/store palette entries match the internal-app manifest",
  {
    skip: HAS_MANIFEST ? false : "internal-apps sibling checkout not present",
  },
  () => {
    const manifest = parseManifest(readFileSync(MANIFEST, "utf8"));
    assert.ok(manifest.size > 0, "manifest parsed at least one action");
    assert.deepEqual(sortSet(manifest.keys()), sortSet(S4_ACTIONS), "manifest action set is S-4's");
    assert.deepEqual(
      sortSet(entries().map((e) => e.action)),
      sortSet(manifest.keys()),
      "action key set",
    );
    for (const e of entries()) {
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
        const ok =
          p.type === mp?.type ||
          (p.key === "store" && p.type === "data-store" && mp?.type === "string") ||
          (p.key === "key" && p.type === "data-store-key" && mp?.type === "string");
        assert.ok(ok, `${e.action}.${p.key}: ui "${p.type}" vs manifest "${mp?.type}"`);
        const uiOptions = Array.isArray(p.options)
          ? p.options.map((o): [string, string] => [String(o.value), o.label])
          : [];
        assert.deepEqual(uiOptions, mp?.options, `${e.action}.${p.key}: options`);
        assert.deepEqual(p.default, mp?.default, `${e.action}.${p.key}: default`);
        assert.equal(p.placeholder, mp?.placeholder, `${e.action}.${p.key}: placeholder`);
        assert.deepEqual(
          p.default,
          S4_DEFAULTS[`${e.action}.${p.key}`],
          `${e.action}.${p.key}: default is S-4's`,
        );
      }
    }
  },
);
