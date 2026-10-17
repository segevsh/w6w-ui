// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/createW6WApi.test.ts
//
// Covers the `token` option's sync-or-async supplier shape (T1.2.1): a
// Promise-returning supplier resolves to a real bearer (never
// `[object Promise]`), a sync supplier is re-invoked once per request, and a
// nullish/empty resolution sends no `authorization` header at all.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, createW6WApi } from "../createW6WApi.ts";
import type { ConnectionAppMeta, ConnectionSummary } from "../index.ts";
import type { AppsPageResult, ListAppsPageOptions, W6WApi } from "../provider.tsx";

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

// ── T1.1.3 (R-B1′): createW6WApi's bounded `listAppsByIds` ────────────────────
function urlFetch(urls: string[], respond: (url: URL) => unknown) {
  return (async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify(respond(new URL(url))), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("T1.1.3 A1 — listAppsByIds dedupes into ONE GET /apps?ids= request and returns its apps", async () => {
  const urls: string[] = [];
  const api = createW6WApi({
    baseUrl: "https://example.test",
    fetch: urlFetch(urls, (u) => ({
      apps: (u.searchParams.get("ids") ?? "").split(",").map((id) => ({ id, displayName: id })),
    })),
  });
  assert.equal(typeof api.listAppsByIds, "function");
  const apps = await api.listAppsByIds?.(["slack", "github", "slack"]);

  assert.equal(urls.length, 1);
  const u = new URL(urls[0]);
  assert.equal(u.pathname, "/apps");
  assert.equal(u.searchParams.get("ids"), "slack,github");
  assert.equal(u.searchParams.get("limit"), null, "an ids lookup never asks for a catalog page");
  assert.deepEqual(
    apps?.map((a) => a.id),
    ["slack", "github"],
  );
});

test("T1.1.3 A2 — listAppsByIds([]) sends no request; >100 ids split into chunks of at most 100", async () => {
  const urls: string[] = [];
  const api = createW6WApi({
    baseUrl: "https://example.test",
    fetch: urlFetch(urls, () => ({ apps: [] })),
  });
  assert.deepEqual(await api.listAppsByIds?.([]), []);
  assert.equal(urls.length, 0, "an empty id list must never become an unfiltered catalog request");

  const ids = Array.from({ length: 150 }, (_, i) => `app_${i}`);
  await api.listAppsByIds?.(ids);
  assert.equal(urls.length, 2);
  const sizes = urls.map((s) => (new URL(s).searchParams.get("ids") ?? "").split(",").length);
  assert.deepEqual(sizes, [100, 50]);
});

// ── T1.1.3 type pins (R-A1/R-A3/R-A6) — gated by `tsc -b --noEmit`, not at runtime ──
const pinnedMeta: ConnectionAppMeta = {
  displayName: "Slack",
  iconSvg: "data:image/svg+xml;base64,AA==",
  iconSvgDark: "data:image/svg+xml;base64,AQ==",
  brandColor: "#4A154B",
  brandColorDark: "#ECB22E",
};
const pinnedRow: ConnectionSummary = {
  id: "c1",
  appId: "slack",
  authKey: "oauth",
  tenant: "t1",
  subject: "u1",
  app: pinnedMeta,
};
const pinnedNullApp: ConnectionSummary = { id: "c2", appId: "gone", authKey: "k", app: null };
const noOwner: ConnectionSummary = {
  id: "c3",
  appId: "slack",
  authKey: "k",
  // @ts-expect-error — `owner` is not on the wire (R-A6): the server sends `tenant`/`subject`.
  owner: "u1",
};
void [pinnedRow, pinnedNullApp, noOwner];

// ── T3.1.1: listApps walks ONE snapshot ───────────────────────────────────────
type Resp = { status?: number; body: unknown };
function seqFetch(urls: string[], respond: (url: URL, n: number) => Resp, max = 50) {
  return (async (url: string) => {
    urls.push(url);
    if (urls.length > max) throw new Error("fetch fake: runaway walk");
    const r = respond(new URL(url), urls.length);
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}
const pg = (n: number, last: number, tag = "") => ({
  apps: [{ id: `${tag}app${n}`, displayName: `${tag}app${n}` }],
  ...(n < last ? { nextCursor: `${tag}c${n + 1}` } : {}),
});
const expired = (code: string, status: number) => ({
  status,
  body: { error: { code, message: code } },
});

test("T3.1.1 A2 — listApps walks by nextCursor only: exact URLs, server order", async () => {
  const urls: string[] = [];
  const api = createW6WApi({
    baseUrl: "https://example.test",
    fetch: seqFetch(urls, (u) => {
      const c = u.searchParams.get("cursor");
      return { body: pg(c ? Number(c.slice(1)) : 1, 3) };
    }),
  });
  const apps = await api.listApps?.();
  assert.deepEqual(
    apps?.map((a) => a.id),
    ["app1", "app2", "app3"],
  );
  assert.deepEqual(urls, [
    "https://example.test/apps?limit=200",
    "https://example.test/apps?limit=200&cursor=c2",
    "https://example.test/apps?limit=200&cursor=c3",
  ]);
  for (const u of urls) {
    assert.equal(new URL(u).searchParams.get("snapshot"), null);
    assert.equal(new URL(u).searchParams.get("offset"), null);
  }
});

test("T3.1.1 A2 — listApps has no page cap: 25 pages => 25 requests, 25 apps", async () => {
  const urls: string[] = [];
  const api = createW6WApi({
    baseUrl: "https://example.test",
    fetch: seqFetch(urls, (u) => {
      const c = u.searchParams.get("cursor");
      return { body: pg(c ? Number(c.slice(1)) : 1, 25) };
    }),
  });
  const apps = await api.listApps?.();
  assert.equal(urls.length, 25);
  assert.equal(apps?.length, 25);
});

test("T3.1.1 A2 — a server echoing the cursor ends the walk (non-advancing guard)", async () => {
  const urls: string[] = [];
  const api = createW6WApi({
    baseUrl: "https://example.test",
    fetch: seqFetch(urls, () => ({
      body: { apps: [{ id: `a${urls.length}`, displayName: "x" }], nextCursor: "same" },
    })),
  });
  const apps = await api.listApps?.();
  assert.equal(urls.length, 2, "first (cursorless) + one echo, then stop");
  assert.equal(apps?.length, 2);
});

for (const [code, status] of [
  ["snapshot_expired", 410],
  ["unknown_snapshot", 404],
] as const) {
  test(`T3.1.1 A3 — ${status} ${code} on page 2 restarts once and returns only the second walk`, async () => {
    const urls: string[] = [];
    let failed = false;
    const api = createW6WApi({
      baseUrl: "https://example.test",
      fetch: seqFetch(urls, (u) => {
        const c = u.searchParams.get("cursor");
        if (c && !failed) {
          failed = true;
          return expired(code, status);
        }
        const tag = failed ? "second-" : "first-";
        return { body: pg(c ? Number(c.slice(c.lastIndexOf("c") + 1)) : 1, 3, tag) };
      }),
    });
    const apps = await api.listApps?.();
    assert.deepEqual(
      apps?.map((a) => a.id),
      ["second-app1", "second-app2", "second-app3"],
    );
    assert.equal(urls.length, 5);
    assert.equal(
      new URL(urls[2] as string).searchParams.get("cursor"),
      null,
      "restart is cursorless",
    );
  });
}

test("T3.1.1 A3 — a second expiry in one call throws after exactly 4 requests", async () => {
  const urls: string[] = [];
  const api = createW6WApi({
    baseUrl: "https://example.test",
    fetch: seqFetch(urls, (u) =>
      u.searchParams.get("cursor") ? expired("snapshot_expired", 410) : { body: pg(1, 3) },
    ),
  });
  await assert.rejects(
    () => api.listApps?.() as Promise<unknown>,
    (e: unknown) => e instanceof ApiError && e.code === "snapshot_expired",
  );
  assert.equal(urls.length, 4);
});

test("T3.1.1 A3 — any other error throws at once, no restart", async () => {
  const urls: string[] = [];
  const api = createW6WApi({
    baseUrl: "https://example.test",
    fetch: seqFetch(urls, (u) =>
      u.searchParams.get("cursor")
        ? { status: 500, body: { error: { code: "internal", message: "x" } } }
        : { body: pg(1, 3) },
    ),
  });
  await assert.rejects(
    () => api.listApps?.() as Promise<unknown>,
    (e: unknown) => e instanceof ApiError && e.code === "internal",
  );
  assert.equal(urls.length, 2);
});

// ── T3.1.1 A1 type pins (W-2) — gated by `tsc -b --noEmit`, not at runtime ──
const pinnedResultFull: AppsPageResult = {
  apps: [],
  nextCursor: "c",
  snapshot: "lsn_1",
  total: 5,
  offset: 0,
  limit: 200,
  expiresAt: "2026-10-16T00:00:00Z",
};
const pinnedResultBare: AppsPageResult = { apps: [] };
const pinnedOptsFull: ListAppsPageOptions = { snapshot: "lsn_1", offset: 10 };
const pinnedOptsBare: ListAppsPageOptions = {};
void [pinnedResultFull, pinnedResultBare, pinnedOptsFull, pinnedOptsBare];
