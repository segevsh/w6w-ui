import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook for `@w6w/ui`.
 *
 * Deliberately empty of the scaffolding `storybook init` generates — there is no
 * `stories/` directory of Button/Header/Page examples, and no `assets/`. The
 * glob below only matches `*.stories.tsx` files that sit BESIDE the component
 * they document, so a story can never drift away from its source, and the only
 * things listed in the sidebar are real components of this library.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  addons: [],
  framework: {
    name: "@storybook/react-vite",
    options: {
      /**
       * The root `vite.config.ts` is a LIBRARY build (`build.lib` with two
       * entrypoints, plus `vite-plugin-dts`). Storybook auto-loads the nearest
       * Vite config and merges it, which would point the dev server at a
       * rollup lib build and emit `.d.ts` files on every storybook build.
       * Point it at a config of our own instead — see that file.
       */
      builder: { viteConfigPath: ".storybook/vite.config.ts" },
    },
  },
  core: { disableTelemetry: true },
};

export default config;
