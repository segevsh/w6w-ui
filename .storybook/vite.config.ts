import { fileURLToPath } from "node:url";
import { defaultClientConditions, defineConfig } from "vite";

/**
 * The Vite config Storybook builds against — intentionally minimal.
 *
 * `@storybook/react-vite` already supplies `@vitejs/plugin-react` and the
 * JSX/TS handling the stories need, and Sass is resolved by Vite natively
 * (`sass` is a devDependency), so nothing has to be configured here. The file
 * exists chiefly so Storybook does NOT fall back to the repo-root
 * `vite.config.ts`, which describes the npm library build and is wrong for a
 * dev server (see `.storybook/main.ts`).
 *
 * The one thing it does set is `resolve.conditions`: stories reach
 * `@w6w/expr` (via ExpressionEditorModal), which this repo resolves to the
 * sibling's source through the `w6w-source` export condition. Vite 6 REPLACES
 * the default conditions when set, hence the spread.
 *
 * It also aliases `@xyflow/react/dist/style` (the bare-specifier `@use` in
 * `src/styles.scss`) to the package's stylesheet by path: Vite's Sass importer
 * resolves a `@use` through the package `exports` map, which only lists
 * `./dist/style.css`, and throws before Sass's own `loadPaths` lookup (which is
 * what `scripts/build-css.mjs` relies on) is consulted.
 */
export default defineConfig({
  resolve: {
    conditions: ["w6w-source", ...defaultClientConditions],
    alias: [
      {
        find: /^@xyflow\/react\/dist\/style$/,
        replacement: fileURLToPath(
          new URL("../node_modules/@xyflow/react/dist/style.css", import.meta.url),
        ),
      },
    ],
  },
});
