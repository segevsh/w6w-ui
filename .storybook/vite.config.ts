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
 */
export default defineConfig({
  resolve: { conditions: ["w6w-source", ...defaultClientConditions] },
});
