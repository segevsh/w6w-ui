import { useEffect, useState } from "react";
import {
  SCALAR_TYPES,
  type ScalarType,
  type TableColumn,
  parseCell,
  serializeCell,
} from "../data-stores/data-store-view.ts";
import { DeleteButton } from "./DeleteButton.tsx";

/**
 * The `table` kind's column list: a controlled row editor (rows + `onChange(next)`; the column
 * list itself is never copied).
 *
 * The **key column** select is the one piece of the schema a row cannot decide for itself: only a
 * column that is `required` and typed `string` or `integer` may be a row's key, so the select
 * offers only those rows. A column renamed, retyped or un-required out of that set resets the
 * selection to `""` ("generated keys") rather than holding a key the server would reject.
 *
 * `columnErrors` is keyed by column NAME (what the host's error envelope names in
 * `error.column`), so a 400 lands under the row that caused it.
 *
 * Each row also takes a **default**, typed as text and parsed with the column's type: empty or
 * refused text leaves the column with no `default` key at all, a valid one stores the typed value
 * (`7`, `true`), never the text.
 */
export interface ColumnsEditorProps {
  columns: TableColumn[];
  onChange: (next: TableColumn[]) => void;
  /** The selected key column's name, or `""` for "generated keys". */
  keyColumn: string;
  onKeyColumnChange: (k: string) => void;
  /** One message per column name, from the server's `error.column`. */
  columnErrors: Record<string, string>;
}

/** The key column's eligibility rule. */
function eligibleAsKey(c: TableColumn): boolean {
  return c.name !== "" && c.required === true && (c.type === "string" || c.type === "integer");
}

/** `column` with its default replaced by the parse of `text`; no `default` key unless it parsed. */
function withDefault(column: TableColumn, text: string): { column: TableColumn; error?: string } {
  const { default: _old, ...rest } = column;
  const parsed = parseCell(column.type, text, false);
  if (!parsed.ok) return { column: rest, error: parsed.message };
  if (parsed.value === undefined) return { column: rest };
  return { column: { ...rest, default: parsed.value } };
}

interface DefaultDraft {
  text: string;
  error?: string;
}

export function ColumnsEditor(props: ColumnsEditorProps) {
  const { columns, onChange, keyColumn, onKeyColumnChange, columnErrors } = props;
  // The text typed into each row's default box, by row position. A row with no draft shows the
  // serialization of the column's own default.
  const [drafts, setDrafts] = useState<Record<number, DefaultDraft>>({});

  const eligible = columns.filter(eligibleAsKey);
  const eligibleKey = eligible.some((c) => c.name === keyColumn) ? keyColumn : "";

  // The selection cannot survive its column leaving the eligible set.
  useEffect(() => {
    if (keyColumn !== "" && eligibleKey === "") onKeyColumnChange("");
  }, [keyColumn, eligibleKey, onKeyColumnChange]);

  function addColumn() {
    onChange([...columns, { name: "", type: "string", required: false }]);
  }
  function updateColumn(i: number, next: Partial<TableColumn>) {
    onChange(columns.map((c, idx) => (idx === i ? { ...c, ...next } : c)));
  }
  function setDefault(i: number, type: ScalarType, text: string, extra?: Partial<TableColumn>) {
    const base = { ...columns[i], ...extra, type } as TableColumn;
    const { column, error } = withDefault(base, text);
    setDrafts((d) => ({ ...d, [i]: error === undefined ? { text } : { text, error } }));
    onChange(columns.map((c, idx) => (idx === i ? column : c)));
  }
  function removeColumn(i: number) {
    setDrafts((d) => {
      const next: Record<number, DefaultDraft> = {};
      for (const [k, v] of Object.entries(d)) {
        const n = Number(k);
        if (n < i) next[n] = v;
        else if (n > i) next[n - 1] = v;
      }
      return next;
    });
    onChange(columns.filter((_, idx) => idx !== i));
  }

  return (
    <div className="w6w-data-columns">
      <div className="w6w-data-columns-head">
        <h3>Columns</h3>
        <button type="button" className="w6w-btn w6w-btn-ghost" onClick={addColumn}>
          + Add column
        </button>
      </div>
      <p className="w6w-muted w6w-small">
        Each column has a name, a scalar type, whether it must be set, and an optional default.
      </p>
      {columns.length === 0 && <p className="w6w-muted w6w-small">No columns yet.</p>}
      <ul className="w6w-data-columns-list" data-testid="data-columns">
        {columns.map((c, i) => {
          const draft = drafts[i];
          const text = draft?.text ?? serializeCell(c.type, c.default);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and reorderable
            <li key={i} className="w6w-data-columns-row">
              <input
                type="text"
                value={c.name}
                placeholder="name"
                aria-label="Column name"
                onChange={(e) => updateColumn(i, { name: e.target.value })}
              />
              <select
                value={c.type}
                aria-label="Column type"
                onChange={(e) => setDefault(i, e.target.value as ScalarType, text)}
              >
                {SCALAR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <label className="w6w-data-columns-required">
                <input
                  type="checkbox"
                  checked={c.required}
                  aria-label="Required"
                  onChange={(e) => updateColumn(i, { required: e.target.checked })}
                />
                <span className="w6w-muted w6w-small">required</span>
              </label>
              <input
                type="text"
                value={text}
                placeholder="default"
                aria-label="Column default"
                onChange={(e) => setDefault(i, c.type, e.target.value)}
              />
              <DeleteButton
                label={`Remove column ${c.name || i + 1}`}
                onClick={() => removeColumn(i)}
              />
              {draft?.error !== undefined && (
                <div
                  className="w6w-result w6w-error w6w-data-columns-error"
                  data-testid={`data-store-column-default-error-${i}`}
                >
                  {draft.error}
                </div>
              )}
              {c.name !== "" && columnErrors[c.name] !== undefined && (
                <div
                  className="w6w-result w6w-error w6w-data-columns-error"
                  data-testid={`data-store-column-error-${c.name}`}
                >
                  {columnErrors[c.name]}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <label className="w6w-field">
        <span>Key column</span>
        <select value={eligibleKey} onChange={(e) => onKeyColumnChange(e.target.value)}>
          <option value="">(none — rows get generated keys)</option>
          {eligible.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="w6w-hint">
          Only a required, string or integer column can name a row's key.
        </span>
      </label>
    </div>
  );
}
