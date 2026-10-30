import type { MouseEvent, ReactNode } from "react";
import { DATA_STORE_KIND_LABEL, type DataStore } from "../data-stores/data-store-view.ts";
import { DataTable, type DataTableColumn } from "./DataTable.tsx";
import { DeleteButton } from "./DeleteButton.tsx";
import { EditButton } from "./EditButton.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { formatBytes } from "./server-resources-format.ts";

export interface DataStoreListProps {
  stores: readonly DataStore[];
  loading?: boolean;
  error?: string | null;
  /** Row click. The event is passed through untouched; the host may `preventDefault`. */
  onOpen?: (id: string, event: MouseEvent<Element>) => void;
  /** When set, each row is a real `<a href>`. */
  getHref?: (id: string) => string;
  /** Renders an Edit button per row. */
  onEdit?: (store: DataStore) => void;
  /** Renders an Archive button per row. Confirmation and the archive call are the host's. */
  onArchive?: (store: DataStore) => void;
  /** Disables every Archive button while an archive is in flight. */
  busy?: boolean;
  /** Size formatter; defaults to the package's `formatBytes` (`2.0 KiB`). */
  formatSize?: (bytes: number) => string;
  slots?: {
    /** Heading block above the rows. */
    header?: ReactNode;
    /** Trailing action(s) next to the header (e.g. a "New store" button). */
    actions?: ReactNode;
    /** Shown when there are no stores and the list is not `loading`. */
    empty?: ReactNode;
  };
}

/**
 * A presentational list of Data stores: rows in, callbacks out; it needs no provider. Rows render
 * through {@link DataTable} (name, kind, entry count, size, last update, and an Edit/Archive column
 * that is never a link).
 */
export function DataStoreList({
  stores,
  loading,
  error,
  onOpen,
  getHref,
  onEdit,
  onArchive,
  busy,
  formatSize,
  slots,
}: DataStoreListProps) {
  const size = formatSize ?? formatBytes;
  const hasActions = onEdit !== undefined || onArchive !== undefined;
  const columns: DataTableColumn<DataStore>[] = [
    { key: "name", header: "Name", render: (s) => <strong>{s.name}</strong> },
    { key: "kind", header: "Kind", render: (s) => DATA_STORE_KIND_LABEL[s.kind] },
    { key: "entries", header: "Entries", align: "right", render: (s) => String(s.entryCount) },
    { key: "size", header: "Size", align: "right", render: (s) => size(s.sizeBytes) },
    {
      key: "updated",
      header: "Updated",
      render: (s) => new Date(s.updatedAt).toLocaleString(),
    },
  ];
  if (hasActions) {
    columns.push({
      key: "actions",
      header: "",
      align: "right",
      link: false,
      render: (s) => (
        // Clicks here must not reach the row's onOpen.
        // biome-ignore lint/a11y/useKeyWithClickEvents: propagation guard only; the buttons inside are the controls.
        <div className="w6w-data-row-actions" onClick={(e) => e.stopPropagation()}>
          {onEdit && (
            <EditButton
              label="Edit"
              onClick={() => onEdit(s)}
              data-testid={`data-store-edit-${s.id}`}
            />
          )}
          {onArchive && (
            <DeleteButton
              label="Archive"
              onClick={() => onArchive(s)}
              disabled={busy}
              data-testid={`data-store-archive-${s.id}`}
            />
          )}
        </div>
      ),
    });
  }
  return (
    <section className="w6w-data-store-list">
      {(slots?.header != null || slots?.actions != null) && (
        <div className="w6w-data-store-list-head">
          <div className="w6w-data-store-list-heading">{slots?.header}</div>
          <div className="w6w-data-store-list-actions">{slots?.actions}</div>
        </div>
      )}
      {error && <div className="w6w-error">{error}</div>}
      {loading && <p className="w6w-muted">Loading…</p>}
      {stores.length === 0 && !loading ? (
        <EmptyState testId="w6w-data-store-list-empty">
          {slots?.empty ?? "No data stores yet."}
        </EmptyState>
      ) : (
        <DataTable
          columns={columns}
          rows={stores}
          rowKey={(s) => s.id}
          loading={loading}
          getRowHref={getHref ? (s) => getHref(s.id) : undefined}
          onRowClick={onOpen ? (s, event) => onOpen(s.id, event) : undefined}
        />
      )}
    </section>
  );
}
