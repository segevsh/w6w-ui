---
id: null
key: "components/data-stores"
title: "Data stores"
section: "reference-packages"
description: "Entry views for key-value, document and table data stores: a list, an editor and an editable grid, all props-only."
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

# Data stores

## `DataEntryList`

The entries of a key-value or document store: key, version, a preview of the value and a Delete
button per row, with a key-prefix search, a New entry button and Load more. Props-only; it needs no
provider and owns only the text in the search box. Delete fires at once, so confirm in the host.

| Prop | Type | What it does |
| --- | --- | --- |
| `rows` | `{ key: string; version: number; preview: string }[]` | Required. One row per entry. |
| `empty` | `ReactNode` | Shown when there are no rows. |
| `loading` | `boolean` | With no rows, shows "Loading…" instead of `empty`. |
| `searchValue` | `string` | Initial text of the key-prefix box. |
| `hasMore` | `boolean` | Shows Load more. |
| `onOpen` | `(key: string) => void` | Required. A row's key was clicked. |
| `onDelete` | `(key: string) => void` | Required. A row's Delete was clicked. |
| `onSearch` | `(text: string) => void` | Required. Fires when the search form is submitted, never per keystroke. |
| `onNew` | `() => void` | Required. New entry was clicked. |
| `onLoadMore` | `() => void` | Required. Load more was clicked. |

## `DataEntryEditor`

An editor card for one entry: a text input for a `kv` store, a `JsonEditor` for a `doc` store. A new
entry shows a key input. An existing entry shows its version and expiry. Drafts and the save call
are the host's.

| Prop | Type | What it does |
| --- | --- | --- |
| `kind` | `"kv" \| "doc"` | Required. |
| `isNew` | `boolean` | Required. Shows the key input instead of the version line. |
| `entryKey` | `string` | The heading for an existing entry. |
| `newKey` | `string` | The new entry's key. |
| `version` | `number \| null` | Existing entry's version. |
| `expiresAt` | `string \| null` | Shown as "Expires …" when set. |
| `text` | `string` | Required. The value text. |
| `error` | `string \| null` | Shown under the value. |
| `conflict` | `boolean` | Shows "Changed by someone else since you loaded it." with Reload, and disables Save. |
| `saving` | `boolean` | Disables Save. |
| `onTextChange` | `(text: string) => void` | Required. Fires per edit of the value. |
| `onKeyChange` | `(key: string) => void` | Required. Fires per edit of the new key. |
| `onSave` | `() => void` | Required. |
| `onCancel` | `() => void` | Required. |
| `onReload` | `() => void` | Required. The conflict prompt's Reload. |

## `DataTableGrid`

An editable grid for a table store. One input per cell, with the column type in the header. The key
column is read-only on an existing row and editable on the new row. A cell error shows under its own
cell. A row whose save lost a version race shows the conflict copy and Reload, and its Save is
disabled.

| Prop | Type | What it does |
| --- | --- | --- |
| `columns` | `TableColumn[]` | Required. |
| `keyColumn` | `string` | Required. The column that holds the row key. |
| `rows` | `DataTableGridRow[]` | Required. Each has `id`, `isNew`, `cells`, `version`, `dirty`, `conflict` and `cellErrors` (message by column). |
| `error` | `string \| null` | A grid-level error. Cell errors never appear here. |
| `loading` | `boolean` | With no rows, shows "Loading…". |
| `empty` | `ReactNode` | Shown when there are no rows. |
| `searchValue` | `string` | Initial text of the key-prefix box. |
| `hasMore` | `boolean` | Shows Load more. |
| `onCellChange` | `(rowId: string, column: string, text: string) => void` | Required. |
| `onSave` | `(rowId: string) => void` | Required. Disabled for a clean existing row, or on conflict. |
| `onDelete` | `(rowId: string) => void` | Required. Fires at once. |
| `onReload` | `(rowId: string) => void` | Required. |
| `onAddRow` | `() => void` | Required. |
| `onLoadMore` | `() => void` | Required. |
| `onSearch` | `(text: string) => void` | Required. Fires on submit only. |
