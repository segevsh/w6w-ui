import type { ReactNode } from "react";

export interface ListItemProps {
  /** Primary label — prominent, single-line with ellipsis overflow. */
  title: ReactNode;
  /** Secondary label under the title — muted, small, truncates. */
  subtitle?: ReactNode;
  /** Leading slot (e.g. an `<AppIcon />` or status glyph). */
  icon?: ReactNode;
  /** Trailing slot pushed to the right (e.g. a badge or chevron). */
  trailing?: ReactNode;
  /** Highlights the row as selected/current. Reflected as `aria-pressed` when clickable. */
  active?: boolean;
  /** When provided, the row renders as a focusable, keyboard-activatable button. */
  onClick?: () => void;
  /** Accessible label for the clickable row (falls back to the `title` DOM text). */
  ariaLabel?: string;
}

/**
 * A clean, reusable list row: leading icon · title over subtitle · trailing slot.
 *
 * Mirrors the look/behaviour of the saved-test button rows it replaces. When
 * `onClick` is given it renders a `<button type="button">` (focusable, Enter/Space
 * activatable) with `aria-pressed={active}`; otherwise a plain, non-interactive row.
 */
export function ListItem({
  title,
  subtitle,
  icon,
  trailing,
  active = false,
  onClick,
  ariaLabel,
}: ListItemProps) {
  const body = (
    <>
      {icon != null && <span className="w6w-list-item-icon">{icon}</span>}
      <span className="w6w-list-item-body">
        <span className="w6w-list-item-title">{title}</span>
        {subtitle != null && <span className="w6w-list-item-subtitle">{subtitle}</span>}
      </span>
      {trailing != null && <span className="w6w-list-item-trailing">{trailing}</span>}
    </>
  );

  const className = `w6w-list-item${active ? " active" : ""}`;

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        aria-pressed={active}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={className} aria-label={ariaLabel}>
      {body}
    </div>
  );
}
