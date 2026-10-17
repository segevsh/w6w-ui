import type { ReactNode } from "react";
import { AppIcon } from "./components/AppIcon.tsx";
import { CopyableText } from "./components/CopyableText.tsx";
import type { ConnectionSummary } from "./types.ts";

export interface ConnectionHeaderProps {
  conn: ConnectionSummary;
  /** The connection's app display meta (inline `app`, or the by-id record). */
  app:
    | { displayName?: string; iconSvg?: string; iconSvgDark?: string; brandColor?: string }
    | undefined;
  /** Actions slot, right-aligned (e.g. a Test or Edit button, or a back link). */
  children?: ReactNode;
}

/**
 * Connection identity strip: app icon, display name, copyable id, app id, auth key and state tag
 * (plus `invalid` after a failed test). Presentational; the actions live in `children`.
 */
export function ConnectionHeader({ conn, app, children }: ConnectionHeaderProps) {
  return (
    <div className="w6w-connection-header" data-testid="connection-header">
      <AppIcon
        src={app?.iconSvg}
        srcDark={app?.iconSvgDark}
        brandColor={app?.brandColor}
        name={app?.displayName ?? conn.appId}
        size={56}
      />
      <div className="w6w-connection-header-main">
        <h2 className="w6w-connection-header-title">{conn.displayName || conn.id}</h2>
        <p className="w6w-muted w6w-small w6w-connection-header-meta">
          <CopyableText value={conn.id} className="w6w-connection-id-copy" /> · App{" "}
          <code>{conn.appId}</code> · Auth <code>{conn.authKey}</code> ·{" "}
          <span
            className={`w6w-connection-tag${conn.state === "connected" ? "" : " w6w-connection-tag-warn"}`}
          >
            {conn.state}
          </span>
          {conn.lastTestOk === false && (
            <span
              className="w6w-connection-tag w6w-connection-tag-danger"
              title="Last test failed — update or re-test."
            >
              invalid
            </span>
          )}
        </p>
      </div>
      {children && <div className="w6w-connection-header-actions">{children}</div>}
    </div>
  );
}
