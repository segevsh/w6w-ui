import type { KeyboardEvent, KeyboardEventHandler } from "react";

/**
 * HTML `<input>` types that are either a multi-line control (none are — that's
 * `<textarea>`) or not a plain single-line text control: a checkbox/radio has
 * no text to "submit", and a native picker (date, color, range, file, …) has
 * its own Enter semantics this hook must not override.
 */
const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "file",
  "range",
  "color",
  "image",
  "hidden",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
]);

/**
 * Whether `target` is (or sits inside) a `contenteditable` region — checked
 * via the attribute chain rather than the `isContentEditable` DOM property,
 * which some environments (including this package's own jsdom-based unit
 * suite) never compute; the attribute is what both a real browser and jsdom
 * actually see once React renders `contentEditable`.
 */
function isWithinContentEditable(target: HTMLElement): boolean {
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

/**
 * Enter-to-submit for a single-line text input, one implementation mounted by
 * every form instead of each surface hand-rolling its own `onKeyDown` — see
 * `studio/src/components/ApiServerSetting.tsx:75-80` for the ad-hoc version
 * this replaces (a bare `if (e.key === "Enter")` with no modifier guard and no
 * check that the target is actually a single-line text field). Spread the
 * returned object onto the input: `<input {...useEnterSubmit(save)} … />`.
 *
 * Deliberately narrow: fires only for a bare `Enter` (no Shift/Alt/Ctrl/Meta,
 * and not mid-IME-composition) on an `<input>` whose `type` is a plain
 * single-line text control — never a `<textarea>`, a `contenteditable` node,
 * or a non-text `<input>` (checkbox, date picker, …), each of which has its
 * own meaning for Enter (a newline, a native widget's own key handling) that
 * this hook must not steal. `opts.enabled` is a hard off switch: pass the same
 * boolean guarding the caller's own submit button so Enter can never do
 * something the button itself refuses to do.
 */
export function useEnterSubmit(
  onSubmit: () => void,
  opts?: { enabled?: boolean },
): { onKeyDown: KeyboardEventHandler<HTMLElement> } {
  return {
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (opts?.enabled === false) return;
      if (e.key !== "Enter") return;
      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.nativeEvent.isComposing) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA") return;
      if (isWithinContentEditable(target)) return;
      if (
        target.tagName === "INPUT" &&
        NON_TEXT_INPUT_TYPES.has((target as HTMLInputElement).type)
      ) {
        return;
      }
      e.preventDefault();
      onSubmit();
    },
  };
}
