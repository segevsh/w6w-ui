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
import { ExpressionInput } from "./components/ExpressionInput.tsx";

const params = new URLSearchParams(location.search);
// `empty` — an empty single-line field, for the typing-order guard (G-typing).
// `render` — a var chip AND a render chip already present, for the
// sigil-distinction guard (G-sigil), the disabled-toggle guard, and (R4) the
// modal-side `[data-render-toggle]` presence count.
// `templateVar` — a single legal var chip (no render part), for the round-2
// chips-pane-freeze guards (P4/P5/Q1 below `templateVar`'s value).
// `inline` — mounts the REAL inline `ExpressionInput`, not the modal, for
// (R4)'s absence count: F-2 was the toggle leaking into this exact component.
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
  templateVar: {
    type: "expr",
    parts: [{ kind: "var", ref: "vars.a" }],
  },
};

const mount = document.getElementById("root");
if (!mount) throw new Error("no #root to mount into");

// Every value Save/onSave is called with — asserted on directly, rather than
// re-reading the DOM, since the whole point of P4/Q1 is what gets WRITTEN.
(window as unknown as { __saves: unknown[] }).__saves = [];

if (v === "inline") {
  createRoot(mount).render(
    <ExpressionInput
      value={{ type: "expr", parts: [{ kind: "var", ref: "vars.a" }] }}
      options={{ vars: ["a"], secrets: [] }}
      onChange={() => {}}
      aria-label="inline expression"
    />,
  );
} else {
  createRoot(mount).render(
    <ExpressionEditorModal
      value={VALUES[v]}
      options={{ vars: ["a", "b"], secrets: [] }}
      onSave={(next) => {
        (window as unknown as { __saves: unknown[] }).__saves.push(next);
      }}
      onClose={() => {}}
    />,
  );
}
(window as unknown as { __mounted: boolean }).__mounted = true;
