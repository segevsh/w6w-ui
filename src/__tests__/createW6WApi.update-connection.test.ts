// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/createW6WApi.update-connection.test.ts
//
// `updateConnection` is `PATCH /connections/<encodeURIComponent(id)>` with the body JSON-encoded,
// and resolves the response's `connection`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createW6WApi } from "../createW6WApi.ts";

interface Seen {
  url: string;
  method?: string;
  body?: unknown;
}

function setup() {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    seen.push({ url: String(url), method: init?.method, body: init?.body });
    return new Response(
      JSON.stringify({ connection: { id: "zerocred:slack/x", appId: "slack", authKey: "k" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  const api = createW6WApi({ baseUrl: "https://example.test", token: "t", fetch: fetchImpl });
  return { api, seen };
}

test("updateConnection PATCHes the encoded id with a JSON string body and returns the connection", async () => {
  const { api, seen } = setup();
  assert.equal(typeof api.updateConnection, "function");
  const out = await api.updateConnection?.("zerocred:slack/x", {
    displayName: "New name",
    credential: { token: "s3cret" },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, "PATCH");
  assert.equal(seen[0].url, "https://example.test/connections/zerocred%3Aslack%2Fx");
  assert.equal(typeof seen[0].body, "string");
  assert.deepEqual(JSON.parse(seen[0].body as string), {
    displayName: "New name",
    credential: { token: "s3cret" },
  });
  assert.deepEqual(out, { id: "zerocred:slack/x", appId: "slack", authKey: "k" });
});
