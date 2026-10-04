import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.tsx";

export interface RepoSyncIndicatorProps {
  /** Branch name, e.g. "main". */
  branch: string;
  /** Already-shortened commit sha (the consumer formats it — D-6). `null` renders no sha. */
  shortSha: string | null;
  /** Already-formatted last-sync text, e.g. "3/9/2026, 12:16:29 PM" or "Never synced".
   *  `null` renders no time row. */
  lastSyncLabel: string | null;
  /** Fired when the flyout's "Sync now" item is activated. The consumer owns the mutation. */
  onSyncNow: () => void;
  /** True while the consumer's sync is in flight. */
  syncing?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * A compact header control showing a repo glyph, a branch name and a short
 * commit sha, with an inline flyout menu carrying the sync detail and a
 * "Sync now" action the consumer wires.
 *
 * `@w6w/ui` never fetches and holds no studio policy
 * (`studio/src/ui/ExpressionScope.tsx:40-41`, extended by D-6) — this
 * component takes already-formatted strings and a callback.
 *
 * The open/close + outside-click + Escape state machine mirrors
 * `studio/src/components/Layout.tsx:222-328`'s `ProjectMenu()` (D-3: no
 * shared Menu/Popover/Dropdown primitive — there is exactly one consumer).
 */
export function RepoSyncIndicator(props: RepoSyncIndicatorProps) {
  const { branch, shortSha, lastSyncLabel, onSyncNow, syncing, className, ...rest } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className={`w6w-repo-sync${className ? ` ${className}` : ""}`}
      ref={ref}
      data-testid={rest["data-testid"]}
    >
      <button
        type="button"
        className="w6w-repo-sync-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={syncing}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="w6w-repo-sync-icon">
          {/* The connection provider's mark — `icons.tsx`'s `github` (`RepoBinding.provider`
              is always `"github"` today), 16px, the set's default. */}
          <Icon name="github" />
          {/* The in-flight badge over the mark while `syncing`: `icons.tsx`'s `sync`
              (Feather `refresh-cw`), shrunk to 10×10 for this corner use and spun by
              `.w6w-repo-sync-spin`, which `Icon` merges with `w6w-icon`. */}
          {syncing && <Icon name="sync" size={10} className="w6w-repo-sync-spin" />}
        </span>
        <span className="w6w-repo-sync-branch">{branch}</span>
        {shortSha != null && <code className="w6w-repo-sync-sha">{shortSha}</code>}
      </button>
      {open && (
        <div className="w6w-repo-sync-menu" role="menu">
          <div className="w6w-repo-sync-detail">
            <span>{branch}</span>
            {shortSha != null && <code>{shortSha}</code>}
            {lastSyncLabel != null && <span>{lastSyncLabel}</span>}
          </div>
          <button
            type="button"
            role="menuitem"
            className="w6w-repo-sync-item"
            data-testid="repo-sync-now"
            disabled={syncing}
            onClick={onSyncNow}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      )}
    </div>
  );
}
