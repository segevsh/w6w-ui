// Run (from packages/ui): NODE_OPTIONS=--experimental-strip-types node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/createW6WApi.credentials.test.ts
//
// T5.2 - the eight optional credential methods of createW6WApi (case W1) and the CreateConnectionBody union.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, createW6WApi } from "../createW6WApi.ts";
import type { CreateConnectionBody } from "../types.ts";

// A body carrying both an inline credential and a credentialId must not type-check.
// @ts-expect-error credential XOR credentialId
const _bad: CreateConnectionBody = { authKey: "k", credential: {}, credentialId: "c" };
void _bad;

interface Seen {
  url: string;
  method?: string;
  body?: unknown;
}
function setup(status: number, payload: unknown) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    seen.push({ url: String(url), method: init?.method, body: init?.body });
    return new Response(status === 204 ? null : JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const api = createW6WApi({ baseUrl: "https://example.test", token: "t", fetch: fetchImpl });
  return { api, seen };
}
const B = "https://example.test";
const CRED = { id: "cred/x", name: "n" };

test("W1 listCredentials: GET /credentials, only given query keys, unwraps credentials", async () => {
  const { api, seen } = setup(200, { credentials: [CRED] });
  assert.deepEqual(await api.listCredentials?.(), [CRED]);
  await api.listCredentials?.({ contract: "c.v1", authKey: "a b" });
  assert.equal(seen[0].url, `${B}/credentials`);
  assert.equal(seen[0].method ?? "GET", "GET");
  assert.equal(seen[1].url, `${B}/credentials?contract=c.v1&authKey=a+b`);
});

test("W1 createCredential: POST /credentials with body, unwraps credential", async () => {
  const { api, seen } = setup(201, { credential: CRED });
  const body = { name: "n", contract: "c.v1", source: { k: 1 } };
  assert.deepEqual(await api.createCredential?.(body), CRED);
  assert.equal(seen[0].url, `${B}/credentials`);
  assert.equal(seen[0].method, "POST");
  assert.deepEqual(JSON.parse(seen[0].body as string), body);
});

test("W1 getCredential: GET encoded id, unwraps credential", async () => {
  const { api, seen } = setup(200, { credential: CRED });
  assert.deepEqual(await api.getCredential?.("cred/x"), CRED);
  assert.equal(seen[0].url, `${B}/credentials/cred%2Fx`);
  assert.equal(seen[0].method ?? "GET", "GET");
});

test("W1 rotateCredential: POST /rotate with {source}, unwraps credential", async () => {
  const { api, seen } = setup(200, { credential: CRED });
  assert.deepEqual(await api.rotateCredential?.("cred/x", { source: { k: 2 } }), CRED);
  assert.equal(seen[0].url, `${B}/credentials/cred%2Fx/rotate`);
  assert.equal(seen[0].method, "POST");
  assert.deepEqual(JSON.parse(seen[0].body as string), { source: { k: 2 } });
});

test("W1 setCredentialStatus: disabled -> /disable, active -> /enable", async () => {
  const { api, seen } = setup(200, { credential: CRED });
  assert.deepEqual(await api.setCredentialStatus?.("cred/x", "disabled"), CRED);
  await api.setCredentialStatus?.("cred/x", "active");
  assert.equal(seen[0].url, `${B}/credentials/cred%2Fx/disable`);
  assert.equal(seen[1].url, `${B}/credentials/cred%2Fx/enable`);
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[1].method, "POST");
});

test("W1 testCredential: POST /test, body as-is", async () => {
  const res = { ok: false, code: "credential_invalid" };
  const { api, seen } = setup(200, res);
  assert.deepEqual(await api.testCredential?.("cred/x"), res);
  assert.equal(seen[0].url, `${B}/credentials/cred%2Fx/test`);
  assert.equal(seen[0].method, "POST");
});

test("W1 credentialDependents: GET /dependents, unwraps dependents", async () => {
  const deps = { connections: [{ id: "c1", appId: "gmail", authKey: "k" }] };
  const { api, seen } = setup(200, { dependents: deps });
  assert.deepEqual(await api.credentialDependents?.("cred/x"), deps);
  assert.equal(seen[0].url, `${B}/credentials/cred%2Fx/dependents`);
  assert.equal(seen[0].method ?? "GET", "GET");
});

test("W1 deleteCredential: DELETE resolves void; a 409 rejects credential_in_use with nested dependents", async () => {
  const ok = setup(204, null);
  assert.equal(await ok.api.deleteCredential?.("cred/x"), undefined);
  assert.equal(ok.seen[0].url, `${B}/credentials/cred%2Fx`);
  assert.equal(ok.seen[0].method, "DELETE");
  const deps = { connections: [{ id: "c1", appId: "gmail", authKey: "k" }] };
  const bad = setup(409, {
    error: { code: "credential_in_use", message: "in use", dependents: deps },
  });
  await assert.rejects(
    () => bad.api.deleteCredential?.("cred/x") as Promise<void>,
    (e: unknown) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.code, "credential_in_use");
      assert.deepEqual(
        (e.body as { error: { dependents: typeof deps } }).error.dependents.connections,
        deps.connections,
      );
      return true;
    },
  );
});
