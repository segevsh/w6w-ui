// Run (from packages/ui): NODE_OPTIONS=--experimental-strip-types node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/EditConnectionModal.credential.test.ts
//
// T5.2 - EditConnectionModal split: rename/binding vs Rotate credential (cases E1-E4).
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
const { EditConnectionModal } = await import("../EditConnectionModal.tsx");

const CONTRACT = "google-service-account.v1";
const saAuth = {
  key: "service-account",
  type: "serviceAccount",
  fields: [
    {
      key: "serviceAccountKey",
      label: "Service account key",
      type: "json",
      secret: true,
      required: true,
    },
  ],
  serviceAccount: { accepts: [CONTRACT], scopes: [], impersonation: "optional" },
};
const CONN = {
  id: "conn_1",
  appId: "gmail",
  authKey: "service-account",
  displayName: "Ops mail",
  credentialId: "cred_1",
  lastTestOk: true,
};
const summary = () => ({
  id: "cred_1",
  name: "c",
  contract: CONTRACT,
  status: "active",
  revision: 2,
  display: {},
  private: false,
  connectionCount: 3,
  createdAt: "",
  updatedAt: "",
});

function makeApi(omit: string[] = []) {
  const rec = { update: [] as unknown[], rotate: [] as unknown[] };
  const api: Record<string, unknown> = {
    getAppAuth: async () => [saAuth],
    updateConnection: async (_id: string, body: unknown) => {
      rec.update.push(body);
      return { id: "conn_1", appId: "gmail", authKey: "service-account" };
    },
    rotateCredential: async (id: string, body: unknown) => {
      rec.rotate.push([id, body]);
      return summary();
    },
    getCredential: async () => summary(),
    testCredential: async () => ({ ok: false, code: "credential_invalid" }),
  };
  for (const k of omit) delete api[k];
  return { api: api as unknown as W6WApi, rec };
}

async function render(api: W6WApi, connection: Record<string, unknown> = CONN) {
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(
        W6WUIProvider,
        { api } as never,
        React.createElement(EditConnectionModal, {
          connection,
          onClose: () => {},
          onSaved: () => {},
        } as never),
      ),
    );
  });
  await flush();
  await flush();
  return container;
}

test("E1 split save sends rename and binding only, never a credential key", async () => {
  const { api, rec } = makeApi();
  const c = await render(api);
  type(field(c, "w6w-connection-label") as HTMLInputElement, "Renamed");
  await click(byText(c, "Save"));
  assert.deepEqual(rec.update, [{ displayName: "Renamed" }]);
  type(field(c, "w6w-cred-delegatedUser") as HTMLInputElement, "ops@example.com");
  await click(byText(c, "Save"));
  assert.deepEqual(rec.update[1], {
    displayName: "Renamed",
    binding: { delegatedUser: "ops@example.com" },
  });
  for (const b of rec.update) assert.ok(!("credential" in (b as object)));
});

test("E2 Rotate credential calls rotateCredential with the full source, never updateConnection, and shows impact", async () => {
  const { api, rec } = makeApi();
  const c = await render(api);
  assert.equal(field(c, "w6w-cred-serviceAccountKey"), null); // hidden until Rotate is chosen
  await click(byText(c, "Rotate credential"));
  assert.ok((c.textContent ?? "").includes("3 connections"));
  assert.equal(byText(c, "Rotate").disabled, true); // required field blank
  type(field(c, "w6w-cred-serviceAccountKey"), '{"private_key":"k2"}');
  await click(byText(c, "Rotate"));
  assert.deepEqual(rec.rotate, [
    ["cred_1", { source: { serviceAccountKey: { private_key: "k2" } } }],
  ]);
  assert.equal(rec.update.length, 0);
});

test("E3 credential health and app access render as distinct elements with different text", async () => {
  const { api } = makeApi();
  const c = await render(api);
  await click(byText(c, "Test credential"));
  const health = c.querySelector('[data-w6w="credential-health"]');
  const access = c.querySelector('[data-w6w="app-access"]');
  assert.ok(health && access && health !== access);
  assert.ok(health.textContent?.includes("credential_invalid"));
  assert.ok(access.textContent?.includes("passed"));
  assert.notEqual(health.textContent, access.textContent);
});

test("E4 no credentialId, or no rotateCredential: legacy modal, rotate never called", async () => {
  const { api, rec } = makeApi();
  const c = await render(api, { ...CONN, credentialId: null });
  assert.equal(byText(c, "Rotate credential"), undefined);
  assert.ok(field(c, "w6w-cred-serviceAccountKey"));
  assert.equal(rec.rotate.length, 0);
  const b = makeApi(["rotateCredential"]);
  const c2 = await render(b.api);
  assert.equal(byText(c2, "Rotate credential"), undefined);
  assert.ok(field(c2, "w6w-cred-serviceAccountKey"));
});
