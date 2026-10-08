---
id: null
key: "design-system"
title: "Design system"
section: "reference-packages"
description: "Reuse @w6w/ui's spacing, type and font tokens so your own layout lines up with the components."
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

# Design system

Besides colors, `@w6w/ui` exposes its spacing, type, weight, line-height and font choices as
`--w6w-*` custom properties. Use them in the page around the components and your layout lines up
with theirs. Override them and the components follow your scale instead. Colors and light/dark mode
are on [Theming](/reference-packages/theming/).

These tokens don't change with the mode, so they're declared once, for both.

## Spacing

A 4px base. Use these for `padding`, `margin` and `gap`.

| Token | Value |
| --- | --- |
| `--w6w-sp-1` | `4px` |
| `--w6w-sp-2` | `8px` |
| `--w6w-sp-3` | `12px` |
| `--w6w-sp-4` | `16px` |
| `--w6w-sp-5` | `20px` |
| `--w6w-sp-6` | `24px` |
| `--w6w-sp-8` | `32px` |
| `--w6w-sp-10` | `40px` |
| `--w6w-sp-12` | `48px` |
| `--w6w-sp-16` | `64px` |
| `--w6w-sp-20` | `80px` |

Three half-steps also exist, `--w6w-sp-0-5` (`2px`), `--w6w-sp-1-5` (`6px`) and `--w6w-sp-2-5`
(`10px`). They keep a few existing component measurements exact. Reach for a whole step in your own
layout.

## Type sizes

`rem`-based, so they scale from the root font size.

| Token | Value | At a 16px root |
| --- | --- | --- |
| `--w6w-fs-xs` | `0.75rem` | 12px |
| `--w6w-fs-sm` | `0.875rem` | 14px |
| `--w6w-fs-base` | `1rem` | 16px |
| `--w6w-fs-lg` | `1.125rem` | 18px |
| `--w6w-fs-xl` | `1.25rem` | 20px |
| `--w6w-fs-2xl` | `1.5rem` | 24px |
| `--w6w-fs-3xl` | `2rem` | 32px |

## Weights, line heights and fonts

| Token | Value |
| --- | --- |
| `--w6w-fw-regular` | `400` |
| `--w6w-fw-medium` | `500` |
| `--w6w-fw-semibold` | `600` |
| `--w6w-fw-bold` | `700` |
| `--w6w-lh-tight` | `1.2` |
| `--w6w-lh-normal` | `1.5` |
| `--w6w-lh-relaxed` | `1.7` |
| `--w6w-font-sans` | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| `--w6w-font-mono` | `ui-monospace, SFMono-Regular, Menlo, monospace` |

## Use the tokens in your own CSS

```css
.my-settings-page {
  display: grid;
  gap: var(--w6w-sp-6);
  padding: var(--w6w-sp-8) var(--w6w-sp-6);
  font-family: var(--w6w-font-sans);
}

.my-settings-page h2 {
  font-size: var(--w6w-fs-xl);
  font-weight: var(--w6w-fw-semibold);
  line-height: var(--w6w-lh-tight);
}
```

## Override the scale

Like the color tokens, every scale token is declared with zero specificity, so a plain `:root`
rule wins:

```css
:root {
  --w6w-font-sans: "Inter", system-ui, sans-serif;
  --w6w-sp-3: 10px; /* every component spacing that uses sp-3 tightens */
}
```

To make the components' text smaller overall, set the type tokens or the **root** font size.
Setting `font-size` on `body` alone does nothing to them: `rem` always resolves against `<html>`.

```css
:root {
  --w6w-fs-sm: 0.8125rem;
  --w6w-fs-base: 0.875rem;
}
```

## Breakpoints (Sass only)

If you build with Sass, `@w6w/ui/styles/scale` also exports three breakpoints:

| Variable | Default |
| --- | --- |
| `$w6w-bp-sm` | `640px` |
| `$w6w-bp-md` | `900px` |
| `$w6w-bp-lg` | `1200px` |

They're Sass variables, not custom properties, because a media query can't read a custom property.
Override one when you load the partial:

```scss
@use "@w6w/ui/styles/scale" with ($w6w-bp-md: 960px);

.my-sidebar {
  @media (min-width: scale.$w6w-bp-md) {
    width: 280px;
  }
}
```

The components themselves use no layout media queries: your page owns the layout, and a component
fills the space you give it. Props like `ActionTestForm`'s `embedded` switch a component's layout
explicitly instead.

## What isn't a token

Heights, widths, border widths and per-control radii are fixed inside the components. For example,
expression fields, multiselects and copyable inputs share a `38px` minimum height so they line up
in a row. Change those with a class override (see [Theming](/reference-packages/theming/#3-restyle-a-single-component)),
not by redefining a spacing token. `--w6w-radius` is the one shared radius, and it's listed with the
color tokens.

## Where to next

- **[Theming](/reference-packages/theming/)**: colors and light/dark mode.
- **[Components](/reference-packages/components/)**: the components that use this scale.
