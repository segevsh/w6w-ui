import type { Decorator, Preview } from "@storybook/react-vite";

/**
 * The AUTHORED stylesheet, not the compiled `src/styles.css` the package
 * exports. Both produce the same rules (`pnpm check:css` fails if they have
 * drifted), but importing the Sass means editing a partial under `src/styles/`
 * hot-reloads the canvas — with the .css you would have to re-run
 * `pnpm build:css` to see a token change.
 */
import "../src/styles.scss";

/**
 * Force a theme rather than following the OS.
 *
 * Every `--w6w-*` default is declared on `:where(:root)` with a
 * `prefers-color-scheme` override, and `:where([data-theme="light"|"dark"])`
 * beats both — on ANY ancestor, which is why a wrapper element is enough and
 * nothing has to be written to `<html>`. `data-theme` is also the exact signal
 * the JS components read (explicit prop > data-theme > OS pref), so a story
 * that switches this is exercising the real theming contract, not a Storybook
 * approximation.
 */
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme === "dark" ? "dark" : "light";
  return (
    <div
      data-theme={theme}
      style={{
        background: "var(--w6w-bg)",
        color: "var(--w6w-text)",
        // The canvas is the component's page here — pad it away from the
        // iframe edge so a block's border is visible on all four sides.
        padding: "16px",
        minHeight: "100vh",
      }}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  initialGlobals: { theme: "light" },
  globalTypes: {
    theme: {
      description: "w6w theme (sets data-theme on the canvas wrapper)",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", icon: "sun", title: "Light" },
          { value: "dark", icon: "moon", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    controls: { matchers: { color: /(background|color)$/i } },
    // The wrapper decorator paints `--w6w-bg`; Storybook's own backgrounds
    // addon would sit behind it and only ever show at the padding, reading as
    // a stray border. One source of truth for the canvas colour.
    backgrounds: { disable: true },
  },
};

export default preview;
