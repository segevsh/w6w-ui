import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

/**
 * Library-mode build. Produces `dist/index.mjs` + `dist/index.cjs` + `.d.ts`
 * files. React / react-dom are external — the consumer brings its own copy.
 *
 * For local development (studio consuming `@w6w/ui` via `file:../ui`), Vite in
 * the consumer transpiles the TS sources directly — the build step is only
 * needed for npm publishing.
 */
export default defineConfig({
  plugins: [react(), dts({ include: ["src"], insertTypesEntry: true })],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "W6wUi",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "mjs" : "cjs"}`,
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: { globals: { react: "React", "react-dom": "ReactDOM" } },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
