# Changelog

All notable changes to `@w6w/ui` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This package is
not published to npm and carries no release tags, so entries below accumulate under
`[Unreleased]` rather than versioned sections — see the repo's git history for exact dates and
commits.

## [Unreleased]

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
