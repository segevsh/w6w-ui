// copyable browser-gate harness entry. Mounts the REAL Copyable / CodeBlock
// (compiled from the source tree under test) into a real Chromium page — no
// jsdom (it performs no layout and no Clipboard API at all). Copied into
// `<tree>/src/__copyable_entry.tsx` and bundled with packages/ui's own
// esbuild by run.sh; the relative imports below therefore resolve against the
// tree under test ($UI_SRC), so a mutated copy of `src` changes what this
// renders.
import { createRoot } from "react-dom/client";
import { CodeBlock } from "./CodeBlock.tsx";
import { Copyable } from "./components/Copyable.tsx";

// Multi-line, so C7's "byte for byte, newlines included" assertion is
// non-vacuous — a single-line snippet would pass even if a `\n` got dropped.
export const SNIPPET = "line one\nline two\nline three";

// C8/C9's block. Ten lines so the gutter reaches TWO digits — a one-digit
// gutter would let C9 pass on a selection that dropped only the wider rows,
// and the `10` is the row most likely to leak into a drag.
export const NUMBERED = Array.from({ length: 10 }, (_, i) => `const value${i + 1} = ${i + 1};`).join(
  "\n",
);

function App() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24, width: 480 }}>
      {/* c1 — read-only single-line input. Geometry (C1), click-to-copy on
          the input itself (C4). Wrapped in `.w6w-field` so the compound
          leak-defence selector (`.w6w-field .w6w-copyable input[...]`) is the
          one actually exercised, matching real usage (ParamsForm). */}
      <div className="w6w-field">
        <Copyable value="the-input-value" readOnly className="c1">
          <input id="c1-input" type="text" readOnly defaultValue="the-input-value" />
        </Copyable>
      </div>

      {/* c2 — read-only textarea. Geometry (C2: button top in upper half)
          and the leak defence itself (C3: computed min-height/margin, with
          studio.css layered after this stylesheet). */}
      <div className="w6w-field">
        <Copyable value="the-textarea-value" readOnly className="c2">
          <textarea id="c2-textarea" readOnly defaultValue="the-textarea-value" rows={4} />
        </Copyable>
      </div>

      {/* c5 — editable (default, non-readOnly) input: a box click must NOT
          copy; only the icon does. */}
      <div className="w6w-field">
        <Copyable value="the-editable-value" className="c5">
          <input id="c5-input" type="text" defaultValue="the-editable-value" onChange={() => {}} />
        </Copyable>
      </div>

      {/* c7 — `<CodeBlock copyable>`: exactly one button inside the code
          box, and the selection guard (C6) has real, Range-selectable DOM
          text to exercise (an <input>'s internal selection is not visible to
          `window.getSelection()`, so only a `<pre>` proves that guard). */}
      <div id="c7">
        <CodeBlock code={SNIPPET} language="plaintext" copyable />
      </div>

      {/* c8 — the button OVERLAYS the code box's top-right corner. Needs a
          block wide enough that "right half" is a real distinction and tall
          enough that "top third" is, hence the longer snippet. `copyable` is
          left to DEFAULT here on purpose: C8 is also what fails if the
          default ever silently flips back to off. */}
      <div id="c8">
        <CodeBlock code={NUMBERED} language="plaintext" />
      </div>

      {/* c9 — line-number gutter vs a real mouse selection. `user-select:
          none` is a computed-style property jsdom does not implement and does
          not honour in layout, so only a real engine can prove the digits stay
          out of `window.getSelection().toString()`. */}
      <div id="c9">
        <CodeBlock code={NUMBERED} language="plaintext" showLineNumbers />
      </div>
    </div>
  );
}

const mount = document.getElementById("root");
if (!mount) throw new Error("no #root to mount into");
createRoot(mount).render(<App />);
(window as unknown as { __mounted: boolean }).__mounted = true;
(window as unknown as { __SNIPPET: string }).__SNIPPET = SNIPPET;
(window as unknown as { __NUMBERED: string }).__NUMBERED = NUMBERED;
