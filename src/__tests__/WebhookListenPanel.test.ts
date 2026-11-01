// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/WebhookListenPanel.test.ts  (Node 24)
//
// "Listen for test event" on the webhook trigger's Test tab: listen → captured request shown
// (secret-looking headers masked) → "Use as test data" runs the trigger test with it and saves it
// as the step's test. Mounted under StrictMode, like Studio's main.tsx. JSDOM rig as
// ./WorkflowFlowEditor.webhook-url.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const g = globalThis as unknown as Record<string, unknown>;
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>");
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;
g.Window = dom.window.Window;
g.matchMedia = () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});
(dom.window as unknown as Record<string, unknown>).matchMedia = g.matchMedia;
g.MutationObserver = (dom.window as unknown as Record<string, unknown>).MutationObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;
const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
(dom.window as unknown as Record<string, unknown>).requestAnimationFrame = raf;
(dom.window as unknown as Record<string, unknown>).cancelAnimationFrame = g.cancelAnimationFrame;
// CodeMirror (the payload box and the result viewers) measures text ranges.
const rangeProto = dom.window.Range.prototype as unknown as Record<string, unknown>;
rangeProto.getClientRects = () => [];
rangeProto.getBoundingClientRect = () => ({
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
});

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { TriggerFillForm } = await import("../TriggerFillForm.tsx");
const { pickWebhookSubscription, displayHeaders } = await import("../WebhookListenPanel.tsx");
const { W6WUIProvider } = await import("../provider.tsx");
type W6WApi = Awaited<ReturnType<typeof import("../provider.tsx").useW6WApi>>;

const SUB = {
  id: "sub_1",
  appId: "@w6w/webhook",
  triggerKey: "webhook",
  workflowId: "wf_1",
  connectionId: null,
  nodeId: "webhook_1",
  webhookUrl: "https://api.example/triggers/webhooks/sub_1",
};
const REQUEST = {
  method: "POST",
  path: "/triggers/webhooks/sub_1",
  query: { source: "eventbrite" },
  headers: { "content-type": "application/json", "x-api-key": "k-123", "x-trace": "t1" },
  body: { order: { id: 42 } },
};

async function flush(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function click(container: HTMLElement, label: string) {
  const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === label);
  assert.ok(btn, `button "${label}" must render`);
  btn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
}

function mount(api: Record<string, unknown>) {
  const container = document.getElementById("root") as HTMLElement;
  container.innerHTML = "";
  const root = createRoot(container);
  const render = () =>
    act(async () => {
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(W6WUIProvider, {
            api: { listStepTests: async () => [], ...api } as unknown as W6WApi,
            children: React.createElement(TriggerFillForm, {
              app: "@w6w/webhook",
              action: "webhook",
              fields: undefined,
              persist: { workflowId: "wf_1", stepId: "webhook_1", input: {} },
              listen: { stepWith: {} },
            }),
          }),
        ),
      );
    });
  return { container, root, render };
}

test("pickWebhookSubscription prefers the node-bound webhook subscription", () => {
  const other = { ...SUB, id: "sub_0", nodeId: null };
  const app = { ...SUB, id: "sub_app", appId: "eventbrite", nodeId: "webhook_1" };
  assert.equal(pickWebhookSubscription([other, app, SUB], "webhook_1")?.id, "sub_1");
  assert.equal(pickWebhookSubscription([other, app], "webhook_1")?.id, "sub_0");
  assert.equal(pickWebhookSubscription([app], "webhook_1"), null);
});

test("displayHeaders masks secret-looking header values only", () => {
  const out = displayHeaders({
    authorization: "Bearer x",
    "x-api-key": "k",
    cookie: "c",
    "stripe-signature": "s",
    "content-type": "application/json",
  });
  assert.equal(out["content-type"], "application/json");
  for (const k of ["authorization", "x-api-key", "cookie", "stripe-signature"]) {
    assert.notEqual(out[k], { authorization: "Bearer x", "x-api-key": "k" }[k]);
    assert.ok(!["Bearer x", "k", "c", "s"].includes(out[k]), k);
  }
});

