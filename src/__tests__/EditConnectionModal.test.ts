// Run (from packages/ui): node --conditions=w6w-source --import ./src/test-jsx-loader.mjs --test src/__tests__/EditConnectionModal.test.ts
//
// EditConnectionModal on the adapter alone: exact PATCH body, nothing-changed => no call, no echo of
// typed credentials after save, absent `updateConnection` / builtIn => no Save and no call.
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
g.matchMedia =
  dom.window.matchMedia ??
  ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
(dom.window as unknown as Record<string, unknown>).matchMedia = g.matchMedia;

class FakeMutationObserver {
  observe() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
g.MutationObserver =
  (dom.window as unknown as Record<string, unknown>).MutationObserver ?? FakeMutationObserver;
(dom.window as unknown as Record<string, unknown>).MutationObserver = g.MutationObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom implements <dialog> as an element but not its imperative API — `Modal`
// (`AddConnectionModal`'s wrapper) calls `showModal()` in a mount effect.
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
const { EditConnectionModal } = await import("../EditConnectionModal.tsx");
const { W6WUIProvider } = await import("../provider.tsx");

type Api = Record<string, unknown>;

const AUTHS = [
  {
    key: "apiKey",
    type: "apiKey",
    fields: [
      { key: "apiKey", label: "API key", type: "secret", default: "DEFAULT-KEY" },
      { key: "domain", label: "Domain", type: "string" },
      { key: "port", label: "Port", type: "number" },
    ],
  },
  { key: "oauth", type: "oauth2", fields: [{ key: "ignored", label: "Ignored", type: "string" }] },
];

const CONN = { id: "zerocred:slack/x", appId: "slack", authKey: "apiKey", displayName: "Prod" };

interface Calls {
  auth: string[];
  update: { id: string; body: unknown }[];
  saved: unknown[];
}

function makeApi(calls: Calls, extra: Api = {}, withUpdate = true): Api {
  return {
    getAppAuth: async (id: string) => {
      calls.auth.push(id);
      return AUTHS;
    },
    ...(withUpdate
      ? {
          updateConnection: async (id: string, body: unknown) => {
            calls.update.push({ id, body });
            return { id, appId: "slack", authKey: "apiKey", displayName: "Prod" };
          },
        }
      : {}),
    ...extra,
  };
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function render(api: Api, connection: Record<string, unknown> = CONN, calls?: Calls) {
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
          onSaved: (u: unknown) => calls?.saved.push(u),
        } as never),
      ),
    );
  });
  await flush();
  return container;
}

const newCalls = (): Calls => ({ auth: [], update: [], saved: [] });
const input = (c: Element, name: string) =>
  c.querySelector(`input[name="${name}"]`) as HTMLInputElement;
const buttons = (c: Element) => [...c.querySelectorAll("button")].map((b) => b.textContent);
const save = (c: Element) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent === "Save") as HTMLButtonElement;

function type(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
  assert.ok(set);
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function clickSave(c: Element) {
  await act(async () => {
    save(c).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

test("title and buttons: Edit connection / Cancel / Save", async () => {
  const c = await render(makeApi(newCalls()));
  assert.ok((c.textContent ?? "").includes("Edit connection"));
  assert.deepEqual(
    buttons(c).filter((t) => t === "Cancel" || t === "Save"),
    ["Cancel", "Save"],
  );
});

test("nothing changed => no update call and an inline error", async () => {
  const calls = newCalls();
  const c = await render(makeApi(calls), CONN, calls);
  await clickSave(c);
  assert.equal(calls.update.length, 0);
  assert.ok((c.textContent ?? "").includes("Nothing to update"));
});

test("exact credential key set: only non-blank fields, never a default; name only if changed", async () => {
  const calls = newCalls();
  const c = await render(makeApi(calls), CONN, calls);
  // default is not seeded
  assert.equal(input(c, "w6w-cred-apiKey").value, "");
  type(input(c, "w6w-cred-domain"), "acme.example");
  type(input(c, "w6w-cred-port"), "0");
  type(input(c, "w6w-cred-apiKey"), "");
  await clickSave(c);
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].id, "zerocred:slack/x");
  const body = calls.update[0].body as {
    displayName?: string;
    credential?: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(body), ["credential"], "unchanged name is not sent");
  assert.deepEqual(Object.keys(body.credential ?? {}).sort(), ["domain", "port"]);
  assert.deepEqual(body.credential, { domain: "acme.example", port: 0 });
});

test("a renamed connection sends only displayName", async () => {
  const calls = newCalls();
  const c = await render(makeApi(calls), CONN, calls);
  type(input(c, "w6w-connection-label"), "Renamed");
  await clickSave(c);
  assert.deepEqual(calls.update[0].body, { displayName: "Renamed" });
});

test("oauth2 auth method => rename only, no credential fields", async () => {
  const calls = newCalls();
  const c = await render(makeApi(calls), { ...CONN, authKey: "oauth" }, calls);
  assert.equal(input(c, "w6w-cred-ignored"), null);
  type(input(c, "w6w-connection-label"), "Renamed");
  await clickSave(c);
  assert.deepEqual(calls.update[0].body, { displayName: "Renamed" });
});

test("no echo: after a successful save no input holds the typed value and the DOM has none", async () => {
  const calls = newCalls();
  const SECRET = "typed-secret-value-123";
  const c = await render(makeApi(calls), CONN, calls);
  type(input(c, "w6w-cred-apiKey"), SECRET);
  type(input(c, "w6w-cred-domain"), SECRET);
  await clickSave(c);
  assert.equal(calls.update.length, 1);
  assert.equal(calls.saved.length, 1);
  for (const i of c.querySelectorAll("input")) {
    assert.ok(!i.value.includes(SECRET), `input ${i.name} still holds the typed value`);
  }
  assert.ok(!c.innerHTML.includes(SECRET), "typed value present in DOM text/attributes");
  const secretInput = input(c, "w6w-cred-apiKey");
  assert.equal(secretInput.getAttribute("type"), "text");
  assert.ok(secretInput.classList.contains("w6w-secret-input"));
});

test("a rejection shows its message, never the typed values", async () => {
  const calls = newCalls();
  const SECRET = "typed-secret-value-456";
  const api = makeApi(calls, {
    updateConnection: async () => {
      throw new Error("Server said no");
    },
  });
  const c = await render(api, CONN, calls);
  type(input(c, "w6w-cred-apiKey"), SECRET);
  await clickSave(c);
  assert.ok((c.textContent ?? "").includes("Server said no"));
  assert.ok(!(c.textContent ?? "").includes(SECRET));
  assert.equal(calls.saved.length, 0);
});

test("absent updateConnection: no Save, a notice, no update and no throw", async () => {
  const calls = newCalls();
  const c = await render(makeApi(calls, {}, false), CONN, calls);
  assert.ok(!buttons(c).includes("Save"));
  assert.ok(buttons(c).includes("Cancel"));
  assert.ok((c.textContent ?? "").includes("not available"));
  assert.equal(calls.update.length, 0);
});

test("builtIn connection: no form, no Save, no adapter call at all", async () => {
  const calls = newCalls();
  const c = await render(makeApi(calls), { ...CONN, builtIn: true }, calls);
  assert.ok(!buttons(c).includes("Save"));
  assert.equal(c.querySelectorAll("input").length, 0);
  assert.equal(calls.auth.length, 0);
  assert.equal(calls.update.length, 0);
});
