import { useEffect, useState } from "react";
import { AppIcon } from "./components/AppIcon.tsx";
import { useW6wApi } from "./provider.tsx";
import type { AppSummary, ThemeMode } from "./types.ts";

export interface AppPickerProps {
  /** Fired when the user picks an app card. */
  onSelectApp: (app: AppSummary) => void;
  theme?: ThemeMode;
  /** Optional pre-filter over the app list (e.g. only connectable apps). */
  filter?: (app: AppSummary) => boolean;
  /** Search-box placeholder. Defaults to "Search apps…". */
  searchPlaceholder?: string;
  /** Message shown when the (filtered) app list is empty. */
  emptyMessage?: string;
}

/**
 * Searchable grid of app cards (icon + name + id) — the shared app picker used
 * by both the step builder and the add-connection modal. Fetches the app list
 * from `useW6wApi()`; filters alphabetically by name/id as the user types.
 */
export function AppPicker({
  onSelectApp,
  theme,
  filter,
  searchPlaceholder,
  emptyMessage,
}: AppPickerProps) {
  const api = useW6wApi();
  const [apps, setApps] = useState<AppSummary[] | null>(null);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let canceled = false;
    api
      .listApps()
      .then((r) => !canceled && setApps(r))
      .catch((e) => !canceled && setAppsError((e as Error).message));
    return () => {
      canceled = true;
    };
  }, [api]);

  if (appsError) return <div className="w6w-result w6w-error">{appsError}</div>;
  if (apps === null) return <p className="w6w-muted w6w-small">Loading apps…</p>;

  const base = filter ? apps.filter(filter) : apps;
  if (base.length === 0) {
    return (
      <p className="w6w-muted w6w-small">
        {emptyMessage ?? "No apps registered yet. Register one from the Apps page first."}
      </p>
    );
  }

  // Alphabetical by display name, then filtered by the search box (name or id).
  const q = query.trim().toLowerCase();
  const sorted = [...base].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );
  const visible = q
    ? sorted.filter(
        (a) => a.displayName.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
      )
    : sorted;

  return (
    <div className="w6w-stepbuilder-apps">
      <input
        type="text"
        className="w6w-stepbuilder-search"
        placeholder={searchPlaceholder ?? "Search apps…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search apps"
      />
      {visible.length === 0 ? (
        <p className="w6w-muted w6w-small">No apps match “{query}”.</p>
      ) : (
        <div className="w6w-stepbuilder-list w6w-stepbuilder-scroll">
          {visible.map((a) => (
            <button
              key={a.id}
              type="button"
              className="w6w-stepbuilder-item"
              onClick={() => onSelectApp(a)}
            >
              <AppIcon
                src={a.iconSvg}
                srcDark={a.iconSvgDark}
                brandColor={a.brandColor}
                name={a.displayName}
                theme={theme}
                size={24}
              />
              <span className="w6w-stepbuilder-item-main">
                <strong>{a.displayName}</strong>
                <code className="w6w-muted w6w-small">{a.id}</code>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
