# Contributing to @w6w/ui

Thanks for taking a look. This repo is [MIT-licensed](LICENSE) — contributions are welcome under
the same terms.

## Setup

```sh
git clone https://github.com/w6w-io/w6w-ui.git
cd w6w-ui
pnpm install
```

## Commands

| Command | What it does |
|---|---|
| `pnpm build` | Compile the Sass stylesheet, typecheck, and build the package (`build:css && tsc -b && vite build`) |
| `pnpm typecheck` | `tsc -b --noEmit` |
| `pnpm test` | Run the unit test suite |
| `pnpm lint` | `biome check .` |
| `pnpm lint:tokens` | Check new styles stay on the `--w6w-*` spacing/type scale (see [Design tokens](#design-tokens) below) |
| `pnpm coverage:stories` | Check that every exported component has a co-located `*.stories.tsx` file |
| `pnpm format` | `biome format --write .` |
| `pnpm storybook` | Dev server on `:6006` |
| `pnpm build-storybook` | Static Storybook build in `storybook-static/` (gitignored) |

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm coverage:stories` before
opening a PR — all five are expected to pass.

## Adding or changing a component

- **Every exported component ships with a co-located story**: `src/Foo.tsx` needs
  `src/Foo.stories.tsx` right beside it (never a separate `stories/` tree — see the README's
  [Storybook](README.md#storybook) section). `pnpm coverage:stories` enforces this; a new export
  with no story fails the check.
- Stories are excluded from the published package (`files` in `package.json`) and from the type
  emit — they're a dev-only artifact, so don't worry about their footprint.
- Public exports live in `src/index.ts`, `src/flow.ts` or `src/code.ts` — add your export to the
  entrypoint that matches its dependency weight (see the README's
  [Entrypoints](README.md#entrypoints) section for why there are three).

## Design tokens

The user-facing token tables are in [`docs/design-system.md`](docs/design-system.md) (scale) and
[`docs/theming.md`](docs/theming.md) (colors). The rules for writing styles in this repo:

- **Whole steps for new code.** The half-steps (`--w6w-sp-0-5`, `-1-5`, `-2-5`) exist only so
  pre-existing 2px/6px/10px literals could be tokenized without a visual change. A new gap always
  rounds to a whole step.
- **Box geometry is not on the scale.** Heights, widths, border widths and radii stay literal —
  several are cross-component invariants (the `38px` minimum height shared by expression fields,
  multiselects and copyable inputs) that must not be re-derived from a spacing token.
- **No layout media queries in `ui`.** The host owns page layout; a component's layout changes
  through a prop (`ActionTestForm`'s `embedded`), never a breakpoint. The Sass breakpoints in
  `_scale.scss` exist for hosts.
- **Parity with the marketing site is directional.** The scale is mirrored from
  `packages/frontend/packages/web/src/styles/global.css` (the canonical source, which keeps its own
  unprefixed `--sp-*`/`--fs-*` names). Every shared `web` token has a byte-identical `--w6w-*`
  counterpart here; `--fs-hero` is `web`-only and the half-steps are `ui`-only, so don't write a
  parity check as set equality.

### The `lint:tokens` gate

```sh
pnpm lint:tokens   # or: node scripts/lint-tokens.mjs
```

It scans every `.scss` file under `src/` for a hard-coded spacing or type literal — a
`padding`/`margin`/`gap`/inset/`font-size` value with a `px`/`rem`/`em` unit, a bare numeric
`font-weight`/`line-height`, or a `font-family` other than `var(--w6w-font-sans)`,
`var(--w6w-font-mono)` or `inherit` — and compares the count per file against the ratchet baseline
in `scripts/lint-tokens.baseline.json`.

- **Exit 1, regression**: a new literal. Route it through a `--w6w-*` token, or, if it truly can't
  be, mark it with `/* lint-tokens-allow: <reason> */` on the same line or the line above.
- **Exit 2, stale baseline**: you removed literals. Regenerate and commit the smaller count:

  ```sh
  node scripts/lint-tokens.mjs --update
  git add scripts/lint-tokens.baseline.json
  ```

The baseline only ever shrinks. Known gap: the gate reads `.scss` only, so inline
`style={{ gap: 12 }}` literals in `.tsx` files aren't checked yet.

## Docs

`docs/` holds the user guide published at [docs.w6w.io](https://docs.w6w.io) under **UI**.
`docs/manifest.json` is the publish allow-list: a file that isn't listed there isn't public. Each
listed page starts with the docs site's frontmatter (`key` equal to the manifest `slug`, `title`
and `section` equal to the manifest entry) and links to other pages by site route (`/ui/theming/`),
not by repo path. Write for someone building with `@w6w/ui`; repo process belongs here or in the
README. When you change a component's props, update its page under `docs/components/`.

## Naming

- Components are `PascalCase`; hooks are `useCamelCase`; plain helper functions are `camelCase`.
- CSS custom properties stay under the `--w6w-*` namespace; public class names stay under `.w6w-*`
  (see the README's [Where the styles come from](README.md#where-the-styles-come-from) section).
- `W6W` in prose (docs, comments, commit messages); `w6w` in code, package names, and URLs.

## Sending a PR

1. Fork the repo and branch from `main`.
2. Make your change, keeping it focused.
3. Add or update a [`CHANGELOG.md`](CHANGELOG.md) entry under `## [Unreleased]`.
4. Open the PR against [`w6w-io/w6w-ui`](https://github.com/w6w-io/w6w-ui), not your fork.

## Reporting a security issue

Don't open a public issue for a vulnerability — see [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
