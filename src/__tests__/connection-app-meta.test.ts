// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/connection-app-meta.test.ts
//
// A connection's own `app` field wins; `null` means "not found" (no fallback to
// the by-id record, no lookup); `undefined` means an older server (by-id).
// Every expectation below is an independent literal.

import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionAppIdsToLookUp, resolveConnectionAppMeta } from "../connection-app-meta.ts";

test("inline app meta wins; null means not found (no by-id fallback); undefined uses by-id", () => {
  const byId = new Map([["acme", { displayName: "ById Acme", brandColor: "#111111" }]]);
  const inline = { displayName: "Inline", iconSvg: "data:x", brandColor: "#222222" };

  assert.deepEqual(resolveConnectionAppMeta({ appId: "acme", app: inline }, byId), {
    displayName: "Inline",
    iconSvg: "data:x",
    brandColor: "#222222",
  });
  assert.equal(resolveConnectionAppMeta({ appId: "acme", app: null }, byId), undefined);
  assert.deepEqual(resolveConnectionAppMeta({ appId: "acme" }, byId), {
    displayName: "ById Acme",
    brandColor: "#111111",
  });
  assert.equal(resolveConnectionAppMeta({ appId: "other" }, byId), undefined);
});

test("lookup ids are unique, first-seen order, and exclude object and null rows", () => {
  const rows = [
    { appId: "b" },
    { appId: "inline", app: { displayName: "I" } },
    { appId: "a", app: undefined },
    { appId: "b" },
    { appId: "gone", app: null },
    { appId: "c" },
    { appId: "a" },
  ];
  assert.deepEqual(connectionAppIdsToLookUp(rows), ["b", "a", "c"]);
  assert.deepEqual(connectionAppIdsToLookUp([]), []);
  assert.deepEqual(connectionAppIdsToLookUp([{ appId: "x", app: null }]), []);
});
