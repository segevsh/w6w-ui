---
id: null
key: "components/data-display"
title: "Data display"
section: "reference-packages"
description: "Show app icons, list rows and copyable values with @w6w/ui's display components."
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

# Data display

Small building blocks for showing W6W data in your own lists and pages. All four are props-only.

## `AppIcon`

An app's icon, with a dark-mode variant and an initials tile when there's no image (or the image
fails to load).

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `src` | `string` | None | Data URI or URL of the light-mode icon. Missing ⇒ initials tile. |
| `srcDark` | `string` | None | Dark-mode variant. Falls back to `src`. |
| `name` | `string` | None | Display name; its initials fill the fallback tile. |
| `brandColor` | `string` | `var(--w6w-accent)` | Background of the initials tile. |
| `size` | `number` | `32` | Square size in px. |
| `theme` | `"light" \| "dark"` | Inherited | Forces which variant shows. See [Theming](/reference-packages/theming/). |

An `AppSummary` from the server carries these as `iconSvg`, `iconSvgDark` and `brandColor`:

```tsx
import { AppIcon } from "@w6w/ui";

<AppIcon src={app.iconSvg} srcDark={app.iconSvgDark} brandColor={app.brandColor} name={app.displayName} />
```

## `ListItem`

One row of a list: an optional leading icon, a title, a muted subtitle and a trailing slot. Pass
`onClick` and the row becomes a keyboard-reachable button.

| Prop | Type | What it does |
| --- | --- | --- |
| `title` | `ReactNode` | Required. Single line, truncated with an ellipsis. |
| `subtitle` | `ReactNode` | Muted second line. |
| `icon` | `ReactNode` | Leading slot, such as an `AppIcon`. |
| `trailing` | `ReactNode` | Right-aligned slot, such as a status pill. |
| `active` | `boolean` | Highlights the row; reflected as `aria-pressed` when clickable. |
| `onClick` | `(event) => void` | Makes the row a button, or with `href` still fires on the anchor click. ListItem never calls `preventDefault`; the host decides. |
| `href` | `string` | Renders the row as a real `<a href>` (middle-click, copy link). `trailing` sits inside the anchor, so keep it non-interactive. |
| `ariaLabel` | `string` | Accessible name for a clickable row. Defaults to the title's text. |

```tsx
import { AppIcon, HealthStatusPill, ListItem } from "@w6w/ui";

{connections.map((c) => (
  <ListItem
    key={c.id}
    title={c.displayName ?? c.appId}
    subtitle={c.appId}
    icon={<AppIcon name={c.appId} size={24} />}
    trailing={<HealthStatusPill state="ok" />}
    active={c.id === selectedId}
    onClick={() => setSelectedId(c.id)}
  />
))}
```

## `CallableList`

A list of callables (Functions, Endpoints, Workflows): rows in, callbacks out. It imports no router,
query client or `@w6w/embed` code, and it never learns what kind of callable it shows. Rows render
through `ListItem`, so with `getHref` each row is a real anchor and a click still calls `onOpen`.

| Prop | Type | What it does |
| --- | --- | --- |
| `rows` | `CallableListRow[]` | Required. `{ id, title, description?, archived, badges?, trailing? }`; the host decides `archived`. |
| `title` | `ReactNode` | Required. Rendered as an `<h2>`. |
| `description` | `ReactNode` | Muted text under the title. |
| `emptyCopy` | `ReactNode` | Shown when `rows` is empty once loaded; suppressed while `loading`. |
| `newLabel` | `string` | New button label. Defaults to `New`. |
| `onCreate` / `creating` | `() => void` / `boolean` | The New button shows only with `onCreate`; `creating` disables it. |
| `onImport` | `() => void` | The Import button shows only with this. |
| `onOpen` | `(id, event) => void` | Row click. The event is untouched, so the host may `preventDefault`. |
| `getHref` | `(id) => string` | Makes each row an anchor. |
| `showArchived` / `onShowArchivedChange` | `boolean` / `(next) => void` | Controls the Show archived toggle. Omit for an uncontrolled toggle that starts off. |
| `loading` / `error` | `boolean` / `string \| null` | Loading line and error banner. |
| `openRowTitle`, `testIds` | `string`, `{ showArchived?, importOpen?, archivedBadge? }` | Row tooltip and test ids. |
| `slots` | `{ header?, actions?, empty? }` | `header` replaces the title block, `actions` renders before Import/New, `empty` replaces `emptyCopy`. |

