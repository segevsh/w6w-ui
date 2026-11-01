import { type FormEvent, type ReactNode, useState } from "react";
import { type TableColumn, VERSION_CONFLICT_COPY } from "../data-stores/data-store-view.ts";
import { DataTable, type DataTableColumn } from "./DataTable.tsx";
import { DeleteButton } from "./DeleteButton.tsx";

/** One grid row as the host has prepared it. `id` is the entry key; the new row is `isNew`. */
export interface DataTableGridRow {
  id: string;
  /** True for the unsaved row: its key cell is editable and its `data-row` is `"new"`. */
  isNew?: boolean;
  /** Draft cell text by column name. */
  cells: Record<string, string>;
  /** The version the row was loaded at; `null` for a new row. */
  version: number | null;
  /** True when the draft differs from the loaded entry. */
  dirty: boolean;
  /** True after a stale `ifVersion`: shows the conflict copy and Reload, and disables Save. */
  conflict?: boolean;
  /** Per-cell error messages by column name, shown under their own cell. */
  cellErrors?: Record<string, string>;
}

export interface DataTableGridProps {
  columns: readonly TableColumn[];
  /** The column whose cell is the row key (read-only on an existing row). */
  keyColumn: string;
  rows: readonly DataTableGridRow[];
  /** A grid-level (not cell) error. */
  error?: string | null;
  loading?: boolean;
  empty?: ReactNode;
  /** Initial text of the key-prefix box. */
  searchValue?: string;
  hasMore?: boolean;
  onCellChange: (rowId: string, column: string, text: string) => void;
  onSave: (rowId: string) => void;
  /** Fired immediately; confirmation is the host's. */
  onDelete: (rowId: string) => void;
  onReload: (rowId: string) => void;
  onAddRow: () => void;
  onLoadMore: () => void;
  /** Fired with the prefix text when the search form is SUBMITTED (never per keystroke). */
  onSearch: (text: string) => void;
}

const rowAttr = (row: DataTableGridRow) => (row.isNew ? "new" : row.id);

/**
 * A presentational editable grid for a table store: row view-models in, callbacks out. Drafts,
 * dirty tracking, version handling and the delete confirmation are the host's. Rows render through
 * {@link DataTable}.
 */
export function DataTableGrid({
  columns,
  keyColumn,
  rows,
  error,
  loading,
  empty,
  searchValue,
  hasMore,
  onCellChange,
  onSave,
  onDelete,
  onReload,
  onAddRow,
  onLoadMore,
  onSearch,
}: DataTableGridProps) {
  const [prefix, setPrefix] = useState(searchValue ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(prefix);
  };
  const tableColumns: DataTableColumn<DataTableGridRow>[] = [
    ...columns.map((column) => ({
      key: column.name,
      header: (
        <>
          {column.name} <span className="w6w-muted w6w-small">{column.type}</span>
        </>
      ),
      render: (row: DataTableGridRow) => {
        const message = row.cellErrors?.[column.name];
        return (
          <div className="w6w-data-cell">
            <input
              data-row={rowAttr(row)}
              data-column={column.name}
              value={row.cells[column.name] ?? ""}
              readOnly={column.name === keyColumn && !row.isNew}
              aria-label={`${column.name} (${column.type})`}
              onChange={(e) => onCellChange(row.id, column.name, e.target.value)}
            />
            {message !== undefined && (
              <div
                className="w6w-data-cell-error"
                data-row={rowAttr(row)}
                data-column={column.name}
              >
                {message}
              </div>
            )}
          </div>
        );
      },
    })),
    {
      key: "actions",
      header: "",
      render: (row: DataTableGridRow) => (
        <div className="w6w-data-row-actions">
          <span className="w6w-muted w6w-small">
            {row.version === null ? "" : `v${row.version}`}
          </span>
          <button
            className="w6w-btn"
            type="button"
            data-row={rowAttr(row)}
            data-testid="row-save"
            disabled={(!row.isNew && !row.dirty) || Boolean(row.conflict)}
            onClick={() => onSave(row.id)}
          >
            Save
          </button>
          <DeleteButton label="Delete entry" onClick={() => onDelete(row.id)} />
          {row.conflict && (
            <div className="w6w-error" data-row={rowAttr(row)} data-testid="row-conflict">
              {VERSION_CONFLICT_COPY}{" "}
              <button
                className="w6w-btn w6w-btn-ghost"
                type="button"
                data-testid="row-reload"
                onClick={() => onReload(row.id)}
              >
                Reload
              </button>
            </div>
          )}
        </div>
      ),
    },
  ];
  return (
    <div>
      {error != null && error !== "" && (
        <div className="w6w-error" data-testid="grid-error">
          {error}
        </div>
      )}

      <form className="w6w-data-entries-toolbar" data-testid="entry-search" onSubmit={submit}>
        <input
          type="search"
          data-testid="entry-prefix"
          value={prefix}
          placeholder="Key prefix"
          aria-label="Key prefix"
          onChange={(e) => setPrefix(e.target.value)}
        />
        <button className="w6w-btn w6w-btn-ghost" type="submit">
          Search
        </button>
        <button
          className="w6w-btn w6w-btn-ghost"
          type="button"
          data-testid="grid-add-row"
          onClick={onAddRow}
        >
          Add row
        </button>
      </form>

      <div className="w6w-data-grid-scroll" data-testid="data-grid-scroll">
        <DataTable
          columns={tableColumns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            // A div, not a <p>: `empty` is any node and callers often pass a <p>.
            <div className="w6w-muted w6w-small">
              {loading ? "Loading…" : (empty ?? "No rows match this key prefix.")}
            </div>
          }
        />
      </div>

      {hasMore && (
        <button
          className="w6w-btn w6w-btn-ghost"
          type="button"
          data-testid="entries-load-more"
          onClick={onLoadMore}
        >
          Load more
        </button>
      )}
    </div>
  );
}
