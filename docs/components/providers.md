---
id: null
key: "components/providers"
title: "Providers and the API client"
section: "reference-packages"
description: "Give @w6w/ui's connected components an API client, either the built-in createW6WApi or a bridge from @w6w/react, and supply expression scope."
format: "markdown"
shared: true
sourceRepo: null
sourcePath: null
sourceSha: null
sourceRefSha: null
sourceUrl: null
syncedAt: null
createdAt: null
updatedAt: null
---

# Providers and the API client

Five components call your W6W server themselves: `AppPicker`, `AddConnectionModal`,
`ActionTestForm`, `StepBuilderModal` and `WorkflowFlowEditor`. They get their client from
`W6WUIProvider`. This page covers that provider, the two ways to build the client it needs, and
`ExpressionOptionsProvider`, which feeds the variable and secret pickers.

## `W6WUIProvider`

Wrap your app (or the part that uses the components) once.

| Prop | Type | What it does |
| --- | --- | --- |
| `api` | `W6WApi` | Required. The client every connected component calls. |
| `theme` | `"light" \| "dark"` | Optional. Forces the components' mode. See [Theming](/reference-packages/theming/). |
| `children` | `ReactNode` | Required. |

```tsx
import { W6WUIProvider, createW6WApi } from "@w6w/ui";

const api = createW6WApi({ baseUrl: "https://<your-host>", token: getToken });
// getToken: your own function returning the signed-in user's bearer token

<W6WUIProvider api={api} theme="light">
  <App />
</W6WUIProvider>;
```

Inside it, `useW6WApi()` returns the same client, for your own calls. Outside it, `useW6WApi()`
throws `useW6WApi must be used inside <W6WUIProvider>`.

## Option A: `createW6WApi`

A complete `fetch`-based client with no other dependencies. Use it when you don't already run
`@w6w/react` or `@w6w/sdk` in the app.

```tsx
import { createW6WApi } from "@w6w/ui";

const api = createW6WApi({
  baseUrl: "https://<your-host>", // or a same-origin prefix such as "/api"
  token: async () => (await session.get()).accessToken,
});
```

| Option | Type | What it does |
| --- | --- | --- |
| `baseUrl` | `string` | Required. Absolute origin or path prefix. A trailing `/` is trimmed. |
| `token` | `string`, or a function returning `string \| null \| undefined` (sync or a `Promise`) | Optional. Sent as `Authorization: Bearer …`. A function is called fresh on every request, so a rotating session token just works. A nullish result sends no header. |
| `fetch` | `typeof fetch` | Optional. Replaces `globalThis.fetch`, for tests or a custom transport. |

Errors reject with `ApiError`, which carries:

| Field | What it holds |
| --- | --- |
| `status` | The HTTP status, or `0` when the server couldn't be reached. |
| `code` | The server's error code, `"network_error"` (unreachable) or `"bad_response"` (non-JSON error body). |
| `message` | The server's message, or a description naming the method and URL. |
| `body` | The parsed error body, when there was one. A failed action invoke carries its `logs` and `apiCalls` here. |

What it implements: every required `W6WApi` member (below), plus `listApps` and `listTestRuns`.
What it doesn't, and what that means:

- No `listAppsPage` or `listAppsByIds`, so `AppPicker` loads the whole catalog up front (it pages
  through `GET /apps` 200 at a time, up to 20 pages) and filters in the browser.
- No trigger members (`listTriggerApps`, `getAppTriggers`, `listSubscriptionsForWorkflow`,
  `createSubscription`), so the step builder doesn't show the app-triggers section.
- `invokeAction` doesn't forward `overrides` yet, so the **Overrides** fields in `ActionTestForm`
  have no effect through this client.

To add any of these, spread the client and add the member:

```tsx
import { createW6WApi, type W6WApi } from "@w6w/ui";

const base = createW6WApi({ baseUrl, token });
const api: W6WApi = {
  ...base,
  // Your own call to GET /apps?q=&category=&cursor=&limit=, returning { apps, nextCursor }
  listAppsPage: (opts) => fetchAppsPage(opts),
};
```

## Option B: bridge from `@w6w/react`

If your app already uses `@w6w/react`'s `W6WProvider`, reuse its client instead of building a
second one:

```tsx
import { createW6WUiAdapter, useW6WClient, W6WProvider } from "@w6w/react";
import { W6WUIProvider } from "@w6w/ui";
import { useMemo } from "react";

function UiBridge({ children }: { children: React.ReactNode }) {
  const client = useW6WClient();
  const api = useMemo(() => createW6WUiAdapter(client), [client]);
  return <W6WUIProvider api={api}>{children}</W6WUIProvider>;
}

<W6WProvider baseUrl="https://<your-host>" token={getToken}>
  <UiBridge>
    <App />
  </UiBridge>
</W6WProvider>;
```

