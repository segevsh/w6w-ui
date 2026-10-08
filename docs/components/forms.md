---
id: null
key: "components/forms"
title: "Forms"
section: "reference-packages"
description: "Pick apps, collect action parameters and credentials, bind expressions, and set retry and error handling with @w6w/ui's form components."
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

# Forms

The pieces you use to collect input for an app, an action or a step. `AppPicker` and
`ActionTestForm` call your server through [`W6WUIProvider`](/reference-packages/components/providers/); the rest
are props-only and controlled: you hold the value, they call `onChange` with the next one.

## `AppPicker` (provider)

A searchable grid of app cards. The same picker the connection modal and the step builder use.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `onSelectApp` | `(app: AppSummary) => void` | Required | Fired when the user picks a card. |
| `apps` | `AppSummary[] \| null` | None | Supply the catalog yourself. `null` shows the loading state. When set, the picker doesn't fetch. |
| `filter` | `(app) => boolean` | None | Narrows what's shown, in the browser. Never widens a fetch. |
| `search` | `boolean` | `true` | Show the search box. |
| `searchPlaceholder` | `string` | `"Search apps…"` | |
| `emptyMessage`, `emptyAction` | `string`, `ReactNode` | None | Empty-state text, and a control under it (such as a "Browse all apps" button). |
| `categoryFilter` | `boolean` | `false` | Show a row of category chips built from the visible apps. |
| `category` | `string` | None | Server-side category for the paged fetch, such as `"ai"`. |
| `pageLimit` | `number` | `60` | Page size for the paged fetch. |
| `theme` | `"light" \| "dark"` | Inherited | |

Without `apps`, the picker loads the catalog itself:

- If your client implements `listAppsPage`, it pages from the server, one page per search, with a
  **Load more** button.
- Otherwise it calls `listApps()` once and searches in the browser.

It reads the provider even when you pass `apps`, so mount it inside `W6WUIProvider` either way.

```tsx
import { AppPicker } from "@w6w/ui";

<AppPicker
  onSelectApp={(app) => navigate(`/apps/${app.id}`)}
  filter={(app) => !app.zeroCredential}
  emptyMessage="No apps match."
/>
```

## `ActionTestForm` (provider)

Run one action of an app against a connection, see the response and the vendor calls it made, and
save the inputs as a named test. It calls `invokeAction` and the saved-test members of your client.

| Prop | Type | What it does |
| --- | --- | --- |
| `appId` | `string` | Required. The app the action belongs to. |
| `actions` | `ActionDef[]` | Required. The app's actions, for example from `api.getAppActions(appId)`. |
| `connectionId` | `string` | The connection to run against. The server resolves its credential. |
| `action` | `ActionDef \| null` | Pre-select an action. Hides the built-in action dropdown. |
| `seedValues` | `Record<string, unknown> \| null` | Pre-fill the inputs. Re-seeds when the object's identity changes. |
| `seedTestId` | `string \| null` | Open an existing saved test, so **Save** updates it and **Delete** shows. |
| `embedded` | `boolean` | Fill your own container instead of rendering its own modal and pop-out toggle. |
| `onDirtyChange` | `(dirty: boolean) => void` | Fired when the inputs diverge from, or return to, the seeded values. |
| `onTestSaved`, `onDeleted`, `onSavedTestsChanged` | callbacks | After a save, a delete, or either. |
| `theme` | `"light" \| "dark"` | |