test("listen → captured request shown → Use as test data tests and saves it", async () => {
  const starts: string[] = [];
  const invokes: unknown[] = [];
  const saves: unknown[] = [];
  const runs: unknown[] = [];
  let polls = 0;
  const { container, root, render } = mount({
    listSubscriptionsForWorkflow: async () => [SUB],
    startWebhookListen: async (subId: string) => {
      starts.push(subId);
      return {
        session: {
          id: "wls_1",
          subscriptionId: subId,
          nodeId: "webhook_1",
          expiresAt: new Date(Date.now() + 120_000).toISOString(),
          status: "waiting",
        },
        webhookUrl: SUB.webhookUrl,
      };
    },
    pollWebhookListen: async () => {
      polls++;
      return polls === 1
        ? {
            id: "wls_1",
            subscriptionId: "sub_1",
            nodeId: "webhook_1",
            expiresAt: "",
            status: "waiting",
          }
        : {
            id: "wls_1",
            subscriptionId: "sub_1",
            nodeId: "webhook_1",
            expiresAt: "",
            status: "captured",
            request: REQUEST,
            receivedAt: new Date().toISOString(),
          };
    },
    stopWebhookListen: async () => {},
    invokeAction: async (_app: string, _action: string, params: { input: unknown }) => {
      invokes.push(params);
      return { value: params.input };
    },
    saveStepTest: async (_w: string, _s: string, body: unknown) => {
      saves.push(body);
      return { id: "st_1" };
    },
    recordStepTestRun: async (_w: string, _s: string, body: unknown) => {
      runs.push(body);
      return {};
    },
  });
  await render();
  await flush();

  const url = container.querySelector('input[aria-label="Webhook URL"]') as HTMLInputElement;
  assert.equal(url.value, SUB.webhookUrl);
  assert.ok(container.textContent?.includes("Or test with a sample payload"), "manual box kept");

  await act(async () => click(container, "Listen for test event"));
  await flush();
  await flush();
  assert.deepEqual(starts, ["sub_1"], "one session, even under StrictMode");
  const captured = container.querySelector('[data-testid="webhook-captured"]');
  assert.ok(captured, "the captured request renders");
  assert.ok(captured.textContent?.includes("POST"));
  assert.ok(captured.textContent?.includes("42"), "body shown");
  assert.ok(captured.textContent?.includes("eventbrite"), "query shown");
  assert.ok(!captured.textContent?.includes("k-123"), "x-api-key masked");
  assert.ok(captured.textContent?.includes("t1"), "ordinary header shown");

  await act(async () => click(container, "Use as test data"));
  await flush();
  await flush();
  assert.deepEqual(invokes, [{ input: REQUEST }], "the trigger test runs with the request");
  assert.deepEqual((saves[0] as { with: unknown }).with, REQUEST, "saved as the step's test");
  assert.equal((runs[0] as { status: string }).status, "succeeded");
  assert.ok(container.textContent?.includes("Output state"), "the output shows");

  await act(async () => root.unmount());
});

test("unmounting while waiting stops the session on the server", async () => {
  const stops: string[] = [];
  let release: (() => void) | null = null;
  const { root, render, container } = mount({
    listSubscriptionsForWorkflow: async () => [SUB],
    startWebhookListen: async () => ({
      session: {
        id: "wls_2",
        subscriptionId: "sub_1",
        nodeId: "webhook_1",
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        status: "waiting",
      },
      webhookUrl: SUB.webhookUrl,
    }),
    pollWebhookListen: (_s: string, _id: string, opts?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        release = () => reject(new Error("aborted"));
        opts?.signal?.addEventListener("abort", () => release?.());
      }),
    stopWebhookListen: async (_s: string, id: string) => {
      stops.push(id);
    },
  });
  await render();
  await flush();
  await act(async () => click(container, "Listen for test event"));
  await flush();
  assert.ok(container.textContent?.includes("Waiting for a request to"), "waiting state");
  await act(async () => root.unmount());
  assert.deepEqual(stops, ["wls_2"]);
});
