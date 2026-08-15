import { defineConfig } from "vite";

/**
 * The Vite config Storybook builds against — intentionally empty.
 *
 * `@storybook/react-vite` already supplies `@vitejs/plugin-react` and the
 * JSX/TS handling the stories need, and Sass is resolved by Vite natively
 * (`sass` is a devDependency), so nothing has to be configured here. The file
 * exists purely so Storybook does NOT fall back to the repo-root
 * `vite.config.ts`, which describes the npm library build and is wrong for a
 * dev server (see `.storybook/main.ts`).
 */
export default defineConfig({});
