/**
 * `@w6w/ui/code` — the read-only code block, on its own.
 *
 * The third entrypoint, for the same reason `./flow` is the second: importing
 * the root `index.ts` pulls that module's WHOLE graph, and a bundler resolves
 * imports before it tree-shakes, so "we only use one component" does not save
 * the consumer anything. From `index.ts` that graph reaches:
 *
 *   - `@w6w/expr` — a `link:../core/packages/expr` devDependency, i.e. a
 *     SECOND sibling checkout (`packages/core`, itself a submodule). A consumer
 *     that has this package but not that one fails to build, with an
 *     unresolved-import error naming a package it never asked for. Measured,
 *     not theorised: it is what broke the frontend site's first build.
 *   - `@uiw/react-codemirror` + `@codemirror/*` — the editors, which are far
 *     heavier than the thing being imported.
 *
 * Nothing here reaches either. `CodeBlock` imports `prism-react-renderer` and
 * `Copyable`; `Copyable` imports React and nothing else.
 *
 * The matching stylesheet is `@w6w/ui/code.css` (13 KB) — `@w6w/ui/styles.css`
 * also contains these rules, so a host already importing the full sheet needs
 * no second import.
 */
export { CodeBlock } from "./CodeBlock.tsx";
export type { CodeBlockProps, CodeLanguage } from "./CodeBlock.tsx";
export { Copyable } from "./components/Copyable.tsx";
export type { CopyableProps } from "./components/Copyable.tsx";
