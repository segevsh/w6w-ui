// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/createW6WApi.test.ts
//
// Covers the `token` option's sync-or-async supplier shape (T1.2.1): a
// Promise-returning supplier resolves to a real bearer (never
// `[object Promise]`), a sync supplier is re-invoked once per request, and a
// nullish/empty resolution sends no `authorization` header at all.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createW6WApi } from "../createW6WApi.ts";
import type { W6WApi } from "../provider.tsx";

function fakeFetch(capture: Headers[]) {
  return (async (_url: string, init?: RequestInit) => {
    capture.push(new Headers(init?.headers));
    return new Response(JSON.stringify({ apps: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

// `W6WApi.listApps` is declared OPTIONAL on the public interface (other
// implementations may omit it); `createW6WApi`'s own always defines it. One
// request-triggering call, asserted present rather than non-null-asserted.
async function requestOnce(api: W6WApi) {
  assert.equal(typeof api.listApps, "function");
  await api.listApps?.();
}

test("a Promise-returning token supplier yields a real Bearer header", async () => {
  const captured: Headers[] = [];
  const api = createW6WApi({
    baseUrl: "https://example.test",
    token: () => Promise.resolve("async-token"),
    fetch: fakeFetch(captured),
  });

  await requestOnce(api);

  assert.equal(captured.length, 1);
  assert.equal(captured[0].get("authorization"), "Bearer async-token");
});

test("a sync token supplier is called once per request", async () => {
  const captured: Headers[] = [];
  let calls = 0;
  const api = createW6WApi({
    baseUrl: "https://example.test",
    token: () => {
      calls += 1;
      return `token-${calls}`;
    },
    fetch: fakeFetch(captured),
  });

  await requestOnce(api);
  await requestOnce(api);

  assert.equal(calls, 2);
  assert.equal(captured.length, 2);
  assert.equal(captured[0].get("authorization"), "Bearer token-1");
  assert.equal(captured[1].get("authorization"), "Bearer token-2");
  assert.notEqual(captured[0].get("authorization"), captured[1].get("authorization"));
});

test("a nullish or empty resolution sends no authorization header", async () => {
  for (const value of [null, undefined, ""] as const) {
    const captured: Headers[] = [];
    const api = createW6WApi({
      baseUrl: "https://example.test",
      token: () => Promise.resolve(value),
      fetch: fakeFetch(captured),
    });

    await requestOnce(api);

    assert.equal(captured.length, 1);
    assert.equal(captured[0].has("authorization"), false);
  }
});

test("a static string token still works", async () => {
  const captured: Headers[] = [];
  const api = createW6WApi({
    baseUrl: "https://example.test",
    token: "static-token",
    fetch: fakeFetch(captured),
  });

  await requestOnce(api);

  assert.equal(captured[0].get("authorization"), "Bearer static-token");
});

// ── T3.2.2: step metadata through the facade ────────────────────────────────
const SAMPLE_META = { app: "sendgrid", version: "1.2.3", action: "send", connectionId: "c9" };

function jsonFetch(sent: { url: string; body: unknown }[], reply: unknown) {
  return (async (url: string, init?: RequestInit) => {
    sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(reply), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("C1 — invokeAction returns meta, and the request body keys are unchanged", async () => {
  const sent: { url: string; body: unknown }[] = [];
  const api = createW6WApi({
    baseUrl: "https://example.test",
    fetch: jsonFetch(sent, { value: 1, meta: SAMPLE_META }),
  });
  const r = await api.invokeAction("sendgrid", "send", { a: 1 }, { connectionId: "c9" });
  assert.deepEqual(r.meta, SAMPLE_META);
  assert.equal(r.meta?.connectionId, "c9");
  assert.deepEqual(Object.keys(sent[0].body as object).sort(), ["connectionId", "params"]);
});

test("C2 — recordStepTestRun posts meta verbatim", async () => {
  const sent: { url: string; body: unknown }[] = [];
  const api = createW6WApi({
    baseUrl: "https://example.test",
    fetch: jsonFetch(sent, { run: {} }),
  });
  await api.recordStepTestRun("wf", "s1", { status: "succeeded", meta: SAMPLE_META });
  assert.deepEqual((sent[0].body as { meta: unknown }).meta, SAMPLE_META);
});

test("C3 — listStepTests passes lastRunMeta through", async () => {
  const sent: { url: string; body: unknown }[] = [];
  const api = createW6WApi({
    baseUrl: "https://example.test",
    fetch: jsonFetch(sent, { stepTests: [{ id: "t", lastRunMeta: SAMPLE_META }] }),
  });
  const [t] = await api.listStepTests("wf", "s1");
  assert.equal(t.lastRunMeta?.connectionId, "c9");
});
