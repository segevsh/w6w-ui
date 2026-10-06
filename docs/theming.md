---
id: null
key: "theming"
title: "Theming"
section: "ui"
description: "Make @w6w/ui follow your app's light/dark mode and recolor it with your own brand tokens."
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

# Theming

`@w6w/ui` ships a complete light and dark theme as CSS custom properties. This page shows how to
make the components follow your app's own mode, and how to recolor them without forking the
stylesheet.

## Before you start

- `@w6w/ui/styles.css` (or `@w6w/ui/code.css`) is imported once in your app. See the
  [overview](/ui/overview/).

## 1. Tell the components which mode your app is in

Pass your app's resolved mode to `W6WUIProvider`:

```tsx
import { W6WUIProvider } from "@w6w/ui";

<W6WUIProvider api={api} theme={isDark ? "dark" : "light"}>
  <YourApp />
</W6WUIProvider>
```

Re-render with the new value when the user toggles, and every component switches without a
remount.

You'll know it worked when a visitor whose OS is set to dark mode sees the components in your
page's light theme (and vice versa). Open DevTools: the provider renders a
`<div data-theme="light" style="display: contents">` around your tree. `display: contents` keeps
that wrapper out of your layout, so flex and grid gaps behave as if it weren't there.

> **Good to know:** without `theme`, the components follow the visitor's **OS** setting, not your
> page. A dark-mode visitor on a light page gets dark modals and dark icon swatches inside it.
> If your app has any theme of its own, pass it.

### How the mode is chosen

Most specific wins:

1. A `theme` prop on the component itself (`AppIcon`, `CodeEditor`, `JsonEditor`, `YamlEditor`,
   and the components that pass it to their icons: `AppPicker`, `AddConnectionModal`,
   `StepBuilderModal`).
2. `<W6WUIProvider theme>`.
3. `data-theme="light"` or `data-theme="dark"` on `<html>`. For the CSS, any ancestor element
   works.
4. The visitor's `prefers-color-scheme`.

The CSS and the components that branch in JavaScript (app icons picking a dark variant, the code
editors picking a dark highlight theme, the workflow canvas) follow the same order, so they never
disagree.

If your app already sets `data-theme="light|dark"` on `<html>`, that works too, but the provider
prop is the supported contract: it doesn't depend on your page happening to use the same attribute.

## 2. Recolor with your own tokens

Every default is declared with `:where(...)`, which has zero specificity. Any rule you write, even
a plain `:root { }`, wins without `!important`:

```css
/* One token, both modes */
:root {
  --w6w-accent: #0f766e;
  --w6w-radius: 6px;
}

/* A mode-specific override */
[data-theme="dark"] {
  --w6w-panel: #101418;
}
```

Load your overrides after `@w6w/ui/styles.css`, or anywhere: specificity already favors yours.

You'll know it worked when primary buttons (`.w6w-btn`) and the border of a focused input switch
to your accent.

### Color tokens

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--w6w-bg` | `#f7f8fa` | `#0f1115` | Page background behind panels |
| `--w6w-panel` | `#ffffff` | `#181b22` | Cards, modals, inputs |
| `--w6w-panel-2` | `#f0f2f6` | `#1f232c` | Secondary surfaces, code blocks |
| `--w6w-border` | `#d9dee5` | `#2a2f3a` | Borders and dividers |
| `--w6w-text` | `#1a1d24` | `#e6e8ee` | Body text |
| `--w6w-muted` | `#5f6875` | `#9aa3b2` | Secondary text, hints |
| `--w6w-accent` | `#3355e6` | `#5b8cff` | Primary actions, links, focus |
| `--w6w-danger` | `#c1362f` | `#ff6b6b` | Destructive actions, errors |
| `--w6w-success` | `#2e9e5b` | `#3fbf77` | Success states |
| `--w6w-health-ok` | `var(--w6w-success)` | `var(--w6w-success)` | Health "Operational" |
| `--w6w-health-degraded` | `#c77700` | `#f0a020` | Health "Degraded" |
| `--w6w-health-down` | `var(--w6w-danger)` | `var(--w6w-danger)` | Health "Down" |
| `--w6w-health-unknown` | `#5f6875` | `#9aa3b2` | Health "Unknown" |
| `--w6w-icon-swatch` | `#f0f2f6` | `#1f232c` | Tile behind app icons |
| `--w6w-radius` | `10px` | `10px` | Corner radius of panels and controls |

### Code highlighting tokens

`CodeBlock` colors its tokens from these, so a recolor reaches code too:

| Token | Light | Dark |
| --- | --- | --- |
| `--w6w-code-comment` | `#6b7280` | `#7d8797` |
| `--w6w-code-keyword` | `#8250df` | `#d2a8ff` |
| `--w6w-code-string` | `#0a7b34` | `#7ee787` |
| `--w6w-code-number` | `#b3541e` | `#ffab70` |
| `--w6w-code-function` | `#1f6feb` | `#79c0ff` |
| `--w6w-code-punctuation` | `#5f6875` | `#9aa3b2` |
| `--w6w-code-variable` | `#953800` | `#ffa657` |

The defaults come from the W6W brand palette. Spacing, type sizes and fonts are tokens too; see
[Design system](/ui/design-system/).

## 3. Restyle a single component

Every component renders stable, global `.w6w-*` class names (the stylesheet deliberately doesn't use
CSS Modules, so they never get hashed). Target them from your own CSS when a token isn't enough:

```css
.w6w-modal {
  box-shadow: 0 24px 48px rgb(0 0 0 / 0.25);
}
```

Prefer tokens where one exists: they follow the mode for you, while a hard-coded color in a class
override is the same in light and dark.

## Troubleshooting

| Symptom | Cause | What to do |
| --- | --- | --- |
| Components are dark on your light page (or the reverse) | No `theme` on the provider, and no `data-theme` on an ancestor, so the OS preference wins. | Pass `theme` to `W6WUIProvider`. |
| App icons or the code editor stay in the old mode after a toggle, while the CSS switched | You set `data-theme` on an element other than `<html>`. The CSS follows any ancestor, but the JavaScript side only watches `<html>` and the provider. | Pass `theme` to `W6WUIProvider` instead. |
| Your `--w6w-*` override does nothing | It's set on an element that isn't an ancestor of the component, such as a sibling. | Set it on `:root` or on a wrapper around the components. |

## Where to next

- **[Design system](/ui/design-system/)**: the spacing and type scale.
- **[Components](/ui/components/)**: what each component renders.
