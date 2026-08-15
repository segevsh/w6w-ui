import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

/**
 * Library-mode build. Produces `dist/index.mjs` (base), `dist/flow.mjs` (the
 * visual workflow editor) and `dist/code.mjs` (the read-only code block) as
 * separate entrypoints so a consumer who only uses one surface doesn't pull in
 * the others' dependencies — @xyflow/react for flow, CodeMirror and @w6w/expr
 * for the base index. `.cjs` mirrors + `.d.ts`
 * files are emitted alongside.
 *
 * For local development (studio consuming `@w6w/ui` via `link:../ui`), Vite in
 * the consumer transpiles the TS sources directly — the build step is only
 * needed for npm publishing.
 */
export default defineConfig({
  // Stories are excluded from the type emit: they live beside their component
  // (so they can't drift from it) but they are not part of the published
  // surface — `package.json`'s `files` drops them from the tarball too.
  plugins: [
    react(),
    dts({ include: ["src"], exclude: ["src/**/*.stories.tsx"], insertTypesEntry: true }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        flow: resolve(__dirname, "src/flow.ts"),
        code: resolve(__dirname, "src/code.ts"),
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
