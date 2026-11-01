// Run (from packages/ui): node --test src/__tests__/test-inputs.test.ts  (Node 24)
//
// Remembered test inputs (`node_test_inputs`, 0160): the tri-state read (no row / cleared /
// values), the secret rule on write (a literal typed into a `secret` param or a sealed envelope is
// never remembered; a binding is), and the adapter's wire.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createW6WApi } from "../createW6WApi.ts";
import { findTestInput, rememberableInput } from "../test-inputs.ts";
import type { ActionParam } from "../types.ts";

const ROWS = [
  { nodeId: "manual_trigger_1", input: { orderId: "5GIjY1redss2pXpti6vlj6" }, updatedAt: "" },
  { nodeId: "cleared", input: {}, updatedAt: "" },
];

test("findTestInput: no row → undefined, cleared → {}, else the values", () => {
  assert.deepEqual(findTestInput(ROWS, "manual_trigger_1"), { orderId: "5GIjY1redss2pXpti6vlj6" });
  assert.deepEqual(findTestInput(ROWS, "cleared"), {});
  assert.equal(findTestInput(ROWS, "other"), undefined);
  assert.equal(findTestInput(undefined, "x"), undefined);
});

test("rememberableInput drops secret literals and sealed envelopes, keeps bindings", () => {
  const params: ActionParam[] = [
    { key: "orderId", type: "string" },
    { key: "apiKey", type: "secret" },
    { key: "boundKey", type: "secret" },
    { key: "exprKey", type: "secret" },
  ];
  const expr = { type: "expr", parts: [{ kind: "ref", path: "secrets.API_KEY" }] };
  const out = rememberableInput(
    {
      orderId: "5GIj",
      apiKey: "sk_live_PLAINTEXT",
      boundKey: "{{ secrets.API_KEY }}",
      exprKey: expr,
      sealed: { type: "secret", ciphertext: "CIPHER", iv: "iv" },
      skipped: undefined,
    },
    params,
  );
  assert.deepEqual(out, { orderId: "5GIj", boundKey: "{{ secrets.API_KEY }}", exprKey: expr });
  assert.ok(!JSON.stringify(out).includes("sk_live_PLAINTEXT"));
  assert.ok(!JSON.stringify(out).includes("CIPHER"));
});

test("the adapter reads GET /test-inputs and writes PUT /nodes/:nodeId/test-input", async () => {
  const calls: { url: string; method: string; body?: string }[] = [];
  const api = createW6WApi({
    baseUrl: "https://example.test",
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
      const body = init?.method === "PUT" ? { ok: true } : { testInputs: ROWS };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });
  assert.deepEqual(await api.loadTestInputs?.("wf 1"), ROWS);
  await api.saveTestInput?.("wf 1", "manual_trigger_1", { orderId: "x" });
  assert.equal(calls[0].url, "https://example.test/workflows/wf%201/test-inputs");
  assert.equal(calls[1].method, "PUT");
  assert.equal(
    calls[1].url,
    "https://example.test/workflows/wf%201/nodes/manual_trigger_1/test-input",
  );
  assert.deepEqual(JSON.parse(calls[1].body ?? ""), { input: { orderId: "x" } });
});
