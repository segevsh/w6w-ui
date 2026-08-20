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
// `templateVar` — a single legal var chip (no render part). The chip-ify
// commit's seed scenario (T1.2.2).
// `inline` — mounts the REAL inline `ExpressionInput`, not the modal, for
// (R4)'s absence count: F-2 was the toggle leaking into this exact component.
// `inlineTyped` — mounts the REAL inline `ExpressionInput` on the PLAIN
// STRING `"{{ vars.a }}"` (not an `ExprValue`), no typing and no blur — T1.2.2
// acceptance 4's durable-location proof: this must chip through
// `valueToParts` at mount, or the fix is in the wrong place.
// `inlineEmpty` — mounts the REAL inline `ExpressionInput`, empty (D-3,
// TA3): the more severe half — before this fix a plain inline field had NO
// promotion path at all. T-typed-inline and T-typed-second type into this.
// `dblChip` / `dblChipInline` — a var chip with surrounding TEXT on both
// sides, in the modal / the inline field respectively (D-3, TA3): the
// double-click-back-to-text fixture. Surrounding text lets a guard tell
// "converted in place" from "the chip vanished and the string collapsed".
// `addable` — the "+ Add" (T1.2.3) fixture: `createVar`/`createSecret` are
// bound, so the rail's "+ Add" controls render and the nested Add-value
// dialog is reachable. Both resolve immediately, recording their input on
// `window` and re-rendering the SAME mount (same `createRoot` root — the
// editor stays mounted across the flow, per the "stays-mounted" guard) with
// `options.vars`/`.secrets` grown by the new name, so the rail refresh a real
// host would get from a query invalidation is reproduced here too.
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
  dblChip: {
    type: "expr",
    parts: [
      { kind: "text", value: "HEAD " },
      { kind: "var", ref: "vars.a" },
      { kind: "text", value: " TAIL" },
    ],
  },
};

const mount = document.getElementById("root");
if (!mount) throw new Error("no #root to mount into");

// Every value Save/onSave is called with — asserted on directly, rather than
// re-reading the DOM, since the whole point of P4/Q1 is what gets WRITTEN.
(window as unknown as { __saves: unknown[] }).__saves = [];

// window.prompt/confirm/alert must never be reached by the "+ Add" flow
// (A9) — stubbed everywhere, not only for `v=addable`, so any OTHER scenario
// that accidentally reached one would also increment the counter.
(window as unknown as { __dialogCalls: number }).__dialogCalls = 0;
const bumpDialogCalls = () => {
  (window as unknown as { __dialogCalls: number }).__dialogCalls += 1;
};
window.prompt = ((..._args: unknown[]) => {
  bumpDialogCalls();
  return null;
}) as typeof window.prompt;
window.confirm = ((..._args: unknown[]) => {
  bumpDialogCalls();
  return false;
}) as typeof window.confirm;
window.alert = ((..._args: unknown[]) => {
  bumpDialogCalls();
}) as typeof window.alert;

if (v === "addable") {
  type AddInput = { name: string; value: string; description?: string };
  const w = window as unknown as {
    __createVarCalls: AddInput[];
    __createSecretCalls: AddInput[];
  };
  w.__createVarCalls = [];
  w.__createSecretCalls = [];

  // Local mutable rail state, grown in place as each stub "creates" a value —
  // mirrors the studio host's real refresh path (mutation resolves ->
  // invalidate -> the page's vars/secrets query refetches -> new
  // `options.vars`/`.secrets` -> re-render), without actually depending on
  // react-query or a server.
  let vars = ["a"];
  let secrets = ["s"];
  const root = createRoot(mount);
  const paint = () => {
    root.render(
      <ExpressionEditorModal
        value=""
        options={{
          vars,
          secrets,
          createVar: async (input) => {
            w.__createVarCalls.push(input);
            vars = [...vars, input.name];
            paint();
          },
          createSecret: async (input) => {
            w.__createSecretCalls.push(input);
            secrets = [...secrets, input.name];
            paint();
          },
        }}
        onSave={(next) => {
          (window as unknown as { __saves: unknown[] }).__saves.push(next);
        }}
        onClose={() => {}}
      />,
    );
  };
  paint();
} else if (v === "inline") {
  createRoot(mount).render(
    <ExpressionInput
      value={{ type: "expr", parts: [{ kind: "var", ref: "vars.a" }] }}
      options={{ vars: ["a"], secrets: [] }}
      onChange={() => {}}
      aria-label="inline expression"
    />,
  );
} else if (v === "inlineTyped") {
  createRoot(mount).render(
    <ExpressionInput
      value="{{ vars.a }}"
      options={{ vars: ["a"], secrets: [] }}
      onChange={() => {}}
      aria-label="inline expression"
    />,
  );
} else if (v === "inlineEmpty") {
  createRoot(mount).render(
    <ExpressionInput
      value=""
      options={{ vars: ["a", "b"], secrets: [] }}
      onChange={() => {}}
      aria-label="inline expression"
    />,
  );
} else if (v === "dblChipInline") {
  createRoot(mount).render(
    <ExpressionInput
      value={VALUES.dblChip}
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
