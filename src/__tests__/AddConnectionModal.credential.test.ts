// Run (from packages/ui): NODE_OPTIONS=--experimental-strip-types node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/AddConnectionModal.credential.test.ts
//
// T5.2 — the Credential step of AddConnectionModal (cases A1-A6; fakes only, no server).
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;
g.matchMedia = (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});
(dom.window as unknown as Record<string, unknown>).matchMedia = g.matchMedia;
class FakeMutationObserver {
  observe() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
g.MutationObserver = FakeMutationObserver;
(dom.window as unknown as Record<string, unknown>).MutationObserver = g.MutationObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;
const dialogProto = dom.window.HTMLDialogElement?.prototype as unknown as Record<string, unknown>;
if (dialogProto && typeof dialogProto.showModal !== "function") {
  dialogProto.showModal = function showModal(this: HTMLElement) {
    this.setAttribute("open", "");
  };
  dialogProto.close = function close(this: HTMLElement) {
    this.removeAttribute("open");
  };
}

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { W6WUIProvider } = await import("../provider.tsx");
type W6WApi = import("../provider.tsx").W6WApi;

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el.tagName === "TEXTAREA"
      ? dom.window.HTMLTextAreaElement.prototype
      : dom.window.HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  assert.ok(set);
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
}
const byText = (c: Element, text: string) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement;
const field = (c: Element, name: string) =>
  c.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement;
const { AddConnectionModal } = await import("../AddConnectionModal.tsx");

