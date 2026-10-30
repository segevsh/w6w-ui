---
id: null
key: "components/data-stores"
title: "Data stores"
section: "reference-packages"
description: "List data stores, edit a table's columns with typed defaults, and import or export CSV, with the pure helpers behind them."
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

Three props-only pieces for working with W6W data stores (key-value, document and table), plus the
pure helpers they are built on. None of them calls an API or needs
[`W6WUIProvider`](/reference-packages/components/providers/): you pass data in and handle the
callbacks.

## `DataStoreList`

One row per store: name, kind (`Key-value`, `Document` or `Table`), entry count, size and last
update.

| Prop | Type | What it does |
| --- | --- | --- |
| `stores` | `DataStore[]` | Required. |
| `loading`, `error` | `boolean`, `string \| null` | Loading text and an error line. |
| `onOpen` | `(id, event) => void` | Row click. The event is passed through; you decide whether to `preventDefault`. |
| `getHref` | `(id) => string` | Makes each row a real `<a href>`. |
| `onEdit` | `(store) => void` | Shows an Edit button per row. |
| `onArchive` | `(store) => void` | Shows an Archive button per row. Confirming and archiving are yours. |
| `busy` | `boolean` | Disables the Archive buttons. |
| `formatSize` | `(bytes) => string` | Size text. Defaults to the package's byte formatter (`2.0 KiB`). |
| `slots` | `{ header?, actions?, empty? }` | A heading, trailing actions, and the empty state. |

The actions column appears only when `onEdit` or `onArchive` is set. Its buttons sit beside the
row's link, never inside it. Their test ids are `data-store-edit-<id>` and `data-store-archive-<id>`.

```tsx
import { DataStoreList } from "@w6w/ui";

<DataStoreList
  stores={stores}
  getHref={(id) => `/data/${id}`}
  onOpen={(id, e) => { e.preventDefault(); router.push(`/data/${id}`); }}
  onArchive={setPendingArchive}
/>
```

## `ColumnsEditor`

The column list of a `table` store. It is controlled: it shows `columns` and calls `onChange` with
the next list.

| Prop | Type | What it does |
| --- | --- | --- |
| `columns` | `TableColumn[]` | Required. |
| `onChange` | `(next: TableColumn[]) => void` | Required. |
| `keyColumn` | `string` | Required. The key column's name, or `""` for generated keys. |
| `onKeyColumnChange` | `(name: string) => void` | Required. |
| `columnErrors` | `Record<string, string>` | Required. One message per column name, shown under that row. |

Only a required column typed `string` or `integer` can be the key. If the chosen column stops
qualifying (renamed, retyped or made optional), the editor calls `onKeyColumnChange("")`.

Each row has a **Column default** box. The text is parsed with the column's type, so the stored
default is the typed value (`7`, `true`), not the text. Empty text, or text that does not parse,
leaves the column with no `default` key at all; an unparseable one also shows the reason under that
row. Changing the type re-parses the text already in the box.

## `CsvPanel`

A file input and an Export button, with one result line.

| Prop | Type | What it does |
| --- | --- | --- |
| `result` | `{ ok: boolean; message: string } \| null` | Required. The line shown after an import or export; a failed one is styled as an error. |
| `busy` | `boolean` | Disables Export. |
| `onImport` | `(file: File) => void` | Required. Called with a file within the size limit. Reading and uploading it are yours. |
| `onRefuse` | `(message: string) => void` | Required. Called instead of `onImport` for a file over 5 MB. |
| `onExport` | `() => void` | Required. |

The panel never parses the CSV, because the server is the authority on which line or column is bad.
It resets the file input after every pick, so choosing the same file again fires again.

## Data store helpers

`@w6w/ui` also exports the pure helpers behind these components. They have no React, SDK or
network dependency, so a host can use them in tests or on the server. Paths, query builders and
cache keys are not here; those stay with the host.

- **Types**: `DataStore`, `DataStoreKind`, `ScalarType`, `TableColumn`, `TableSchema`, `KvSchema`,
  `Entry`, `DataStorePage`, `EntryPage`, `ImportResult`, `DataStoreCreateInput`, `DataStorePatch`,
  `RowDraft`, `CellProblem` and `DataStoreErrorLocator`.
- **Constants**: `DATA_STORE_KINDS`, `DATA_STORE_KIND_LABEL`, `SCALAR_TYPES` and `CSV_MAX_BYTES`.
- **Schema readers**: `kvValueTypeOf(store)`, `tableSchemaOf(store)` and
  `csvFilenameOf(contentDisposition, storeName)`.
- **Cells**: `parseCell(type, text, required)` turns typed text into the value the server takes (or
  a refusal with its message); `serializeCell(type, value)` goes the other way; `isCellValue`.
- **Rows**: `newRowDraft`, `draftFromEntry`, `dirtyColumns`, `buildRowValue`, `rowWriteOf`,
  `rowValueOf`, `remainingTtlSeconds`, `kvValueOf` and `parseDocText`.
- **Errors**: `locateDataStoreError(e)` and `locateRawResponseError(res)` read the server's
  `field`, `row` and `column` out of a failure; `errorPlacement` decides where it is shown;
  `cellErrorsOf`, `isVersionConflict`, `csvLineOf` and `csvImportMessage` build on them.

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
