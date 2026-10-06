---
id: null
key: "overview"
title: "UI components overview"
section: "ui"
description: "Get @w6w/ui into a React app and render your first component against a w6w server."
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

# UI components overview

`@w6w/ui` is the React component library W6W's own Studio is built from: the connect-an-app modal,
the app picker, the step builder, the visual workflow canvas, execution history, health pills and
the smaller pieces around them. Put it in your own product and your users get the same screens,
pointed at your W6W server. This page gets the package into your build and renders one connected
component.

It's MIT-licensed. There is no separate embed widget and no Studio iframe: you compose these
components into your own pages.

## Before you start

- A React app on React 18 or later (`react` and `react-dom` are peer dependencies).
- A bundler that compiles TypeScript (`.tsx`) source from a dependency. Vite does this out of the
  box. See [Bundler notes](#bundler-notes) for Next.js, Astro and webpack.
- A W6W server URL and a way to get a bearer token for the signed-in user. See the
  [Quickstart](/quickstart/).

## 1. Add the package

`@w6w/ui` is not on npm yet. Install it from the public GitHub repository, pinned to a commit:

```json
{
  "dependencies": {
    "@w6w/ui": "github:w6w-io/w6w-ui#<commit-sha>"
  }
}
```

Then run `pnpm install`.

Use pnpm. `@w6w/ui` depends on `@w6w/expr` through a subdirectory git spec
(`github:w6w-io/w6w-core#path:packages/expr`), and other package managers may not resolve the
`#path:` form. If yours can't, check the repository out beside your app and depend on it with
`"@w6w/ui": "link:../w6w-ui"` instead.

You'll know it worked when `node_modules/@w6w/ui/src/index.ts` exists.

> **Good to know:** the package ships TypeScript source, not a compiled `dist/`. Its `exports` point
> at `./src/index.ts`, so your bundler compiles it the same way it compiles your own code.

## 2. Import the stylesheet once

Import the compiled CSS at your app's entry point:

```tsx
import "@w6w/ui/styles.css";
```

It's plain CSS. You don't need Sass, Tailwind or a CSS-in-JS runtime. Every class is prefixed
`.w6w-` and every token is a `--w6w-*` custom property, so nothing collides with your own styles.

## 3. Wrap your app in `W6WUIProvider`

Components that talk to the server (the app picker, the connection modal, the step builder, the
action tester and the workflow canvas) read one shared API client from context. Build it with
`createW6WApi` and provide it once:

```tsx
import { W6WUIProvider, createW6WApi } from "@w6w/ui";
import "@w6w/ui/styles.css";

const api = createW6WApi({
  baseUrl: import.meta.env.VITE_W6W_BASE_URL, // e.g. https://<your-host>
  token: () => getCurrentUserToken(),          // your own session lookup; may be async
});

export function Root({ children }: { children: React.ReactNode }) {
  return (
    <W6WUIProvider api={api} theme="light">
      {children}
    </W6WUIProvider>
  );
}
```

Pass `theme` when your app has its own light/dark setting. Without it, the components follow the
visitor's OS preference, which may not match your page. See [Theming](/ui/theming/).

## 4. Render a component

```tsx
import { AppPicker } from "@w6w/ui";

export function ChooseApp() {
  return <AppPicker onSelectApp={(app) => console.log("picked", app.id)} />;
}
```

Render `<ChooseApp />` anywhere under `<Root>`. You should see a searchable grid of the apps in your
W6W catalog. Clicking a card logs its id.

If you see `useW6WApi must be used inside <W6WUIProvider>`, the component is rendering outside the
provider. If the grid stays empty, open the browser's network tab: a `401` on `GET /apps` means the
token is missing or expired.

## What needs the provider

| Needs `W6WUIProvider` | Works without it (props in, callbacks out) |
| --- | --- |
| `AppPicker`, `AddConnectionModal`, `ActionTestForm`, `StepBuilderModal`, `WorkflowFlowEditor` | Everything else: buttons, icons, `Modal`, `ConfirmModal`, forms, editors, `CodeBlock`, status pills, execution history, server resources |

The props-only components never fetch. You pass the data and handle the callbacks, so you can wire
them to `@w6w/react`, your own client or static data.

## Entrypoints

Import only what you use. A bundler resolves every import before it tree-shakes, so the entrypoint
you pick decides which dependencies your build needs at all.

| Import | What's in it | Stylesheet |
| --- | --- | --- |
| `@w6w/ui` | Every component except the workflow canvas, plus the provider, `createW6WApi`, hooks and types | `@w6w/ui/styles.css` |
| `@w6w/ui/flow` | `WorkflowFlowEditor` and its workflow helpers. Pulls in `@xyflow/react`. | `@w6w/ui/styles.css` |
| `@w6w/ui/code` | `CodeBlock` and `Copyable` only. Needs just React and `prism-react-renderer`. | `@w6w/ui/code.css` |

`code.css` is a subset of `styles.css`, so importing both is harmless. Use `@w6w/ui/code` for a page
that only shows code snippets, such as a docs or marketing site: it skips CodeMirror and
`@w6w/expr` entirely.

If you build with Sass, you can `@use "@w6w/ui/styles.scss"` (or a single partial such as
`@use "@w6w/ui/styles/health"`) instead of the CSS file.

## Bundler notes

| Toolchain | What to set |
| --- | --- |
| Vite | Nothing for an installed dependency. For a `link:`ed checkout, add `optimizeDeps: { exclude: ["@w6w/ui"] }` so edits aren't served from a stale pre-bundle. |
| Next.js | Add `transpilePackages: ["@w6w/ui"]` to `next.config`, since Next doesn't compile TypeScript inside `node_modules` by default. Render the components from client components. |
| Astro / any SSR build | Add `@w6w/ui` (and `prism-react-renderer` if you use `CodeBlock`) to Vite's `ssr.noExternal`. Node can't import `.tsx` directly. |
| webpack | Make sure your TypeScript or Babel loader includes `node_modules/@w6w/ui`. |
| Any linked checkout | Add `resolve.dedupe: ["react", "react-dom"]` (or your bundler's equivalent) so the library doesn't load a second React. |

## Where to next

- **[Theming](/ui/theming/)**: match light/dark mode and your brand colors.
- **[Components](/ui/components/)**: every component, what it's for and its key props.
- **[Providers and the API client](/ui/components/providers/)**: what `W6WApi` must implement,
  and how to bridge from `@w6w/react` instead of `createW6WApi`.
- **[Design system](/ui/design-system/)**: the spacing and type scale you can reuse in your own
  layout.
