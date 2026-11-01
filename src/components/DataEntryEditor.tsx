import { JsonEditor } from "../JsonEditor.tsx";
import { VERSION_CONFLICT_COPY, parseDocText } from "../data-stores/data-store-view.ts";
import { Modal } from "./Modal.tsx";

export interface DataEntryEditorProps {
  /** `kv` edits one input; `doc` edits JSON in a {@link JsonEditor}. */
  kind: "kv" | "doc";
  /** True for a not-yet-created entry: shows the key input instead of the version line. */
  isNew: boolean;
  /** The entry's key (existing mode heading). */
  entryKey?: string;
  /** The new entry's key (controlled). */
  newKey?: string;
  /** Existing mode: the version loaded. */
  version?: number | null;
  /** Existing mode: ISO expiry, shown when set. */
  expiresAt?: string | null;
  /** The value text (controlled). */
  text: string;
  /** A host-supplied value/save error. */
  error?: string | null;
  /** True after a stale `ifVersion`: shows the conflict copy and Reload, and disables Save. */
  conflict?: boolean;
  /** True while a save is in flight: disables Save. */
  saving?: boolean;
  /** Fired per edit of the value, with the new text. */
  onTextChange: (text: string) => void;
  /** Fired per edit of the new-entry key, with the new text. */
  onKeyChange: (key: string) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Fired by the conflict prompt's Reload. */
  onReload: () => void;
}

/**
 * A document opens in a modal; a key/value entry stays inline. Drafts, `ifVersion` and the
 * save mutation live in the host. Document validity is derived from the controlled text so
 * initial values, edits and reloads all gate Save alike.
 */
export function DataEntryEditor({
  kind,
  isNew,
  entryKey,
  newKey,
  version,
  expiresAt,
  text,
  error,
  conflict,
  saving,
  onTextChange,
  onKeyChange,
  onSave,
  onCancel,
  onReload,
}: DataEntryEditorProps) {
  const parsedDocument = kind === "doc" ? parseDocText(text) : undefined;
  const invalidDocument = parsedDocument !== undefined && !parsedDocument.ok;
  const valueError =
    error || (parsedDocument && !parsedDocument.ok && text.trim() ? parsedDocument.message : null);
  const body = (
    <>
      {isNew ? (
        <label className="w6w-field">
          <span>Key</span>
          <input
            data-testid="entry-new-key"
            value={newKey ?? ""}
            placeholder="Key"
            aria-label="Key"
            onChange={(e) => onKeyChange(e.target.value)}
          />
        </label>
      ) : (
        <p className="w6w-muted w6w-small">
          {version != null && <span>v{version}</span>}
          {expiresAt && <span> · Expires {expiresAt}</span>}
        </p>
      )}

      {kind === "doc" ? (
        <JsonEditor
          value={text}
          onChange={onTextChange}
          minHeight="min(50vh, 400px)"
          maxHeight="60vh"
        />
      ) : (
        <input
          data-testid="entry-value"
          value={text}
          aria-label="Value"
          onChange={(e) => onTextChange(e.target.value)}
        />
      )}

      {valueError && (
        <div className="w6w-field-error" role="alert" data-testid="entry-value-error">
          {valueError}
        </div>
      )}
      {conflict && (
        <div className="w6w-error" data-testid="entry-conflict">
          {VERSION_CONFLICT_COPY}{" "}
          <button
            className="w6w-btn w6w-btn-ghost"
            type="button"
            data-testid="entry-reload"
            onClick={onReload}
          >
            Reload
          </button>
        </div>
      )}
    </>
  );
  const actions = (
    <div className={kind === "doc" ? "w6w-modal-actions" : "w6w-data-entry-editor-actions"}>
      <button
        className="w6w-btn"
        type="button"
        data-testid="entry-save"
        disabled={
          Boolean(conflict) ||
          Boolean(saving) ||
          invalidDocument ||
          (kind === "doc" && isNew && !newKey?.trim())
        }
        onClick={onSave}
      >
        Save
      </button>
      <button className="w6w-btn w6w-btn-ghost" type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
  return kind === "doc" ? (
    <Modal
      title={isNew ? "New document" : "Edit document"}
      subtitle={isNew ? undefined : entryKey}
      size="wide"
      onClose={onCancel}
    >
      <div className="w6w-modal-body" data-testid="entry-editor">
        {body}
      </div>
      {actions}
    </Modal>
  ) : (
    <div className="w6w-card w6w-data-entry-editor" data-testid="entry-editor">
      <h3>{isNew ? "New entry" : (entryKey ?? "")}</h3>
      {body}
      {actions}
    </div>
  );
}
