# Changelog

All notable changes to `@w6w/ui` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Releases are
tagged `vX.Y.Z` and published to npm by `.github/workflows/release.yml`; changes not yet released
accumulate under `[Unreleased]`. Entries below `[0.1.0]` predate the first npm release — see the
repo's git history for exact dates and commits.

## [Unreleased]

## [0.1.1]

- `styles.css` now carries React Flow's base rules (`.react-flow{`, handles, controls), so
  `WorkflowFlowEditor` is styled with the one documented stylesheet import. `styles.scss` stays
  self-contained: Sass consumers add `@xyflow/react/dist/style.css` themselves.
- The `dist` entry files (`index`, `flow`, `code`; `.mjs` and `.cjs`) start with `"use client";`, so a
  Next.js App Router server page can import `@w6w/ui` without a consumer-side wrapper module.
- `color-scheme` is no longer declared on `:root` or `[data-theme]`, so importing `styles.css` leaves
  the host `<html>` element's computed `color-scheme` untouched (it used to force `light`/`dark` on
  the whole host document). Each token block now also sets an inherited `--w6w-scheme`
  property, and only elements whose class list has a token starting `w6w-` declare
  `color-scheme: var(--w6w-scheme)`; host elements are never matched. It follows the OS and
  `data-theme` on any ancestor, `<html>` included, and the nearest themed ancestor wins when themes nest. A host that
  relied on ui setting the page's scheme must now set `color-scheme` itself.
- `test/pack-smoke` grows a Vite consumer and a Next.js 16 consumer (turbopack and webpack) that
  assert the React Flow rules and the `"use client"` banner in the packed tarball.
- Added `test/host-isolation` (`pnpm test:host-isolation`, `HOST_BROWSER=1` to use a host Chromium): a
  real-browser rig asserting the host `<html>` `color-scheme` is untouched and component roots are
  still themed, including nested light-in-dark / dark-in-light themes.

## [0.1.0]

First npm release (`npm install @w6w/ui`).

- `@w6w/expr` is now a regular npm dependency (`^0.1.0`) instead of the
  `github:w6w-io/w6w-core#path:packages/expr` git spec, and is external to the build: the dist
  chunks `import`/`require` it rather than bundling it.
- Fixed the published manifest: the packed tarball's `main`/`module`/`types` and `exports` point at
  `./dist/*` (packed with `pnpm pack`, which applies `publishConfig`), and the tarball ships only
  `dist/`, the stylesheet exports, `LICENSE`, `README.md` and `CHANGELOG.md` — no tests, stories,
  test loader or `.d.ts` for tests. `scripts/assert-packed-manifest.mjs` and
  `test/pack-smoke/run.sh` (a clean-consumer `tsc` + `vite build`) gate it.
- Inside this repo `@w6w/expr` resolves to the sibling core checkout's source through the
  `w6w-source` export condition (tsconfig `customConditions`, Vite/Storybook `resolve.conditions`,
  `node --conditions`, the `test/` rigs' esbuild), so no expr `dist/` has to be built first.

### Earlier unreleased changes, shipped in 0.1.0

- The expression editor's rail toggle for a source's child fields (a step's output fields, a
  document's keys) now reads "N fields ›" instead of a bare 20px chevron, which went unnoticed
  beside the source chip. On a step with fields, the `▸` arrow moved out of the chip into its own
  caret that expands the fields; it used to insert the whole output instead.
- The expression editor's **Workflow state** rail now offers an upstream app step's output
  fields without a test run: the action's declared `output` (dot keys become nested paths such as
  `steps.<id>.output.start.utc`), else its `sample`, else the step's last test output. A step with
  none of these shows "Run a test of this step to see its fields".
- Rewrote the user guide in `docs/` for docs.w6w.io (section `ui`): an overview, theming, the
  design system, and a components reference with one page per group. Corrected `README.md`: MIT
  license, provider-based usage, all 42 components, current stylesheet sizes and bundler notes.
  Moved the token-gate rules for contributors into `CONTRIBUTING.md`.
- Added a branded `.storybook/manager.ts` theme.
- Added `*.stories.tsx` coverage for every exported component, and a `pnpm coverage:stories` check
  that keeps it that way.
- Rewrote `README.md` for an outside reader: install/consume without npm, a full component list,
  palette ancestry, and credits.
- Added `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue templates, and a PR template.
- Completed `package.json` metadata (`homepage`, `author`, `keywords`, `description`).
