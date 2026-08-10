import { type ReactNode, useEffect, useState } from "react";
import { AppIcon } from "./components/AppIcon.tsx";
import { isInternalApp } from "./flow-types.ts";
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
  /** Render the search input. Defaults to `true`; the connected-apps list opts out. */
  search?: boolean;
  /** Rendered beneath `emptyMessage` in the empty state (e.g. a "Browse all apps" button). */
  emptyAction?: ReactNode;
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
  search = true,
  emptyAction,
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

  // Single layout owner for all four exits below, so the panel never resizes
  // between error/loading/empty and the loaded list — see `.w6w-apppicker-host`.
  const host = (body: ReactNode) => <div className="w6w-apppicker-host">{body}</div>;

  if (appsError) return host(<div className="w6w-result w6w-error">{appsError}</div>);
  if (apps === null) return host(<p className="w6w-muted w6w-small">Loading apps…</p>);

  // Reserved `@w6w/*` pseudo-apps are added via the builder's "Controls" tab, not
  // as connectable apps — keep them out of this grid even after they register.
  const connectable = apps.filter((a) => !isInternalApp(a.id));
  const base = filter ? connectable.filter(filter) : connectable;
  if (base.length === 0) {
    return host(
      <div className="w6w-stack">
        <p className="w6w-muted w6w-small">
          {emptyMessage ?? "No apps registered yet. Register one from the Apps page first."}
        </p>
        {emptyAction}
      </div>,
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

  return host(
    <div className="w6w-stepbuilder-apps">
      {search && (
        <input
          type="text"
          className="w6w-stepbuilder-search"
          placeholder={searchPlaceholder ?? "Search apps…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search apps"
        />
      )}
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
    </div>,
  );
}
