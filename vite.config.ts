import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

/**
 * Library-mode build. Produces `dist/index.mjs` (base) and `dist/flow.mjs`
 * (the visual workflow editor) as separate entrypoints so consumers who only
 * use the base surface don't pull in @xyflow/react. `.cjs` mirrors + `.d.ts`
 * files are emitted alongside.
 *
 * For local development (studio consuming `@w6w/ui` via `link:../ui`), Vite in
 * the consumer transpiles the TS sources directly — the build step is only
 * needed for npm publishing.
 */
export default defineConfig({
  plugins: [react(), dts({ include: ["src"], insertTypesEntry: true })],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        flow: resolve(__dirname, "src/flow.ts"),
      },
      formats: ["es", "cjs"],
      fileName: (format, name) => `${name}.${format === "es" ? "mjs" : "cjs"}`,
    },
    rollupOptions: {
      // Peer deps + heavy optional deps are external so consumers control the
      // versions and bundling of each. @xyflow/react is external so it doesn't
      // duplicate when consumers use it directly elsewhere.
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "@xyflow/react",
        /^@codemirror\//,
        "@uiw/react-codemirror",
      ],
      output: { globals: { react: "React", "react-dom": "ReactDOM" } },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
