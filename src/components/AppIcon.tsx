import { useEffectiveTheme } from "../theme.ts";
import type { ThemeMode } from "../types.ts";

interface Props {
  /** Data URI or absolute URL for the light-mode icon. Falsy → render an initials tile. */
  src?: string;
  /** Optional dark-mode variant; used when `theme === "dark"`. */
  srcDark?: string;
  /** Background color when falling back to the initials tile. */
  brandColor?: string;
  /** Display name used to produce initials when there's no image. */
  name?: string;
  /** Square px size. Defaults to 32. */
  size?: number;
  /**
   * Explicit theme. If omitted, reads `data-theme` from `<html>` and falls
   * back to `prefers-color-scheme` — matches how most theme systems work.
   */
  theme?: ThemeMode;
}

/**
 * Renders an app's icon. Prefers the inlined SVG served by the w6w server;
 * falls back to a small initials tile when no icon is provided or when both
 * light and dark variants are missing.
 */
export function AppIcon({ src, srcDark, brandColor, name, size = 32, theme }: Props) {
  const effective = useEffectiveTheme(theme);
  const displaySrc = effective === "dark" ? (srcDark ?? src) : src;

  if (displaySrc) {
    return (
      <img
        src={displaySrc}
        width={size}
        height={size}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          flexShrink: 0,
          // `contain` (not `cover`) keeps the whole glyph visible; the padding +
          // border-box give it a consistent inset so square/edge-to-edge icons
          // stop clipping the rounded frame.
          objectFit: "contain",
          padding: Math.max(2, Math.round(size * 0.12)),
          boxSizing: "border-box",
          background: brandColor ?? "var(--w6w-icon-swatch, var(--w6w-panel-2))",
        }}
      />
    );
  }

  const initials = (name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 6,
        background: brandColor ?? "var(--w6w-accent)",
        color: "#fff",
        fontWeight: 700,
        fontSize: Math.round(size * 0.42),
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}