> **Good to know:** the adapter in the published `@w6w/react@0.6.0` on npm is missing six required
> members: `listWorkflows`, `getWorkflow`, `runWorkflow`, `listFunctions`, `getFunction` and
> `invokeFunction`. Pickers, the connection modal and the action tester work, but the step builder's
> Functions and Workflows tabs fail with `api.listWorkflows is not a function`. The next
> `@w6w/react` release implements every member, including the paging and trigger ones. Until you're
> on it, use Option A when you need those tabs.

## What `W6WApi` must implement

If you write your own client, implement this interface. Members marked optional are
feature-detected: a component that finds one missing falls back or hides that feature.

| Member | Required | Used by |
| --- | --- | --- |
| `listApps()` | Optional | `AppPicker`, `AddConnectionModal`, `StepBuilderModal` when the paged members are missing |
| `listAppsPage(opts)` | Optional | `AppPicker` and the step builder's Apps/AI tabs: server-side search, category and cursor paging |
| `listAppsByIds(ids)` | Optional | `AddConnectionModal`'s `initialAppId`, the step builder's connected-apps tab |
| `getAppAuth(appId)` | Yes | `AddConnectionModal`, `StepBuilderModal` |
| `createConnection(appId, body)` | Yes | `AddConnectionModal` (API-key and similar auth) |
| `startAppOAuthFlow(appId, authKey, body)` | Yes | `AddConnectionModal` (OAuth) |
| `getAppActions(appId)` | Yes | `StepBuilderModal` |
| `listConnectionsForApp(appId)` | Yes | `StepBuilderModal`, `WorkflowFlowEditor` |
| `listConnections()` | Yes | The step builder's connected-apps tab |
| `invokeAction(appId, actionKey, params, opts)` | Yes | `ActionTestForm`, step tests in the builder and canvas |
| `listSavedTests`, `createSavedTest`, `updateSavedTest`, `deleteSavedTest`, `recordTestRun` | Yes | `ActionTestForm` |
| `listTestRuns(connectionId)` | Optional | `ActionTestForm`'s run history |
| `saveStepTest`, `recordStepTestRun`, `listStepTests` | Yes | Step tests in `StepBuilderModal` and `WorkflowFlowEditor` |
| `listFunctions`, `getFunction`, `invokeFunction` | Yes | The step builder's Functions tab |
| `listWorkflows`, `getWorkflow`, `runWorkflow` | Yes | The step builder's Workflows tab |
| `listTriggerApps`, `getAppTriggers`, `listSubscriptionsForWorkflow`, `createSubscription` | Optional | App triggers in the step builder and the canvas's webhook panel |

The parameter and return types are exported (`W6WApi`, `ListAppsPageOptions`, `AppsPageResult`,
`StepTest`, `TestRunSummary`), so TypeScript checks your implementation.

## `ExpressionOptionsProvider`

Fields that accept expressions (`ExpressionInput`, and every field `ParamsForm` renders) show a
picker of what the author can reference. Supply that scope with `ExpressionOptionsProvider`. Each
provider layers over the one above it, so an app shell can provide variables and secrets once and a
page can add its own inputs.

```tsx
import { ExpressionOptionsProvider } from "@w6w/ui";

<ExpressionOptionsProvider
  value={{
    vars: ["from_email", "region"],
    secrets: ["stripe_key"],
    sampleValues: { "vars.from_email": "team@example.com" },
  }}
>
  <StepEditor />
</ExpressionOptionsProvider>;
```

| `value` key | What it adds |
| --- | --- |
| `vars`, `secrets` | Names offered as `vars.<name>` and `secrets.<name>`. Names only: secret values never reach the browser. |
| `inputs` | `inputs.<name>`, for fields inside a Function or Endpoint. |
| `documents` | `documents.<key>` (and `.<field>` when you list `fields`). |
| `steps` | Upstream steps, offered as `steps.<id>.output` and `steps.<id>.output.<key>`. |
| `hasTrigger` | Offers `trigger.event`. |
| `sampleValues` | Values the preview substitutes for a ref, keyed by the full ref. |
| `sealSecret` | Encrypts a typed secret into a `SecretValue` on blur, via your server. Without it, the value is sent as plain text and encrypted by the server on receipt. |
| `createVar`, `createSecret` | Show a "+ Add" control in the picker that calls your function. |

Without a provider the fields still work: authors type references by hand. `useExpressionOptions()`
returns the merged scope at any point in the tree.

## Other helpers

- `startOAuthPopup(authorizationUrl)` opens the OAuth popup and resolves with `{ connectionId }`
  once the server's callback posts back. It rejects if the browser blocks the popup.
  `AddConnectionModal` uses it for you.
- `useEnterSubmit(onSubmit, { enabled })` returns an `onKeyDown` handler that submits on a bare
  Enter in a single-line text input (never in a textarea, with a modifier key, or mid-IME
  composition). Spread it onto your own inputs, or pass it to `AuthFieldsForm`.

## Where to next

- **[Forms](/reference-packages/components/forms/)**: `AppPicker`, `ActionTestForm` and the field components.
- **[Modals](/reference-packages/components/modals/)**: the connection modal and the step builder.
