import { type FormEvent, type ReactNode, useState } from "react";
import { DataTable, type DataTableColumn } from "./DataTable.tsx";
import { DeleteButton } from "./DeleteButton.tsx";

/** One row of a kv/doc store's entry list, as the host has already prepared it. */
export interface DataEntryListRow {
  key: string;
  version: number;
  /** The short text shown in the Value column. */
  preview: string;
}

export interface DataEntryListProps {
  rows: readonly DataEntryListRow[];
  /** Shown instead of the table when there are no rows and the list is not `loading`. */
  empty?: ReactNode;
  /** When there are no rows, shows the loading text instead of `empty`. */
  loading?: boolean;
  /** Initial text of the key-prefix box. */
  searchValue?: string;
  /** Renders "Load more" when true. */
  hasMore?: boolean;
  /** Fired when the key button of a row is clicked. */
  onOpen: (key: string) => void;
  /** Fired when a row's Delete is clicked. Confirmation is the host's. */
  onDelete: (key: string) => void;
  /** Fired with the prefix text when the search form is SUBMITTED (never per keystroke). */
  onSearch: (text: string) => void;
  /** Fired by the "New entry" button. */
  onNew: () => void;
  /** Fired by "Load more". */
  onLoadMore: () => void;
}

/**
 * A presentational list of a kv/doc store's entries: view-model rows in, callbacks out. It owns
 * only the text of the search box; the query, the editor and the delete confirmation are the
 * host's. Rows render through {@link DataTable}.
 */
export function DataEntryList({
  rows,
  empty,
  loading,
  searchValue,
  hasMore,
  onOpen,
  onDelete,
  onSearch,
  onNew,
  onLoadMore,
}: DataEntryListProps) {
  const [prefix, setPrefix] = useState(searchValue ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(prefix);
  };
  const columns: DataTableColumn<DataEntryListRow>[] = [
    {
      key: "key",
      header: "Key",
      render: (row) => (
        <button
          type="button"
          className="w6w-btn w6w-btn-ghost"
          data-testid="entry-key"
          onClick={() => onOpen(row.key)}
        >
          {row.key}
        </button>
      ),
    },
    {
      key: "version",
      header: "Version",
      render: (row) => (
        <span className="w6w-muted w6w-small" data-testid="entry-version">
          v{row.version}
        </span>
      ),
    },
    {
      key: "value",
      header: "Value",
      render: (row) => <span className="w6w-muted w6w-small">{row.preview}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (row) => <DeleteButton label="Delete entry" onClick={() => onDelete(row.key)} />,
    },
  ];
  return (
    <div>
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
          data-testid="entry-new"
          onClick={onNew}
        >
          New entry
        </button>
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        empty={
          // A div, not a <p>: `empty` is any node and callers often pass a <p>.
          <div className="w6w-muted w6w-small">
            {loading ? "Loading…" : (empty ?? "No entries match this key prefix.")}
          </div>
        }
      />

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