const CONTRACT = "google-service-account.v1";
const KEY_FIELD = {
  key: "serviceAccountKey",
  label: "Service account key",
  type: "json",
  secret: true,
  required: true,
};
const saAuth = (
  impersonation: "none" | "optional" | "required",
  bindingFields: unknown[] = [],
) => ({
  key: "service-account",
  type: "serviceAccount",
  displayName: "Service account",
  fields: [KEY_FIELD],
  serviceAccount: {
    accepts: [CONTRACT],
    scopes: ["https://scope/a"],
    impersonation,
    bindingFields,
  },
});
const cred = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Cred ${id}`,
  contract: CONTRACT,
  status: "active",
  revision: 1,
  display: { email: `${id}@sa.iam` },
  private: false,
  connectionCount: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

interface Rec {
  list: unknown[];
  created: unknown[];
  conns: unknown[];
  order: string[];
}
function makeApi(
  auths: unknown[],
  opts: { creds?: unknown[]; failFirstConn?: boolean; omit?: string[] } = {},
) {
  const rec: Rec = { list: [], created: [], conns: [], order: [] };
  let connCalls = 0;
  const api: Record<string, unknown> = {
    getAppAuth: async () => auths,
    createConnection: async (_a: string, body: unknown) => {
      rec.conns.push(body);
      rec.order.push("conn");
      if (opts.failFirstConn && connCalls++ === 0) throw new Error("boom");
      return { id: "conn_1", appId: "gmail", authKey: "x" };
    },
    listCredentials: async (f: unknown) => {
      rec.list.push(f);
      return opts.creds ?? [];
    },
    createCredential: async (b: unknown) => {
      rec.created.push(b);
      rec.order.push("cred");
      return cred("cred_new");
    },
    startAppOAuthFlow: async () => ({ authorizationUrl: "" }),
    getAppActions: async () => [],
    listConnectionsForApp: async () => [],
    listConnections: async () => [],
  };
  for (const k of opts.omit ?? []) delete api[k];
  return { api: api as unknown as W6WApi, rec };
}

async function open(api: W6WApi) {
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api } as never,
        React.createElement(AddConnectionModal, {
          onClose: () => {},
          onCreated: () => {},
          initialAppId: "gmail",
        } as never),
      ),
    );
  });
  await flush();
  await flush();
  return container;
}
const withApp = (o: Record<string, unknown>) => ({
  listAppsByIds: async () => [{ id: "gmail", displayName: "Gmail" }],
  ...o,
});
const mk = (auths: unknown[], opts: Parameters<typeof makeApi>[1] = {}) => {
  const r = makeApi(auths, opts);
  return { api: { ...withApp({}), ...(r.api as object) } as unknown as W6WApi, rec: r.rec };
};
const save = (c: Element) => byText(c, "Save connection");

test("A1 use existing + delegatedUser: credentialId body, list called once with {contract}, no createCredential", async () => {
  const { api, rec } = mk([saAuth("optional")], {
    creds: [
      cred("cred_1"),
      cred("cred_off", { status: "disabled" }),
      cred("cred_other", { contract: "other.v1" }),
    ],
  });
  const c = await open(api);
  assert.deepEqual(rec.list, [{ contract: CONTRACT }]);
  // C1: only the active, matching-contract credential is offered, by name plus display value.
  const opts = [...c.querySelectorAll("select[name='w6w-credential-id'] option")];
  assert.equal(opts.length, 1);
  assert.ok(opts[0].textContent?.includes("Cred cred_1"));
  assert.ok(opts[0].textContent?.includes("cred_1@sa.iam"));
  type(field(c, "w6w-connection-label") as HTMLInputElement, "Ops mail");
  type(field(c, "w6w-cred-delegatedUser") as HTMLInputElement, "ops@example.com");
  await click(save(c));
  assert.equal(rec.created.length, 0);
  assert.deepEqual(rec.conns, [
    {
      authKey: "service-account",
      credentialId: "cred_1",
      binding: { delegatedUser: "ops@example.com" },
      displayName: "Ops mail",
    },
  ]);
});

test("A2 create new: createCredential {name, contract, source parsed} then createConnection with created id", async () => {
  const { api, rec } = mk([saAuth("none")]);
  const c = await open(api);
  type(field(c, "w6w-credential-name") as HTMLInputElement, "Prod SA");
  type(field(c, "w6w-cred-serviceAccountKey"), '{"client_email":"a@b","private_key":"k"}');
  await click(save(c));
  assert.deepEqual(rec.created, [
    {
      name: "Prod SA",
      contract: CONTRACT,
      source: { serviceAccountKey: { client_email: "a@b", private_key: "k" } },
    },
  ]);
  assert.deepEqual(rec.order, ["cred", "conn"]);
  assert.deepEqual(rec.conns, [{ authKey: "service-account", credentialId: "cred_new" }]);
});

test("A3 a failed connection call keeps the created credential: retry does not create again", async () => {
  const { api, rec } = mk([saAuth("none")], { failFirstConn: true });
  const c = await open(api);
  type(field(c, "w6w-credential-name") as HTMLInputElement, "Prod SA");
  type(field(c, "w6w-cred-serviceAccountKey"), '{"a":1}');
  await click(save(c));
  assert.ok((c.textContent ?? "").includes("boom"));
  await click(save(c));
  assert.equal(rec.created.length, 1);
  assert.equal(rec.conns.length, 2);
  assert.equal((rec.conns[1] as { credentialId: string }).credentialId, "cred_new");
});

test("A4 required impersonation blocks Save; none hides the input; binding field lands in settings", async () => {
  {
    const { api } = mk([saAuth("required")], { creds: [cred("cred_1")] });
    const c = await open(api);
    assert.equal(save(c).disabled, true);
    type(field(c, "w6w-cred-delegatedUser") as HTMLInputElement, "x@y.z");
    assert.equal(save(c).disabled, false);
    const label = [...c.querySelectorAll("label span")].map((s) => s.textContent);
    assert.ok(label.some((t) => t?.startsWith("Impersonated user")));
    assert.ok(!/owner|subject/i.test(label.join("|")));
  }
  {
    const { api, rec } = mk(
      [saAuth("none", [{ key: "delegatedUser", label: "x", type: "string" }])],
      { creds: [cred("cred_1")] },
    );
    const c = await open(api);
    assert.equal(field(c, "w6w-cred-delegatedUser"), null);
    await click(save(c));
    assert.deepEqual(rec.conns, [{ authKey: "service-account", credentialId: "cred_1" }]);
  }
  {
    const { api, rec } = mk(
      [saAuth("optional", [{ key: "projectId", label: "Project", type: "string" }])],
      { creds: [cred("cred_1")] },
    );
    const c = await open(api);
    type(field(c, "w6w-cred-projectId") as HTMLInputElement, "proj-9");
    await click(save(c));
    assert.deepEqual((rec.conns[0] as { binding: unknown }).binding, {
      settings: { projectId: "proj-9" },
    });
  }
});

test("A5 one credential method missing, or a non-SA auth: legacy form and body", async () => {
  for (const omit of [["listCredentials"], ["createCredential"]]) {
    const { api, rec } = mk([saAuth("none")], { omit });
    const c = await open(api);
    assert.equal(field(c, "w6w-credential-name"), null);
    type(field(c, "w6w-cred-serviceAccountKey"), '{"a":1}');
    await click(save(c));
    assert.deepEqual(rec.conns, [
      {
        authKey: "service-account",
        credential: { serviceAccountKey: { a: 1 } },
        displayName: undefined,
      },
    ]);
  }
  const { api, rec } = mk(
    [
      {
        key: "k",
        type: "apiKey",
        fields: [{ key: "apiKey", label: "Key", type: "secret", required: true }],
      },
    ],
    { creds: [cred("cred_1")] },
  );
  const c = await open(api);
  type(field(c, "w6w-cred-apiKey"), "sk");
  await click(save(c));
  assert.equal(rec.list.length, 0);
  assert.deepEqual(rec.conns, [
    { authKey: "k", credential: { apiKey: "sk" }, displayName: undefined },
  ]);
});

test("A6 invalid JSON shows an error that never echoes the input, and creates nothing", async () => {
  const { api, rec } = mk([saAuth("none")]);
  const c = await open(api);
  type(field(c, "w6w-credential-name") as HTMLInputElement, "Prod SA");
  type(field(c, "w6w-cred-serviceAccountKey"), '{"private_key": SENTINEL-PK-5f2');
  await click(save(c));
  assert.equal(rec.created.length, 0);
  assert.equal(rec.conns.length, 0);
  assert.ok(c.querySelector(".w6w-error"));
  const clone = c.cloneNode(true) as HTMLElement;
  for (const el of clone.querySelectorAll("textarea,input")) el.remove();
  assert.ok(!(clone.textContent ?? "").includes("SENTINEL-PK-5f2"));
});
