// expr-template browser-gate harness entry. Mounts the REAL
// ExpressionEditorModal (compiled from the source tree under test) into a real
// Chromium page — no jsdom, no @w6w/ui substitute to fake. Copied into
// `<tree>/src/__expr_template_entry.tsx` and bundled with packages/ui's own
// esbuild by run.sh; the relative import below therefore resolves against the
// tree under test ($UI_SRC), so a mutated copy of `src` changes what this
// renders.
import { createRoot } from "react-dom/client";
import type { ExprValue } from "./types.ts";
import { ExpressionEditorModal } from "./components/ExpressionEditorModal.tsx";

const params = new URLSearchParams(location.search);
// `empty` — an empty single-line field, for the typing-order guard (G-typing).
// `render` — a var chip AND a render chip already present, for the
// sigil-distinction guard (G-sigil) and the disabled-toggle guard.
const v = params.get("v") || "empty";

const VALUES: Record<string, string | ExprValue> = {
  empty: "",
  render: {
    type: "expr",
    parts: [
      { kind: "var", ref: "vars.a" },
      { kind: "render", ref: "vars.b" },
    ],
  },
};

const mount = document.getElementById("root");
if (!mount) throw new Error("no #root to mount into");
createRoot(mount).render(
  <ExpressionEditorModal
    value={VALUES[v]}
    options={{ vars: ["a", "b"], secrets: [] }}
    onSave={() => {}}
    onClose={() => {}}
  />,
);
(window as unknown as { __mounted: boolean }).__mounted = true;
