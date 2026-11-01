import { useEffect, useRef, useState } from "react";
import { JsonEditor } from "../JsonEditor.tsx";
import { VERSION_CONFLICT_COPY, parseDocText } from "../data-stores/data-store-view.ts";
import { DeleteButton } from "./DeleteButton.tsx";
import { Modal } from "./Modal.tsx";

export interface DataEntryEditorProps {
  /** `kv` edits one input; `doc` edits JSON in a {@link JsonEditor}. */
  kind: "kv" | "doc";
  /** True for a not-yet-created entry: opens directly in edit mode with a key input. */
  isNew: boolean;
  /** The entry's key (existing mode heading). */
  entryKey?: string;
  /** The new entry's key (controlled). */
  newKey?: string;
  /** Concurrency token supplied by the host; never presented as document history. */
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
  /** Opens the host's delete confirmation for an existing entry. */
  onDelete?: () => void;
  onSave: () => void;
  onCancel: () => void;
  /** Fired by the conflict prompt's Reload. */
  onReload: () => void;
}

/**
 * Existing entries open for viewing, then Edit enables changes inside the same modal.
 * New entries start in edit mode. Drafts, `ifVersion` and mutations live in the host.
 * Document validity is derived from the controlled text, including initial values and reloads.
 */
export function DataEntryEditor({
  kind,
  isNew,
  entryKey,
  newKey,
  expiresAt,
  text,
  error,
  conflict,
  saving,
  onTextChange,
  onKeyChange,
  onDelete,
  onSave,
  onCancel,
  onReload,
}: DataEntryEditorProps) {
  const [editing, setEditing] = useState(isNew);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isNew) closeButton.current?.focus();
  }, [isNew]);
  const noun = kind === "doc" ? "document" : "entry";
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
      ) : expiresAt ? (
        <p className="w6w-muted w6w-small">Expires {expiresAt}</p>
      ) : null}

      {kind === "doc" ? (
        <JsonEditor
          value={text}
          readOnly={!editing}
          onChange={onTextChange}
          minHeight="min(50vh, 400px)"
          maxHeight="60vh"
        />
      ) : (
        <input
          data-testid="entry-value"
          value={text}
          aria-label="Value"
          readOnly={!editing}
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
  return (
    <Modal
      title={
        isNew ? `New ${noun}` : editing ? `Edit ${noun}` : kind === "doc" ? "Document" : "Entry"
      }
      subtitle={isNew ? undefined : entryKey}
      size={kind === "doc" ? "wide" : "default"}
      onClose={saving ? () => {} : onCancel}
    >
      <div className="w6w-modal-body" data-testid="entry-editor">
        {body}
      </div>
      <div className="w6w-modal-actions">
        {!isNew && onDelete && (
          <DeleteButton
            label="Delete entry"
            className="w6w-data-entry-delete"
            disabled={saving}
            onClick={onDelete}
          />
        )}
        <button
          ref={closeButton}
          className="w6w-btn w6w-btn-ghost"
          type="button"
          disabled={saving}
          onClick={onCancel}
        >
          {editing ? "Cancel" : "Close"}
        </button>
        {editing ? (
          <button
            className="w6w-btn"
            type="button"
            data-testid="entry-save"
            disabled={
              Boolean(conflict) || Boolean(saving) || invalidDocument || (isNew && !newKey?.trim())
            }
            onClick={onSave}
          >
            Save
          </button>
        ) : (
          <button
            className="w6w-btn"
            type="button"
            disabled={saving}
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        )}
      </div>
    </Modal>
  );
}
