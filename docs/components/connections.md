---
id: null
key: "components/connections"
title: "Connections"
section: "reference-packages"
description: "List connections, show one's identity, and edit its name or credential, with built-in rows left alone."
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

# Connections

Three pieces for showing and editing the credentials an app uses. `ConnectionList` and
`ConnectionHeader` are props-only. `EditConnectionModal` reads the API client from
[`W6WUIProvider`](/reference-packages/components/providers/) and needs its optional
`updateConnection` method.

## `ConnectionList`

One row per connection: app icon, name, auth key, state, and an `invalid` tag when the last test
failed. It needs no provider.

| Prop | Type | What it does |
| --- | --- | --- |
| `connections` | `ConnectionSummary[]` | Required. |
| `appsById` | `ReadonlyMap<string, InlineAppMeta>` | App name and icon for rows the server did not send an inline `app` for. |
| `loading`, `error` | `boolean`, `string \| null` | Loading text and an error line. |
| `onOpen` | `(id, event) => void` | Row click. The event is passed through; you decide whether to `preventDefault`. |
| `getHref` | `(id) => string` | Makes each openable row a real `<a href>`. |
| `onEdit` | `(connection) => void` | Shows an Edit button per row. Pass it only when your API client has `updateConnection`. |
| `onDelete` | `(connection) => void` | Shows a Delete button per row. Confirming and deleting are yours. |
| `busy` | `boolean` | Disables the Delete buttons. |
| `slots` | `{ header?, actions?, empty? }` | A heading, trailing actions, and the empty state. |

Edit and Delete sit beside the row's link, never inside it. Their test ids are
`connection-edit-<id>` and `connection-delete-<id>`.

**Built-in rows.** A connection with `builtIn: true` is the server's "no credential needed" entry.
It has nothing stored, and the server answers get, test and delete on its id with 404, so the row
renders as plain text: no link, no `onOpen`, no Edit, no Delete. The check is the `builtIn` flag
only, never the id.

```tsx
import { ConnectionList } from "@w6w/ui";

<ConnectionList
  connections={connections}
  getHref={(id) => `/connections/${id}`}
  onOpen={(id, e) => { e.preventDefault(); router.push(`/connections/${id}`); }}
  onEdit={api.updateConnection ? setEditing : undefined}
  onDelete={setPendingDelete}
/>
```

## `ConnectionHeader`

An identity strip for one connection: icon, name (an `<h2>`), a copyable id, app id, auth key and
state. Children fill a right-aligned actions slot.

| Prop | Type | What it does |
| --- | --- | --- |
| `conn` | `ConnectionSummary` | Required. |
| `app` | `{ displayName?, iconSvg?, iconSvgDark?, brandColor? } \| undefined` | The connection's app meta. |
| `children` | `ReactNode` | Actions, such as a Test button. |

## `EditConnectionModal`

Rename a connection and/or replace some of its credential fields. The server never returns the
stored secret, so the fields start empty and **a blank field means unchanged**. Only a changed name
and the fields you filled are sent, and the server merges them over the stored credential. OAuth
connections can be renamed but not re-authorized here.

A connection that uses a stored credential (`connection.credentialId` is set) is edited
differently, provided your client has `rotateCredential` and the auth is not OAuth. The modal then
splits into two actions:

- **Save** renames the connection and changes its binding (for a service account, the
  "Impersonated user" and any other binding fields). It never sends a `credential`, because other
  connections may share that credential. Binding inputs start blank, and blank means unchanged.
- **Rotate credential** is a separate, explicit action. It reveals the auth's full credential
  fields (every required one must be filled) and replaces the stored secret through
  `rotateCredential`. When `getCredential` exists the modal says how many connections use the
  credential, because all of them switch to the new one.

With `testCredential` present, a **Test credential** button shows "Credential health" (ok, or the
failure code). It is a separate line from "App access", which reads the connection's own last test
(`lastTestOk`: passed, failed, or never tested). The two can disagree: a credential can mint a token
fine while the app still refuses the call.

| Prop | Type | What it does |
| --- | --- | --- |
| `connection` | `Pick<ConnectionSummary, "id" \| "appId" \| "authKey" \| "displayName" \| "builtIn" \| "credentialId" \| "lastTestOk">` | Required. |
| `onClose` | `() => void` | Required. |
| `onSaved` | `(updated: ConnectionSummary) => void` | Required. Typed credentials are cleared before it runs. |
| `theme` | `"light" \| "dark"` | Optional. |

If the API client has no `updateConnection`, or the connection is `builtIn`, the modal shows a
one-line notice with only a Cancel button and calls nothing.

Secret fields are plain text inputs masked with CSS, never `type="password"`, so browsers do not
offer to save them.

## `CredentialPicker`

The Use existing / Create new switch of a connection's Credential step, with the list of stored
credentials. It is presentational: it reads no API, so you pass everything in.

| Prop | Type | What it does |
| --- | --- | --- |
| `credentials` | `CredentialSummary[]` | Required. Rendered as given, so filter first. Each option shows the name and its non-secret `display` values. |
| `mode` | `"existing" \| "new"` | Required. |
| `onModeChange` | `(mode) => void` | Required. |
| `selectedId` | `string` | Required. The chosen credential id; used in `"existing"` mode. |
| `onSelect` | `(id) => void` | Required. |
| `canUseExisting` | `boolean` | Default `true`. `false` hides the Use existing choice. |
| `contract` | `string` | Shown as a hint next to the label. |

`AddConnectionModal` builds its Credential step from this plus `AuthFieldsForm`.

## Helpers

`resolveConnectionAppMeta(connection, byId)` picks the app meta a row renders with: the inline
`app` if present, nothing for `app: null`, else the by-id record. `connectionAppIdsToLookUp(connections)`
returns the unique app ids that still need a lookup.