```tsx
import { CallableList } from "@w6w/ui";

<CallableList
  title="Functions"
  rows={functions.map((f) => ({ id: f.id, title: f.name, archived: f.archivedAt != null }))}
  getHref={(id) => `/functions/${id}`}
  onOpen={(id) => openFunction(id)}
  onCreate={createFunction}
/>
```

## `Copyable`

Adds a copy-to-clipboard button inside the box of an input, textarea or code block. Unlike most
components, it has a side effect: it writes to `navigator.clipboard`. After a copy, the button shows
a checkmark briefly.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `value` | `string` | Required | The exact text copied. |
| `children` | `ReactNode` | Required | The control that displays the value. |
| `readOnly` | `boolean` | `false` | When `true`, a click anywhere in the box copies, not just the button. |
| `label` | `string` | `"Copy"` | Accessible name of the copy button. |
| `copiedMs` | `number` | `1500` | How long the checkmark shows, in ms. |
| `className` | `string` | None | Added to the wrapper. |

```tsx
import { Copyable } from "@w6w/ui";

<Copyable value={webhookUrl} readOnly label="Copy webhook URL">
  <input readOnly value={webhookUrl} />
</Copyable>
```

`Copyable` is also exported from `@w6w/ui/code`, for pages that load only `code.css`.

## `CopyableText`

Inline text that copies on click, optionally cropped for display. The full `value` is always what
gets copied.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `value` | `string` | Required | The full string. |
| `chars` | `number` | Show in full | How many characters to show. |
| `crop` | `"start" \| "end" \| "middle"` | `"end"` | Where the `…` goes. |
| `label` | `string` | `"Copy"` | Accessible name of the copy control. |
| `copiedMs`, `className` | | | As on `Copyable`. |

```tsx
import { CopyableText } from "@w6w/ui";

<CopyableText value={connection.id} chars={12} crop="middle" label="Copy connection id" />
```

`cropText(value, chars, crop)` is exported too, if you need the same cropping without the copy
behavior.

## `ResultViewer`

Read-only display of one result value, chosen by what the value *is*: a collapsible JSON tree,
xml as highlighted source, markdown through `Markdown`, and html rendered **only** inside an
empty-sandbox `<iframe srcdoc>` (`HtmlPreview`) — the frame has an opaque origin and a
`default-src 'none'` CSP meta as the **first element of its `srcdoc`** (the first bytes are
`<!doctype html>`), so a vendor payload cannot run script and cannot read or reach this page.
Accepted residual: a click on a link *inside* the preview navigates the frame itself — a page load in
a scriptless, same-origin-less document with no cookies, and nothing beyond it.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `value` | `unknown` | Required | The result: an already-parsed value, or a raw response body string. The format is sniffed from this root value only — string leaves inside a JSON tree stay text. |
| `maxHeight` | `number` | `320` | Height cap of the scrolling body, in px. |
| `className` | `string` | None | Added to the root element, for spacing in your pane. |

```tsx
import { ResultViewer } from "@w6w/ui";

<ResultViewer value={response.body} maxHeight={480} />
```

| Detected format | Body | Toolbar |
| --- | --- | --- |
| `json` | A collapsible tree, two levels open | Expand all / Collapse all |
| `xml` | Source (highlighted under 64 KiB) | none |
| `html` | `HtmlPreview` (sandboxed iframe) | Rendered / Source |
| `markdown` | `Markdown` | Rendered / Source |
| `text` | A wrapping `<pre>` | none |

The root element carries `data-format`, so a pane can style per format. One copy button overlays
the top-right corner of the body, revealed on hover and always shown where there is no hover; it
writes pretty-printed JSON for a tree and the raw string for every other format. html or markdown
longer than `RESULT_RENDER_MAX_CHARS` (262144) is shown as source with a note instead of being
rendered. Source views longer than 64 KiB are plain text rather than highlighted — highlighting a
multi-megabyte body cost tens of seconds, and the reader scrolling at that size gets nothing from the
colour — so an oversized result displays instantly either way.

The pieces are exported too: `HtmlPreview`, `htmlPreviewSrcDoc`, `HTML_PREVIEW_CSP`,
`detectResultFormat`, `resultCopyText`, `RESULT_RENDER_MAX_CHARS` and the `DetectedResult` type.

## Where to next

- **[Status and health](/reference-packages/components/status/)**: pills and strips for the trailing slot.
- **[Editors](/reference-packages/components/editors/)**: `CodeBlock`, which uses `Copyable` for you.
