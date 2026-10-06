<p align="center">
  <a href="https://w6w.io">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/w6w-lockup-ondark.svg">
      <source media="(prefers-color-scheme: light)" srcset=".github/assets/w6w-lockup.svg">
      <img src=".github/assets/w6w-lockup.svg" alt="W6W" width="320">
    </picture>
  </a>
</p>

# @w6w/ui

React components for [W6W](https://w6w.io) — central API management: one front door, composition,
visibility and plug & play for every API a product runs on. These are the components W6W's own
studio is built from, packaged for any app that talks to a W6W server: the connect-an-app modal,
the app picker, the step builder, the visual workflow canvas, execution history, health and status
indicators, and the smaller pieces around them.

## Documentation

The user guide lives in [`docs/`](docs/) and is published at
[docs.w6w.io](https://docs.w6w.io) under **UI**:

- [Overview](docs/overview.md): install, stylesheet, provider, first component, bundler notes.
- [Theming](docs/theming.md): light/dark mode and every color token.
- [Design system](docs/design-system.md): the spacing, type and font tokens.
- [Components](docs/components/index.md): every component, by group, with props and examples.

This README covers the repository itself: what's in it and how it's built.

## Install / consume

`@w6w/ui` is not published to npm yet (the release workflow exists; no version has shipped). Two
routes:

- **Git dependency**: `"@w6w/ui": "github:w6w-io/w6w-ui#<commit-sha>"` — the repo is public. Use
  pnpm: `@w6w/expr` is itself a subdirectory git dependency
  (`github:w6w-io/w6w-core#path:packages/expr`), and not every package manager resolves `#path:`.
- **Sibling checkout with `link:`**: `"@w6w/ui": "link:../w6w-ui"` — the pattern this monorepo
  uses (`studio` links `ui` this way).

`react` and `react-dom` (18 or later) are peer dependencies.

`main`/`module`/`types` and `exports` all point at raw `.tsx` source under `./src`, not a pre-built
`dist/` (`publishConfig` switches them to `dist/` for the npm tarball), so your bundler compiles the
package like your own code. Vite needs nothing extra; a few setups do — see the
[bundler notes](docs/overview.md#bundler-notes):

- **Vite with a `link:` checkout**: studio sets `optimizeDeps.exclude: ["@w6w/ui"]` so edits are
  picked up live.
- **SSR builds**: the package must be bundled, not externalized — the frontend site's Astro build
  sets `ssr.noExternal` for `@w6w/ui` and `prism-react-renderer` (a React-rendering dependency of a
  source package needs its own entry). Next.js needs the equivalent, `transpilePackages`.
- **A linked checkout**: dedupe React (`resolve.dedupe: ["react", "react-dom"]`), or two copies
  break hooks.

## Usage

Five components call your W6W server themselves — `AppPicker`, `AddConnectionModal`,
`ActionTestForm`, `StepBuilderModal` and `WorkflowFlowEditor`. They read one API client from
`W6WUIProvider`. Every other component is props in, callbacks out.

```tsx
import { AddConnectionModal, W6WUIProvider, createW6WApi } from "@w6w/ui";
import "@w6w/ui/styles.css";

const api = createW6WApi({ baseUrl: "https://<your-host>", token: () => getToken() });

<W6WUIProvider api={api} theme="light">
  {open && (
    <AddConnectionModal
      onClose={() => setOpen(false)}
      onCreated={({ connectionId }) => {
        setOpen(false);
        refetch(connectionId);
      }}
    />
  )}
</W6WUIProvider>
```

`createW6WApi` implements every required `W6WApi` member plus `listApps` and `listTestRuns`. It does
not implement the optional paged-catalog or app-trigger members, and its `invokeAction` does not
forward `overrides` yet. `@w6w/react`'s `createW6WUiAdapter` is the other way to build the client.
See [Providers and the API client](docs/components/providers.md).

`Copyable` is the one props-only component with a side effect: it writes to `navigator.clipboard`.

```tsx
import { CodeBlock, Copyable } from "@w6w/ui";

<Copyable value={apiKey} readOnly>
  <input readOnly value={apiKey} />
</Copyable>

<CodeBlock code={curlSnippet} language="bash" />
```

### Entrypoints

Three, so you only resolve what you use. This matters more than bundle size: the root index
imports `@w6w/expr` and CodeMirror, and a bundler resolves before it tree-shakes, so a consumer
without those in its tree fails to *build*, not merely to slim down.

| Import | Contains | Stylesheet |
|--------|----------|------------|
| `@w6w/ui` | everything except the flow editor | `@w6w/ui/styles.css` (~121 KB) |
| `@w6w/ui/flow` | `WorkflowFlowEditor` and its helpers — pulls in `@xyflow/react` | `@w6w/ui/styles.css` |
| `@w6w/ui/code` | `CodeBlock` + `Copyable` — needs only React and `prism-react-renderer` | `@w6w/ui/code.css` (~19 KB) |

`code.css` is a strict subset of `styles.css`, so importing both is harmless — the rules are
byte-identical. Reach for `@w6w/ui/code` when you want the highlighter in something that is not a
full W6W console; the marketing site (`packages/frontend`) renders its homepage snippets that way,
at build time, shipping no React at all.

`WorkflowFlowEditor` imports React Flow's stylesheet (`@xyflow/react/dist/style.css`) itself.

```tsx
import { CodeBlock } from "@w6w/ui/code";
import "@w6w/ui/code.css";
```

## Theming

`styles.css` defines every color as a `--w6w-*` custom property, in a light and a dark variant:
surfaces and text (`--w6w-bg`, `--w6w-panel`, `--w6w-panel-2`, `--w6w-border`, `--w6w-text`,
`--w6w-muted`), roles (`--w6w-accent`, `--w6w-danger`, `--w6w-success`), health
(`--w6w-health-*`), code (`--w6w-code-*`), plus `--w6w-radius` and `--w6w-icon-swatch`. Defaults are
declared with zero specificity (`:where(...)`), so a plain `:root` rule overrides them.

```css
:root {
  --w6w-accent: #6b46c1;
}
```

The mode resolves in this order: a component's own `theme` prop, then `<W6WUIProvider theme>`,
then a `data-theme` attribute on `<html>` (or any ancestor, for the CSS), then the OS
`prefers-color-scheme`. An embedder whose app has its own theme should pass it to the provider, or
the components may render in a different mode than the page around them. Full tables and the
troubleshooting list: [`docs/theming.md`](docs/theming.md).

The same namespace carries the spacing and type scale (`--w6w-sp-*`, `--w6w-fs-*`, `--w6w-fw-*`,
`--w6w-lh-*`, `--w6w-font-*`): [`docs/design-system.md`](docs/design-system.md). The `lint:tokens`
gate that keeps new code on that scale is described in [CONTRIBUTING.md](CONTRIBUTING.md).

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

### Palette ancestry

`@w6w/ui` compiles its own `--w6w-*` tokens from `src/styles.scss` above — branding is not a build
dependency, so nothing here fetches or imports from another repo at build time. The values
themselves descend from [`w6w-io/w6w-branding`](https://github.com/w6w-io/w6w-branding), the source
palette (`tokens/tokens.json`, `BRAND.md`); a branding update is ported into `src/styles/` by hand,
not pulled in automatically.

## Components

42 exported components (the count `pnpm coverage:stories` checks), grouped as in the docs:

- **Providers**: `W6WUIProvider`, `ExpressionOptionsProvider` (plus `createW6WApi`, `useW6WApi`,
  `useExpressionOptions`, `startOAuthPopup`, `useEnterSubmit`).
- **Buttons and icons**: `IconButton`, `Icon`, `EditButton`, `DeleteButton`.
- **Data display**: `AppIcon`, `ListItem`, `Copyable`, `CopyableText`.
- **Forms**: `AppPicker`, `ActionTestForm`, `ParamsForm`, `PropertyEntryForm`, `AuthFieldsForm`,
  `ExpressionInput`, `NodeConfigForm`, `RetryPolicyFields`.
- **Editors**: `CodeBlock`, `CodeEditor`, `JsonEditor`, `YamlEditor`.
- **Workflow canvas**: `WorkflowFlowEditor` (from `@w6w/ui/flow`).
- **Modals**: `Modal`, `ConfirmModal`, `AddConnectionModal`, `StepBuilderModal`.
- **Status and health**: `HealthStatusPill`, `StepStatusPill`, `UptimeStrip`, `HistoryTimeline`,
  `RepoSyncIndicator`.
- **Executions**: `ExecutionList`, `ExecutionFilters`, `ExecutionStats`, `ExecutionDetail`,
  `ExecutionLogPanel`, `ApiCallsPanel`.
- **Server resources**: `ServerResourcesCard`, `ServerResourcesCardSmall`, `ServerResourcesRail`,
  `ServerResourcesBadge`.

Everything is exported from `@w6w/ui` except `WorkflowFlowEditor`, which is only in `@w6w/ui/flow`
(alongside a re-export of `ExpressionOptionsProvider`). `@w6w/ui/code` re-exports `CodeBlock` and
`Copyable`.

## Storybook

```sh
pnpm storybook         # dev server on :6006
pnpm build-storybook   # static build in storybook-static/ (gitignored)
pnpm coverage:stories  # fail if an exported component has no story
```

Stories live **beside their component** (`src/CodeBlock.stories.tsx`), never in a separate
`stories/` tree, so one cannot drift from the other; `.storybook/main.ts` globs
`../src/**/*.stories.tsx` and nothing else. There are deliberately no scaffolded Button/Header/Page
examples — every entry in the sidebar is a real component of this library.

The sidebar is grouped by category: each story's `title` is `<Category>/<Component>`
(`"Forms/ParamsForm"`), and the category is one of the list in `.storybook/preview.tsx`'s
`storySort.order` — Buttons, Forms, Editors, Modals, Data Display, Status & Health, Executions,
Server Resources, Providers. A new category is added to that list too, so the sidebar order stays
deliberate.

Every component exported from the root entrypoint and from both subpaths (`@w6w/ui/flow`,
`@w6w/ui/code`) has a co-located story. `pnpm coverage:stories` enforces this: it reads every
component out of `package.json`'s `exports` map and fails, listing each one by name, if any has no
matching `*.stories.tsx` — so a newly exported component that ships without a story fails the check,
not just an existing one that loses its story.

The toolbar's **Theme** switch sets `data-theme` on the canvas, which is the same signal the
components and `styles.scss` read, so a story is exercising the real theming contract. The preview
imports `src/styles.scss` (the authored source) rather than the compiled CSS, so editing a partial
under `src/styles/` hot-reloads.

Stories are excluded from the published tarball (`files`) and from the `.d.ts` emit.

## Develop / contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup, the full command list, and the rule that a
new exported component ships with its story.

## Credits

Maintained by **W6W** — `w6w, Inc, a Delaware corporation`.
[w6w.io](https://w6w.io) · [docs.w6w.io](https://docs.w6w.io)

The `Icon` set (`src/components/icons.tsx`) is copied from the studio's inline SVGs, most of them
in the [Feather](https://feathericons.com) idiom (MIT, © Cole Bemis); each entry names its source.

Built with [`@xyflow/react`](https://reactflow.dev), CodeMirror (via
[`@uiw/react-codemirror`](https://uiw-react-codemirror.vercel.app)), and
[`prism-react-renderer`](https://github.com/FormidableLabs/prism-react-renderer).

## License

**MIT** — see [LICENSE](LICENSE). (Relicensed from FSL-1.1-ALv2 on 2026-09-23; the studio stays
FSL.)

`@w6w/expr`, which this package depends on, is MIT too, as is `@w6w/types`, the shared model these
components' wire types mirror (`@w6w/ui` keeps its own local copy rather than depending on it).
