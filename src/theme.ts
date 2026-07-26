import { useEffect, useState } from "react";
import type { ThemeMode } from "./types.ts";

/**
 * Resolve the effective light/dark mode. Priority: explicit prop >
 * `data-theme` on <html> > `prefers-color-scheme`. This is the SAME precedence
 * the CSS defaults in `styles.css` use, so components and stylesheet always
 * agree.
 */
export function detectTheme(explicit: ThemeMode | undefined): ThemeMode {
  if (explicit) return explicit;
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Reactive `detectTheme`: subscribes to `data-theme` mutations on <html> and OS
 * `prefers-color-scheme` changes, so a runtime theme toggle (e.g. studio's
 * ThemeToggle) is reflected without a remount. Shared by every ui component that
 * needs the mode in JS (AppIcon, CodeEditor, JsonEditor) so they never drift.
 */
export function useEffectiveTheme(explicit?: ThemeMode): ThemeMode {
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

    // Re-sync once in case the attribute changed between the initial render and
    // this effect running.
    update();

    return () => {
      mql.removeEventListener("change", update);
      observer.disconnect();
    };
  }, [explicit]);

  return mode;
}
