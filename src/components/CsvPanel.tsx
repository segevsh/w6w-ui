import type { ChangeEvent } from "react";
import { CSV_MAX_BYTES, CSV_TOO_LARGE_COPY } from "../data-stores/data-store-view.ts";

export interface CsvPanelProps {
  /** What the panel is telling the operator, and whether it failed. `null` renders nothing. */
  result: { ok: boolean; message: string } | null;
  /** Disables Export while a request is in flight. */
  busy?: boolean;
  /** A file within {@link CSV_MAX_BYTES}. Reading and sending it are the host's. */
  onImport: (file: File) => void;
  /** A file the panel refused before handing it over (too large). */
  onRefuse: (message: string) => void;
  onExport: () => void;
}

/**
 * CSV import and export for one table store: one file input, one Export button, one result line.
 * Props-only. The panel owns the size check (a file over {@link CSV_MAX_BYTES} is refused here and
 * never reaches `onImport`); it never parses the CSV, because the host is the authority on line
 * and column.
 */
export function CsvPanel({ result, busy, onImport, onRefuse, onExport }: CsvPanelProps) {
  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (file === undefined) return;
    // Reset the input's own value so choosing the SAME file again re-fires `change`.
    input.value = "";
    if (file.size > CSV_MAX_BYTES) {
      onRefuse(CSV_TOO_LARGE_COPY);
      return;
    }
    onImport(file);
  }

  return (
    <div className="w6w-data-csv-panel" data-testid="csv-panel">
      <div className="w6w-data-csv-panel-actions">
        <input
          type="file"
          accept=".csv,text/csv"
          data-testid="csv-file"
          aria-label="Import CSV"
          onChange={onFile}
        />
        <button
          className="w6w-btn w6w-btn-ghost"
          type="button"
          data-testid="csv-export"
          disabled={busy}
          onClick={onExport}
        >
          Export CSV
        </button>
      </div>
      {result !== null && (
        <div className={result.ok ? "w6w-result" : "w6w-result w6w-error"} data-testid="csv-result">
          {result.message}
        </div>
      )}
    </div>
  );
}
