---
id: null
key: "components/buttons"
title: "Buttons and icons"
section: "reference-packages"
description: "Add accessible icon-only buttons and draw glyphs from @w6w/ui's shared icon set."
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

# Buttons and icons

Icon-only buttons with a required accessible name, and the glyph set they draw from. All four are
props-only.

For a text button, use a plain `<button className="w6w-btn">` and the library's button styles
apply.

## `IconButton`

A square, icon-only button. Its `label` is always the `aria-label`, so screen readers announce it
even though nothing visible says it.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `label` | `string` | Required | Accessible name. Also the tooltip unless `title` is set. |
| `onClick` | `() => void` | Required | Click handler. |
| `icon` | `IconName` | None | A glyph from the shared set, by name. |
| `children` | `ReactNode` | None | Your own glyph markup. Wins over `icon` if you pass both. |
| `iconSize` | `number` | `16` | Size passed to the named `icon`. |
| `title` | `string` | `label` | Tooltip text, when it should differ from the accessible name. |
| `danger` | `boolean` | `false` | Danger styling, for destructive actions. |
| `disabled` | `boolean` | `false` | Disables the button. |
| `aria-pressed`, `aria-expanded` | `boolean` | None | Passed through, for toggle and disclosure buttons. |
| `className`, `data-testid` | `string` | None | Passed through. |

It forwards a `ref` to the underlying `<button>`.

```tsx
import { IconButton } from "@w6w/ui";

<IconButton label="Show history" icon="history" onClick={() => setOpen(true)} />
```

## `Icon`

One glyph from the shared set, drawn in `currentColor`.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `name` | `IconName` | Required | Which glyph. |
| `size` | `number` | `16` | Width and height in px. |
| `label` | `string` | None | Omit for a decorative glyph (it gets `aria-hidden`). Pass it when the icon stands alone as content: it then renders as `role="img"` with this name. |
| `className` | `string` | None | Added to `w6w-icon`. |

```tsx
import { Icon } from "@w6w/ui";

<span className="w6w-muted">
  <Icon name="warning" /> Rate limited
</span>
```

`iconNames` lists every available name at runtime. Today's set: `edit`, `edit-2`, `delete`,
`copy`, `check`, `close`, `history`, `clock`, `json`, `code`, `sync`, `cloud-download`, `eye`,
`play`, `stop`, `warning`, `file-text`, `settings`, `settings-2`, `github`, `user`, `users`,
`logout`, `id-card`, `dashboard`, `pulse`, `workflow`, `globe`, `lambda`, `sliders`, `file`,
`plug`, `grid`, `folder`, `git-branch`, `coin`, `building`, `server`, `price-tag`, `lang-node`,
`terminal`, `lang-python`, `lang-curl`, `sun`, `moon`, `circle-half`, `layout`, `run`, `trash`,
`maximize`, `form` and `braces`.

## `EditButton` and `DeleteButton`

Ready-made `IconButton`s: `EditButton` draws the pencil, `DeleteButton` draws the trash can and is
always danger-styled. Both take `label`, `onClick`, `disabled`, `className` and `data-testid`.

`DeleteButton` doesn't ask for confirmation. Gate it yourself, for example with
[`ConfirmModal`](/reference-packages/components/modals/):

```tsx
import { ConfirmModal, DeleteButton, EditButton } from "@w6w/ui";

<EditButton label="Rename connection" onClick={startRename} />
<DeleteButton label="Delete connection" onClick={() => setConfirming(true)} />
{confirming && (
  <ConfirmModal
    title="Delete connection?"
    message="Workflows using it will stop authenticating."
    confirmLabel="Delete"
    onConfirm={() => {
      remove();
      setConfirming(false);
    }}
    onClose={() => setConfirming(false)}
  />
)}
```

## Where to next

- **[Data display](/reference-packages/components/data-display/)**: app icons, list rows and copy-to-clipboard.
- **[Modals](/reference-packages/components/modals/)**: `ConfirmModal` and the other dialogs.
