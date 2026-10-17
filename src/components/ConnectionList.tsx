import type { MouseEvent, ReactNode } from "react";
import { type InlineAppMeta, resolveConnectionAppMeta } from "../connection-app-meta.ts";
import type { ConnectionSummary } from "../types.ts";
import { AppIcon } from "./AppIcon.tsx";
import { DeleteButton } from "./DeleteButton.tsx";
import { EditButton } from "./EditButton.tsx";
import { ListItem } from "./ListItem.tsx";

export interface ConnectionListProps {
  connections: readonly ConnectionSummary[];
  /**
   * App meta by id, used for rows whose own inline `app` is `undefined` (an older server).
   * Rows with an inline `app` object, or `null`, never consult it.
   */
  appsById?: ReadonlyMap<string, InlineAppMeta>;
  loading?: boolean;
  error?: string | null;
  /** Row click. The event is passed through untouched; the host may `preventDefault`. */
  onOpen?: (id: string, event: MouseEvent<Element>) => void;
  /** When set, each openable row is a real `<a href>`. */
  getHref?: (id: string) => string;
  /**
   * Renders an Edit button per row. Pass it only when the host's adapter has `updateConnection`
   * (otherwise the modal it opens has nothing to save with).
   */
  onEdit?: (connection: ConnectionSummary) => void;
  /** Renders a Delete button per row. Confirmation and the delete call are the host's. */
  onDelete?: (connection: ConnectionSummary) => void;
  /** Disables every Delete button while a delete is in flight. */
  busy?: boolean;
  slots?: {
    /** Heading block above the rows. */
    header?: ReactNode;
    /** Trailing action(s) next to the header (e.g. an "Add" button). */
    actions?: ReactNode;
    /** Shown when there are no connections and the list is not `loading`. */
    empty?: ReactNode;
  };
}

/**
 * A presentational list of connections: rows in, callbacks out; it needs no provider. Each row is
 * a {@link ListItem} (app icon, name, auth key, state, an `invalid` tag after a failed test) with
 * Edit and Delete buttons as SIBLINGS of its link, never inside it.
 *
 * A `builtIn` row (the server's synthetic "no credential" entry) is a plain non-interactive item:
 * no link, no `onOpen`, no Edit, no Delete, because the server 404s get/test/delete on its id.
 * Detection is `row.builtIn === true`, never an id prefix.
 */
export function ConnectionList({
  connections,
  appsById,
  loading,
  error,
  onOpen,
  getHref,
  onEdit,
  onDelete,
  busy,
  slots,
}: ConnectionListProps) {
  const byId = appsById ?? new Map<string, InlineAppMeta>();
  return (
    <section className="w6w-connection-list">
      {(slots?.header != null || slots?.actions != null) && (
        <div className="w6w-connection-list-head">
          <div className="w6w-connection-list-heading">{slots?.header}</div>
          <div className="w6w-connection-list-actions">{slots?.actions}</div>
        </div>
      )}
      {error && <div className="w6w-error">{error}</div>}
      {loading && <p className="w6w-muted">Loading…</p>}
      {connections.length === 0 && !loading && (
        <div className="w6w-muted">{slots?.empty ?? "No connections yet."}</div>
      )}
      <ul className="w6w-connection-rows">
        {connections.map((c) => {
          const app = resolveConnectionAppMeta(c, byId);
          const name = c.displayName || c.id;
          const builtIn = c.builtIn === true;
          return (
            <li key={c.id} className="w6w-connection-row">
              <div className="w6w-connection-row-main">
                <ListItem
                  href={builtIn ? undefined : getHref?.(c.id)}
                  onClick={builtIn || !onOpen ? undefined : (event) => onOpen(c.id, event)}
                  icon={
                    <AppIcon
                      src={app?.iconSvg}
                      srcDark={app?.iconSvgDark}
                      brandColor={app?.brandColor}
                      name={app?.displayName ?? c.appId}
                    />
                  }
                  title={
                    <>
                      <strong className="w6w-connection-name" title={name}>
                        {name}
                      </strong>{" "}
                      <span className="w6w-muted">{app?.displayName ?? c.appId}</span>
                    </>
                  }
                  subtitle={
                    <>
                      auth <code>{c.authKey}</code> ·{" "}
                      <span
                        className={`w6w-connection-tag${c.state === "connected" ? "" : " w6w-connection-tag-warn"}`}
                      >
                        {c.state}
                      </span>
                      {c.lastTestOk === false && (
                        <span
                          className="w6w-connection-tag w6w-connection-tag-danger"
                          title="Last test failed — update or re-test."
                        >
                          invalid
                        </span>
                      )}
                    </>
                  }
                />
              </div>
              {!builtIn && (onEdit || onDelete) && (
                <div className="w6w-connection-row-actions">
                  {onEdit && (
                    <EditButton
                      label="Edit"
                      onClick={() => onEdit(c)}
                      data-testid={`connection-edit-${c.id}`}
                    />
                  )}
                  {onDelete && (
                    <DeleteButton
                      label="Delete"
                      onClick={() => onDelete(c)}
                      disabled={busy}
                      data-testid={`connection-delete-${c.id}`}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
