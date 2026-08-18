import type { ReactNode } from "react";

export interface IconButtonProps {
  /** Accessible name — rendered as BOTH `title` and `aria-label`. Required: an
   *  icon-only button with no name has no safe default (unlike `Copyable`'s
   *  `label`, which is always "Copy"). */
  label: string;
  /** The glyph. */
  children: ReactNode;
  /** Required — an icon-only button that can't fire has no reason to exist. */
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  /** Caller opts into danger styling; `IconButton` itself has no "delete" concept. */
  danger?: boolean;
  "data-testid"?: string;
}

/**
 * The primitive icon-only button: a caller-supplied glyph, a required
 * accessible name, native `disabled`, and a merged `className`.
 *
 * `EditButton`/`DeleteButton` build on this and bundle one canonical glyph
 * each — this component itself carries no glyph and no "edit"/"delete"
 * meaning, only the `danger` styling hook.
 */
export function IconButton(props: IconButtonProps) {
  const { label, children, onClick, disabled, className, danger, ...rest } = props;
  return (
    <button
      type="button"
      className={["w6w-icon-button", danger ? "w6w-icon-button-danger" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={rest["data-testid"]}
    >
      {children}
    </button>
  );
}
