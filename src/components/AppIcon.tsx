import { useEffect, useState } from "react";
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
          objectFit: "cover",
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

/**
 * Resolves the effective theme. Priority: explicit prop > `data-theme` on
 * <html> > `prefers-color-scheme`. Subscribes to changes so a runtime theme
 * toggle (e.g. studio's ThemeToggle) is reflected without a remount.
 */
function useEffectiveTheme(explicit?: ThemeMode): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>(() => detectTheme(explicit));

  useEffect(() => {
    if (explicit) {
      setMode(explicit);
      return;
    }
    if (typeof window === "undefined") return;

    const update = () => setMode(detectTheme(undefined));

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", update);

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      mql.removeEventListener("change", update);
      observer.disconnect();
    };
  }, [explicit]);

  return mode;
}

function detectTheme(explicit: ThemeMode | undefined): ThemeMode {
  if (explicit) return explicit;
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
