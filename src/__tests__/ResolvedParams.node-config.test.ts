// Run (from packages/ui): node --import ./src/test-jsx-loader.mjs --test src/__tests__/ResolvedParams.node-config.test.ts
//
// The Test tab previews `nodes.<id>.meta.config.<key>` from the editor's node config (a webhook's
// `url` from its subscription) instead of a red "unresolved" — the run itself reads that config
// on every run — and a config key the client cannot know reads as a neutral "resolved at run".
import assert from "node:assert/strict";
import { test } from "node:test";

const React = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { ResolvedParams } = await import("../components/ResolvedParams.tsx");
const { ExpressionOptionsProvider } = await import("../components/ExpressionOptions.tsx");
const { buildResolveScope, resolveParamValue } = await import("../resolve-params.ts");
const { resolveParamJson } = await import("../resolved-json.ts");
type ActionParam = import("../types.ts").ActionParam;

const URL = "https://api-s2.w6w.dev/triggers/webhooks/sub_dyNm8HOZM3Alckvw";
const CONFIG = { webhook_1: { url: URL, auth: "none" } };
const scope = buildResolveScope(undefined, { steps: {} }, CONFIG);

test("meta.config.url (and the config alias, and the steps. spelling) previews as the URL", () => {
  for (const ref of [
    "nodes.webhook_1.meta.config.url",
    "nodes.webhook_1.config.url",
    "steps.webhook_1.meta.config.url",
  ]) {
    assert.deepStrictEqual(resolveParamValue(`{{ ${ref} }}`, scope), [
      { status: "resolved", ref, value: URL },
    ]);
  }
  assert.equal(resolveParamJson("{{ nodes.webhook_1.meta.config.url }}", scope), URL);
});

test("a config key the client cannot know is 'at-run', never 'unresolved'", () => {
  for (const ref of ["nodes.webhook_1.meta.config.nope", "nodes.other.meta.config.url"]) {
    assert.deepStrictEqual(resolveParamValue(`{{ ${ref} }}`, scope), [{ status: "at-run", ref }]);
  }
  // Without any config at all (a standalone field) too.
  assert.deepStrictEqual(
    resolveParamValue("{{ nodes.webhook_1.meta.config.url }}", buildResolveScope(undefined, {})),
    [{ status: "at-run", ref: "nodes.webhook_1.meta.config.url" }],
  );
  // A non-config ref keeps its honest "unresolved".
  assert.deepStrictEqual(resolveParamValue("{{ nodes.a.output.x }}", scope), [
    { status: "unresolved", ref: "nodes.a.output.x" },
  ]);
});

test("a node's run meta survives the config overlay", () => {
  const meta = { app: "@w6w/webhook", version: "1", action: "webhook", connectionId: null };
  const s = buildResolveScope(undefined, { steps: { webhook_1: { meta } } }, CONFIG);
  assert.deepStrictEqual(resolveParamValue("{{ nodes.webhook_1.meta.app }}", s), [
    { status: "resolved", ref: "nodes.webhook_1.meta.app", value: "@w6w/webhook" },
  ]);
});

const PARAMS: ActionParam[] = [{ key: "vars", label: "Variables", type: "vars" }];
const render = (ref: string, nodeConfig?: Record<string, Record<string, unknown>>) =>
  renderToStaticMarkup(
    React.createElement(ExpressionOptionsProvider, {
      value: { nodeConfig },
      children: React.createElement(ResolvedParams, {
        params: PARAMS,
        values: { vars: [{ key: "test", value: `{{ ${ref} }}` }] },
        testStartState: { steps: {} },
      }),
    }),
  );

test("the Variables row shows the webhook URL, not 'unresolved'", () => {
  const html = render("nodes.webhook_1.meta.config.url", CONFIG);
  assert.ok(html.includes(URL), html);
  assert.ok(!html.includes("w6w-param-unresolved"), html);
});

test("an unknown config key shows the neutral 'resolved at run' hint", () => {
  const html = render("nodes.webhook_1.meta.config.nope", CONFIG);
  assert.ok(html.includes("resolved at run"), html);
  assert.ok(html.includes("w6w-param-unevaluated"), "muted, not the danger class");
  assert.ok(!html.includes("w6w-param-unresolved"), html);
});

const META = {
  find_webhook: {
    app: "io.w6w.eventbrite",
    action: "list-webhooks",
    connectionId: "conn_T2N725mP2bxfyaoJ",
  },
  webhook_1: {
    app: "@w6w/webhook",
    action: "webhook",
    connectionId: null,
    subscriptionId: "sub_1",
    url: URL,
  },
};

test("static meta resolves without a run: connection id, a webhook's subscription; version is 'at-run'", () => {
  const s = buildResolveScope(undefined, { steps: {} }, CONFIG, META);
  const expect = (ref: string, value: unknown) =>
    assert.deepStrictEqual(resolveParamValue(`{{ ${ref} }}`, s), [
      { status: "resolved", ref, value },
    ]);
  expect("nodes.find_webhook.meta.connectionId", "conn_T2N725mP2bxfyaoJ");
  expect("steps.find_webhook.meta.app", "io.w6w.eventbrite");
  expect("nodes.webhook_1.meta.subscriptionId", "sub_1");
  expect("nodes.webhook_1.meta.url", URL);
  expect("nodes.webhook_1.meta.connectionId", null);
  // config still sits at meta.config beside the static meta
  expect("nodes.webhook_1.meta.config.url", URL);
  assert.deepStrictEqual(resolveParamValue("{{ nodes.find_webhook.meta.version }}", s), [
    { status: "at-run", ref: "nodes.find_webhook.meta.version" },
  ]);
  // A node with no static meta keeps its honest "unresolved".
  assert.deepStrictEqual(resolveParamValue("{{ nodes.other.meta.app }}", s), [
    { status: "unresolved", ref: "nodes.other.meta.app" },
  ]);
});

test("a node's run meta wins over its static meta", () => {
  const run = {
    app: "io.w6w.eventbrite",
    version: "0.4.3",
    action: "list-webhooks",
    connectionId: "conn_run",
  };
  const s = buildResolveScope(
    undefined,
    { steps: { find_webhook: { meta: run } } },
    undefined,
    META,
  );
  assert.equal(resolveParamJson("{{ nodes.find_webhook.meta.connectionId }}", s), "conn_run");
  assert.equal(resolveParamJson("{{ nodes.find_webhook.meta.version }}", s), "0.4.3");
});

test("the Test tab previews a static meta ref as its value", () => {
  const html = renderToStaticMarkup(
    React.createElement(ExpressionOptionsProvider, {
      value: { nodeMeta: META },
      children: React.createElement(ResolvedParams, {
        params: PARAMS,
        values: { vars: [{ key: "c", value: "{{ nodes.find_webhook.meta.connectionId }}" }] },
        testStartState: { steps: {} },
      }),
    }),
  );
  assert.ok(html.includes("conn_T2N725mP2bxfyaoJ"), html);
  assert.ok(!html.includes("w6w-param-unresolved"), html);
});
