import type { MouseEvent, ReactNode } from "react";

export interface DataTableColumn<Row> {
  key: string;
  header: ReactNode;
  /** Omitted ⇒ the cell shows `String(row[key] ?? "")`. */
  render?: (row: Row) => ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
  /** With `getRowHref`, wrap this column's cells in an anchor. Default true. */
  link?: boolean;
}

export interface DataTableProps<Row> {
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** Row click. The event is passed through untouched; the host may `preventDefault`. */
  onRowClick?: (row: Row, e: MouseEvent<Element>) => void;
  /** When set, every cell of a `link !== false` column wraps its content in `<a href>`. */
  getRowHref?: (row: Row) => string | undefined;
  /** Rendered in place of the body when there are no rows and not `loading`. */
  empty?: ReactNode;
  loading?: boolean;
  className?: string;
  testId?: string;
  rowTestId?: (row: Row) => string | undefined;
}

function cellValue<Row>(col: DataTableColumn<Row>, row: Row): ReactNode {
  if (col.render) return col.render(row);
  return String((row as Record<string, unknown>)[col.key] ?? "");
}

export function DataTable<Row>(props: DataTableProps<Row>) {
  const { columns, rows, rowKey, onRowClick, getRowHref, empty, loading, className, testId } =
    props;
  if (rows.length === 0 && !loading && empty !== undefined && empty !== null) {
    return <>{empty}</>;
  }
  // The frame owns the ONE outer border + radius (T-3); the table and its cells
  // draw inner separators only, so no outer edge is painted twice.
  return (
    <div className="w6w-data-table-frame">
      <table
        className={className ? `w6w-data-table ${className}` : "w6w-data-table"}
        data-testid={testId}
        aria-busy={loading ? true : undefined}
      >
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align }} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = getRowHref?.(row);
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: row click is a mouse convenience; keyboard users reach the row through its cell anchors (getRowHref) or the column's own controls.
              <tr
                key={rowKey(row)}
                data-testid={props.rowTestId?.(row)}
                className={onRowClick ? "w6w-data-table-row-clickable" : undefined}
                onClick={onRowClick ? (e) => onRowClick(row, e) : undefined}
              >
                {columns.map((c) => {
                  const content = cellValue(c, row);
                  return (
                    <td key={c.key} style={{ textAlign: c.align }}>
                      {href !== undefined && c.link !== false ? (
                        <a className="w6w-data-table-link" href={href}>
                          {content}
                        </a>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
