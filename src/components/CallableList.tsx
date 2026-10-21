import { type MouseEvent, type ReactNode, useState } from "react";
import { DataTable, type DataTableColumn } from "./DataTable.tsx";
import { EmptyState } from "./EmptyState.tsx";

/** One row of a {@link CallableList}. The host decides `archived`; the list never learns a kind. */
export interface CallableListRow {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  archived: boolean;
  /** Extra badges, rendered before the archived badge in the trailing slot. */
  badges?: ReactNode;
  /** Trailing content; sits inside the row's anchor when `getHref` is set, so keep it non-interactive. */
  trailing?: ReactNode;
}

export interface CallableListProps {
  rows: readonly CallableListRow[];
  title: ReactNode;
  description?: ReactNode;
  /** Shown (inside an EmptyState) when no rows exist at all and not `loading`. */
  emptyCopy?: ReactNode;
  /** Label of the New button. Defaults to "New". */
  newLabel?: string;
  /** Tooltip (`title` attribute) on each openable row. */
  openRowTitle?: string;
  testIds?: { showArchived?: string; importOpen?: string; archivedBadge?: string };
  loading?: boolean;
  error?: string | null;
  /** The New button renders only when this is set. */
  onCreate?: () => void;
  /** New button is disabled and reads "Creating…" while true. */
  creating?: boolean;
  /** The Import button renders only when this is set. */
  onImport?: () => void;
  /** Row click. The event is passed through untouched; the host may `preventDefault`. */
  onOpen?: (id: string, event: MouseEvent<Element>) => void;
  /** When set, each row is a real `<a href>`. */
  getHref?: (id: string) => string;
  /** Controlled "Show archived". Omit for an uncontrolled toggle that starts off. */
  showArchived?: boolean;
  onShowArchivedChange?: (next: boolean) => void;
  slots?: {
    /** Replaces the default title/description block (the Show-archived toggle stays). */
    header?: ReactNode;
    /** Rendered before Import/New. */
    actions?: ReactNode;
    /** Replaces `emptyCopy`. */
    empty?: ReactNode;
  };
}

/**
 * A presentational list of callables (Functions, Endpoints, Workflows): rows in, callbacks out.
 * Owns only the archived filter and its toggle; it knows no router, query, modal or kind.
 * Rows render through {@link DataTable}: a click handler with `onOpen`, anchors with `getHref`.
 * No visible rows renders an {@link EmptyState}; when only archived rows exist it offers "Show archived".
 */
export function CallableList({
  rows,
  title,
  description,
  emptyCopy,
  newLabel = "New",
  openRowTitle,
  testIds,
  loading,
  error,
  onCreate,
  creating,
  onImport,
  onOpen,
  getHref,
  showArchived: showArchivedProp,
  onShowArchivedChange,
  slots,
}: CallableListProps) {
  const [showArchivedState, setShowArchivedState] = useState(false);
  const controlled = showArchivedProp !== undefined;
  const showArchived = controlled ? showArchivedProp : showArchivedState;
  const visible = showArchived ? rows : rows.filter((r) => !r.archived);
  const interactive = onOpen !== undefined || getHref !== undefined;
  const setShowArchived = (next: boolean) => {
    if (!controlled) setShowArchivedState(next);
    onShowArchivedChange?.(next);
  };
  const columns: DataTableColumn<CallableListRow>[] = [
    {
      key: "main",
      header: "Name",
      render: (row) => {
        const body = (
          <span className="w6w-callable-list-main" title={interactive ? openRowTitle : undefined}>
            <span>{row.title}</span>
            {row.description != null && (
              <span className="w6w-muted w6w-small w6w-callable-list-row-desc">
                {row.description}
              </span>
            )}
          </span>
        );
        // The click lands on the row (DataTable `onRowClick`); the button is the keyboard route in.
        return onOpen && !getHref ? (
          <button type="button" className="w6w-callable-list-open">
            {body}
          </button>
        ) : (
          body
        );
      },
    },
    {
      key: "trail",
      header: "",
      align: "right",
      render: (row) =>
        row.archived || row.badges != null || row.trailing != null ? (
          <span className="w6w-callable-list-trail">
            {row.badges}
            {row.archived && (
              <span className="w6w-callable-list-badge" data-testid={testIds?.archivedBadge}>
                archived
              </span>
            )}
            {row.trailing}
          </span>
        ) : null,
    },
  ];
  const archivedOnly = rows.length > 0 && visible.length === 0;

  return (
    <section className="w6w-callable-list">
      <div className="w6w-callable-list-head">
        <div className="w6w-callable-list-heading">
          {slots?.header ?? (
            <>
              <h2 className="w6w-callable-list-title">{title}</h2>
              {description != null && (
                <p className="w6w-muted w6w-small w6w-callable-list-description">{description}</p>
              )}
            </>
          )}
          <label className="w6w-muted w6w-small w6w-callable-list-toggle">
            <input
              type="checkbox"
              checked={showArchived}
              data-testid={testIds?.showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>
        <div className="w6w-callable-list-actions">
          {slots?.actions}
          {onImport && (
            <button
              type="button"
              className="w6w-btn w6w-btn-ghost"
              data-testid={testIds?.importOpen}
              onClick={onImport}
            >
              Import
            </button>
          )}
          {onCreate && (
            <button type="button" className="w6w-btn" disabled={creating} onClick={onCreate}>
              {creating ? "Creating…" : newLabel}
            </button>
          )}
        </div>
      </div>

      {error && <div className="w6w-error">{error}</div>}

      <div className="w6w-callable-list-body">
        {loading && <p className="w6w-muted">Loading…</p>}
        {visible.length === 0 && !loading ? (
          archivedOnly ? (
            <EmptyState
              testId="w6w-callable-list-empty"
              action={
                <button
                  type="button"
                  className="w6w-btn w6w-btn-ghost"
                  onClick={() => setShowArchived(true)}
                >
                  Show archived
                </button>
              }
            >
              {rows.length === 1
                ? "The only item is archived."
                : `All ${rows.length} items are archived.`}
            </EmptyState>
          ) : (
            <EmptyState testId="w6w-callable-list-empty">{slots?.empty ?? emptyCopy}</EmptyState>
          )
        ) : (
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(r) => r.id}
            loading={loading}
            getRowHref={getHref ? (r) => getHref(r.id) : undefined}
            onRowClick={onOpen ? (r, event) => onOpen(r.id, event) : undefined}
          />
        )}
      </div>
    </section>
  );
}
