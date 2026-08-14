# @w6w/ui

React components for [w6w](https://github.com/w6w-io), a workflow platform. Ships components used by the reference studio and available for any partner app that talks to a w6w server.

## Install

```sh
npm install @w6w/ui
```

## Usage

The components are **pure presentation** — you pass in data and handlers, so you can wire them to whatever API client and state management you already use.

```tsx
import { AddConnectionModal } from "@w6w/ui";
import "@w6w/ui/styles.css";

<AddConnectionModal
  apps={apps}
  getAppAuth={(appId) => api.getAppAuth(appId)}
  createConnection={(appId, body) => api.createConnection(appId, body)}
  startOAuthFlow={(appId, authKey, body) => api.startAppOAuthFlow(appId, authKey, body)}
  onClose={() => setModalOpen(false)}
  onCreated={() => refetch()}
/>
```

## Theming

`styles.css` defines defaults for CSS custom properties under the `--w6w-*` namespace (`--w6w-panel`, `--w6w-border`, `--w6w-text`, `--w6w-muted`, `--w6w-accent`, `--w6w-danger`, `--w6w-radius`). Override them at `:root` (or any parent) to theme the components.

```css
:root {
  --w6w-panel: #ffffff;
  --w6w-accent: #6b46c1;
}
```

### Where the styles come from

The stylesheet is authored in **Sass**: `src/styles.scss` is the entry point and `src/styles/*.scss`
holds one partial per component family. `src/styles.css` is compiled from those (`pnpm build:css`)
and committed, so `import "@w6w/ui/styles.css"` above needs no Sass toolchain on your side — that
stays the supported way in.

If you *do* build with Sass, you can import the source instead and get the partials as
`@use`-able modules:

```scss
@use "@w6w/ui/styles.scss";   // the whole stylesheet
@use "@w6w/ui/styles/health"; // or one family — see src/styles/ for the list
```

Editing `src/styles.css` by hand has no effect — it is regenerated, and `pnpm check:css` fails when
it has drifted from the Sass sources. Two things stay fixed on purpose: `--w6w-*` remain **CSS**
custom properties (Sass variables would compile away before you could override them at runtime), and
`.w6w-*` class names are part of the public surface, which is why this ships as one global
stylesheet rather than CSS Modules.

## License

**FSL-1.1-ALv2** — the [Functional Source License](LICENSE), which converts to Apache 2.0 two years
after each version is released.

In plain terms: build whatever you like on these components — plugins, apps, integrations, internal
tools, client work, commercial products. The one carve-out is **Competing Use**: you may not use them
to offer a product or service that substitutes for w6w or for something we build with them.

`@w6w/expr` and `@w6w/types`, which this package depends on, stay **MIT** — the expression grammar
and the shared model are deliberately permissive so anything can read and write w6w's formats.
