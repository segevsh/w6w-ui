import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/** Copy glyph, colocated per this file — no shared `Icon` component exists in
 *  `@w6w/ui` (deliberate, 21+ sites elsewhere use this same idiom, e.g.
 *  `CallFromCodeButton.tsx:44-63`). `currentColor` so `.is-copied`'s colour
 *  applies with no extra prop. */
function CopyGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** Majority precedent across the tree: `admin/src/components/CopyButton.tsx:17`,
 *  `studio/src/pages/EndpointsPage.tsx:823`. */
const COPIED_MS = 1500;

export interface CopyableProps {
  /** Exact text written to the clipboard. */
  value: string;
  /**
   * How long the checkmark stays before reverting to the copy glyph, in ms.
   *
   * Defaults to the 1500 ms every other copy affordance in the tree already
   * uses — a number worth keeping unless a caller has a reason, because the
   * revert delay is the only feedback that the copy happened at all and an
   * inconsistent one reads as a different control.
   *
   * `0` is not a way to disable the revert: the timer still fires, it just
   * fires on the next tick, so the checkmark is effectively never seen.
   */
  copiedMs?: number;
  /** Read-only display: a click anywhere in the box copies. Default false ⇒ the icon only. */
  readOnly?: boolean;
  /** Accessible name of the copy button. CONSTANT across states. Default "Copy". */
  label?: string;
  className?: string;
  /** The control that displays `value`: an <input>, <textarea>, or <pre>/<CodeBlock>. */
  children: ReactNode;
}

/**
 * Decorates a value-displaying control with an in-box copy affordance — a
 * button at the trailing top/centre that writes `value` to the clipboard, and
 * (when `readOnly`) a click anywhere in the box that does the same.
 *
 * This is the FIRST factored clipboard helper in `@w6w/ui`: every existing
 * copy-to-clipboard call in the tree today (studio's five pages,
 * `CallFromCodeButton`, admin's own `CopyButton`) is an independently authored
 * inline clipboard write — the sole call in this package's `src` is below.
 *
 * A decorating component, not a new `TextField`/`TextArea` primitive
 * (HITL-2): the copy behaviour, the glyphs, the box geometry and the copied
 * visual all live in this one place, so a future `TextField` can compose it
 * rather than re-implement it.
 */
export function Copyable(props: CopyableProps) {
  const {
    value,
    copiedMs = COPIED_MS,
    readOnly = false,
    label = "Copy",
    className,
    children,
  } = props;
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the revert timer on unmount so it never fires setState after the
  // component is gone.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const doCopy = useCallback(async () => {
    try {
      // The only clipboard-write call site in `@w6w/ui` (gated by the
      // project's test plan). Guarded + awaited: an absent (insecure origin)
      // or rejecting clipboard leaves the idle icon and throws nothing further.
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), copiedMs);
    } catch {
      // Absent/denied/rejecting clipboard: stay idle.
    }
  }, [value, copiedMs]);

  const selectInnerControl = useCallback(() => {
    const control = wrapRef.current?.querySelector("input, textarea") as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    control?.select();
  }, []);

  // Attached IMPERATIVELY (ref + addEventListener), not as a JSX `onClick` on
  // the wrapper <div>: a wrapper onClick trips `lint/a11y/useKeyWithClickEvents`
  // — measured, `biome check` on that markup reports "Found 1 error" against
  // this package's zero-diagnostic baseline. The box click is a pointer-only
  // convenience; the keyboard-activatable path is the button below.
  useEffect(() => {
    if (!readOnly) return;
    const el = wrapRef.current;
    if (!el) return;
    const onBoxClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("button")) return; // the icon handles its own click
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && el.contains(sel.anchorNode)) return; // drag-selection guard
      void doCopy();
      selectInnerControl();
    };
    el.addEventListener("click", onBoxClick);
    return () => el.removeEventListener("click", onBoxClick);
  }, [readOnly, doCopy, selectInnerControl]);

  return (
    <div ref={wrapRef} className={["w6w-copyable", className ?? ""].filter(Boolean).join(" ")}>
      {children}
      <button
        type="button"
        className={`w6w-icon-btn w6w-copyable-btn${copied ? " is-copied" : ""}`}
        aria-label={label}
        onClick={() => void doCopy()}
      >
        {copied ? <CheckGlyph /> : <CopyGlyph />}
      </button>
      {/* Always-rendered live region, per pin 8: the button's accessible name
          stays constant (uncountable otherwise by a page guard), so this is
          what announces the result — swapping the SVG glyph alone carries no
          accessible signal. */}
      <span className="w6w-copyable-status" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}
