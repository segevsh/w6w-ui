import type { SVGProps } from "react";
import { type IconName, type IconVariant, icons } from "./icons.tsx";

export interface IconProps {
  /** Which glyph. Required — this component carries no default icon. */
  name: IconName;
  /** Rendered width AND height, in px. Default 16, the size every rail glyph and
   *  icon button in the tree already draws at. */
  size?: number;
  /**
   * Accessible name. Omit it for the common case — a decorative glyph inside a
   * button that already has one — and the `<svg>` is `aria-hidden`; pass it and
   * the glyph becomes `role="img"` with that `aria-label`, for an icon standing
   * alone as content.
   */
  label?: string;
  /** Merged with `w6w-icon`. */
  className?: string;
}

/** The root attributes that carry the glyph's PAINT, per `icons.tsx`'s variant:
 *  a stored entry decides how it is drawn, this only spells that out. */
function paintProps(icon: {
  variant: IconVariant;
  strokeWidth?: number;
}): SVGProps<SVGSVGElement> {
  if (icon.variant === "fill") return { fill: "currentColor" };
  if (icon.variant === "stroke") {
    return {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: icon.strokeWidth ?? 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };
  }
  // `mixed`: the glyph's own elements carry the paint (see `IconVariant`), so the
  // root must add none — a root `stroke` would thicken the language marks' dots.
  return {};
}

/**
 * One glyph from the shared set (`./icons.tsx`), sized by prop and coloured by
 * `currentColor` — so a caller colours it with `color` on any ancestor, and it
 * inherits hover/disabled/theme states for free.
 *
 * Accessibility is a two-way switch, never an absent middle: with no `label` the
 * glyph is decorative (`aria-hidden`, `focusable="false"`) for the common case
 * inside an already-labelled button; with a `label` it is `role="img"` with that
 * name. There is no third state, because an unlabelled `<svg>` that is not
 * hidden is exactly the noise a screen reader announces as "graphic".
 *
 * The four ARIA attributes are written out as plain expressions rather than
 * spread from a conditional object: `biome check`'s `a11y/noSvgWithoutTitle`
 * reads the JSX attributes it can see, and a spread hides them (measured —
 * "Alternative text title element cannot be empty" on the spread form only).
 */
export function Icon(props: IconProps) {
  const { name, size = 16, label, className } = props;
  const icon = icons[name];
  const labelled = Boolean(label);
  return (
    <svg
      className={["w6w-icon", className ?? ""].filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox={icon.viewBox}
      {...paintProps(icon)}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : "true"}
      focusable={labelled ? undefined : "false"}
    >
      {icon.body}
    </svg>
  );
}
