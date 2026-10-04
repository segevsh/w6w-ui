import { type ReactNode, forwardRef } from "react";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./icons.tsx";

export interface IconButtonProps {
  /** Accessible name — ALWAYS rendered as `aria-label`. Required: an icon-only
   *  button with no name has no safe default (unlike `Copyable`'s `label`,
   *  which is always "Copy"). */
  label: string;
  /** The glyph, as caller-supplied markup. Still the primary path — pass this
   *  or `icon` (both given ⇒ `children` wins). */
  children?: ReactNode;
  /** The glyph, by name from the shared set (`./icons.tsx`) — e.g. `"history"`.
   *  Renders `<Icon name={icon} size={iconSize ?? 16} />`, decorative, so this
   *  button's `label` stays the only thing announced. */
  icon?: IconName;
  /** Size handed to `Icon`. Default 16. No effect without `icon`. */
  iconSize?: number;
  /** Tooltip override. Defaults to `label`; `aria-label` is ALWAYS `label`, so
   *  the two may legitimately differ (see the docblock). */
  title?: string;
  /** Required — an icon-only button that can't fire has no reason to exist. */
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  /** Caller opts into danger styling; `IconButton` itself has no "delete" concept. */
  danger?: boolean;
  /** Passed straight through, for a toggle button. */
  "aria-pressed"?: boolean;
  /** Passed straight through, for a disclosure button. */
  "aria-expanded"?: boolean;
  "data-testid"?: string;
}

/**
 * The primitive icon-only button: a caller-supplied glyph, a required
 * accessible name, native `disabled`, and a merged `className`.
 *
 * `EditButton`/`DeleteButton` build on this and bundle one canonical glyph
 * each — this component itself carries no glyph and no "edit"/"delete"
 * meaning, only the `danger` styling hook.
 *
 * The glyph comes from one of two places. `children` is the original path and
 * still works unchanged; `icon` names one from the shared set (`./icons.tsx`)
 * and is rendered through `Icon`, so a caller no longer has to redraw (or
 * import) an SVG for a glyph the set already holds. Given both, `children`
 * wins — the named prop is the convenience, never a way to hide a caller's own
 * markup.
 *
 * `label` is always the accessible name, and `title` overrides ONLY the
 * tooltip. The two legitimately differ: studio's history button is named
 * "Execution history" while, with nothing executed yet, its tooltip reads "No
 * executions yet" — the tooltip says why the control is inert to a sighted
 * user, the name stays the action, and a screen reader must keep hearing the
 * latter.
 *
 * `ref` reaches the `<button>` itself (`forwardRef` — React 18, so the
 * ref-as-prop syntax is not available), which is what a caller needs to move
 * focus or measure the control.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(props, ref) {
    const {
      label,
      children,
      icon,
      iconSize,
      title,
      onClick,
      disabled,
      className,
      danger,
      ...rest
    } = props;
    const glyph = children ?? (icon ? <Icon name={icon} size={iconSize ?? 16} /> : null);
    return (
      <button
        ref={ref}
        type="button"
        className={["w6w-icon-button", danger ? "w6w-icon-button-danger" : "", className ?? ""]
          .filter(Boolean)
          .join(" ")}
        title={title ?? label}
        aria-label={label}
        aria-pressed={rest["aria-pressed"]}
        aria-expanded={rest["aria-expanded"]}
        disabled={disabled}
        onClick={onClick}
        data-testid={rest["data-testid"]}
      >
        {glyph}
      </button>
    );
  },
);

IconButton.displayName = "IconButton";