The form also has an **Overrides** region for vendor fields the action doesn't declare. Through
`createW6WApi` those overrides aren't sent yet; see
[Providers](/reference-packages/components/providers/#option-a-createw6wapi).

```tsx
import { ActionTestForm } from "@w6w/ui";

<ActionTestForm appId="sendgrid" actions={actions} connectionId={connectionId} />
```

## `ParamsForm`

Renders an action's declared parameters as a form. Required parameters show up front; optional ones
fold under **Additional parameters**. The widget follows each parameter's `type`: `string`, `text`,
`number`, `boolean`, `select`, `multiselect`, `array`, `json`, `group`, `secret`, `code`, `vars`
and `section`. It also honours `showIf`, `row`, `repeat` and `options` on the parameter.

| Prop | Type | What it does |
| --- | --- | --- |
| `params` | `ActionParam[]` | Required. The parameters to render, usually `action.params`. |
| `values` | `Record<string, unknown>` | Required. Current values, keyed by parameter `key`. This becomes a step's `with`. |
| `onChange` | `(values) => void` | Required. Fired with the whole next object. |
| `readOnly` | `boolean` | Shows the values without editing. |

```tsx
import { ParamsForm } from "@w6w/ui";

const [values, setValues] = useState<Record<string, unknown>>({});

<ParamsForm params={action.params ?? []} values={values} onChange={setValues} />
```

Text fields accept expressions (`vars.region`, `steps.fetch.output.id` and so on), with a picker fed
by [`ExpressionOptionsProvider`](/reference-packages/components/providers/#expressionoptionsprovider).

## `PropertyEntryForm`

`ParamsForm` with a **Code** view beside it, so an author can switch between fields and raw JSON.
With no `params`, it's raw JSON only.

| Prop | Type | What it does |
| --- | --- | --- |
| `params`, `values`, `onChange`, `readOnly` | | As on `ParamsForm`. `onChange` fires only with valid values. |
| `onValidityChange` | `(valid: boolean) => void` | Whether the JSON draft is currently a values object. Gate your **Run** or **Save** button on it: an invalid draft never reaches `onChange`, so without this you'd act on the previous values. |
| `initialView` | `"props" \| "code"` | Which view opens first. Defaults to `"props"`. |

```tsx
import { PropertyEntryForm } from "@w6w/ui";

<PropertyEntryForm
  params={action.params ?? []}
  values={input}
  onChange={setInput}
  onValidityChange={setInputValid}
/>
<button className="w6w-btn" disabled={!inputValid} onClick={run}>Run</button>
```

## `AuthFieldsForm`

Renders the credential fields an app's auth method declares (its `fields`), so you can build your
own connect flow. `AddConnectionModal` uses it inside.

| Prop | Type | What it does |
| --- | --- | --- |
| `fields` | `AuthField[]` | Required. From the auth method returned by `getAppAuth(appId)`. |
| `values` | `Record<string, unknown>` | Required. |
| `onChange` | `(values) => void` | Required. |
| `enterSubmitProps` | `{ onKeyDown }` | The result of `useEnterSubmit(submit)`, so Enter in a field submits. |

```tsx
import { AuthFieldsForm, useEnterSubmit } from "@w6w/ui";

const enter = useEnterSubmit(connect, { enabled: !saving });

<AuthFieldsForm fields={method.fields} values={creds} onChange={setCreds} enterSubmitProps={enter} />
```

`secret` fields are masked with dots but aren't password inputs, so browsers and password managers
don't offer to save the credential. A method with no fields shows a short note instead.

## `ExpressionInput`

One field that mixes literal text with references such as `vars.region` or
`steps.fetch.output.id`. References show as chips, and the picker offers what's in scope.

| Prop | Type | What it does |
| --- | --- | --- |
| `value` | `ExprValue \| string \| SecretValue \| undefined` | Current value. |
| `onChange` | `(next) => void` | Required. Emits a plain string when there are no references, otherwise an `ExprValue`. |
| `masked` | `boolean` | For secrets: hides the text, and seals it into a `SecretValue` on blur when the provider supplies `sealSecret`. |
| `multiline` | `boolean` | A textarea-style field. |
| `options` | `{ vars?, secrets? }` | Names to offer, on top of `ExpressionOptionsProvider`. |
| `placeholder`, `readOnly`, `aria-label` | | |

```tsx
import { ExpressionInput } from "@w6w/ui";

<ExpressionInput
  aria-label="Subject"
  value={subject}
  onChange={setSubject}
  options={{ vars: ["company_name"] }}
/>
```

Use `isExprValue(v)` and `isSecretValue(v)` to tell the shapes apart when you read the value back.

## `NodeConfigForm`

The settings every step shares, independent of its action: retry, what to do on error, and notes.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `config` | `NodeConfig` | Required | `{ retry?, onError?, notes? }`. |
| `onChange` | `(next: NodeConfig) => void` | Required | |
| `readOnly` | `boolean` | `false` | |
| `hasGraph` | `boolean` | `true` | `false` for a Function or Endpoint, which has no canvas: hides the error-edge hint and the `continue-record` choice. |
| `failureHandling` | `boolean` | `true` | `false` hides retry and on-error, such as for a trigger. Notes stay. |
| `retryControls` | `boolean` | `true` | `false` hides only the retry block. |
| `reroute` | `{ value, onChange, picker }` | None | Adds a **Reroute on failure** field. You supply the picker control; `value` is `{ kind: "function", function }` or `{ kind: "workflow", workflow }`. |

`onError` is one of `"fail"` (stop the run, the default), `"continue"` or `"continue-record"` (keep
going, and record the error in the run's result).

```tsx
import { NodeConfigForm, type NodeConfig } from "@w6w/ui";

const [config, setConfig] = useState<NodeConfig>({ onError: "fail" });

<NodeConfigForm config={config} onChange={setConfig} />
```

## `RetryPolicyFields`

Just the retry block from `NodeConfigForm`, for a Function, an Endpoint or a whole workflow.

| Prop | Type | What it does |
| --- | --- | --- |
| `value` | `{ maxAttempts, backoff?, delayMs? } \| undefined` | `undefined` means no retry. |
| `onChange` | `(next \| undefined) => void` | Required. |
| `target` | `"step" \| "function" \| "endpoint" \| "workflow"` | Adjusts the wording. Defaults to `"step"`. |
| `readOnly` | `boolean` | |

Turning retry on starts at 3 attempts, 1000 ms apart, with `fixed` backoff. `backoff` can also be
`"exponential"`.

```tsx
import { RetryPolicyFields } from "@w6w/ui";

<RetryPolicyFields target="function" value={retry} onChange={setRetry} />
```

## Where to next

- **[Modals](/reference-packages/components/modals/)**: `StepBuilderModal`, which composes most of this page.
- **[Editors](/reference-packages/components/editors/)**: JSON, YAML and code fields.
