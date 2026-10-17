import { useEffect, useState } from "react";
import { AuthFieldsForm } from "./components/AuthFieldsForm.tsx";
import { Modal } from "./components/Modal.tsx";
import { useW6WApi } from "./provider.tsx";
import type { AuthDef, AuthField, ConnectionSummary, ThemeMode } from "./types.ts";
import { useEnterSubmit } from "./use-enter-submit.ts";

export interface EditConnectionModalProps {
  /** The row being edited. `builtIn` rows have nothing to edit: the modal shows a notice only. */
  connection: Pick<ConnectionSummary, "id" | "appId" | "authKey" | "displayName" | "builtIn">;
  onClose: () => void;
  /** Fired with the server's updated row. The typed credential is cleared before this runs. */
  onSaved: (updated: ConnectionSummary) => void;
  /** Reserved for icon variants, like the other modals. */
  theme?: ThemeMode;
}

/**
 * Edit an existing connection: rename it and/or replace some of its credential fields. Runs on
 * the {@link useW6WApi} adapter alone. The server never returns the stored secret, so credential
 * fields start empty and blank means "keep what is stored" — only the fields the user filled are
 * sent, and the server merges them over the stored credential. OAuth connections can be renamed
 * here; re-authorizing is not part of this modal.
 *
 * Needs `api.updateConnection`. Without it (or for a `builtIn` row) there is no Save button, a
 * one-line notice shows instead, and nothing is called. Hosts should not offer Edit in that case.
 */
export function EditConnectionModal({ connection, onClose, onSaved }: EditConnectionModalProps) {
  const api = useW6WApi();
  const update = api.updateConnection;
  const builtIn = connection.builtIn === true;
  const editable = !builtIn && typeof update === "function";

  const [displayName, setDisplayName] = useState(connection.displayName ?? "");
  const [credential, setCredential] = useState<Record<string, unknown>>({});
  const [auths, setAuths] = useState<AuthDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // The app's declared auth methods drive which credential fields to show.
  useEffect(() => {
    if (!editable) return;
    let canceled = false;
    setAuths(null);
    api
      .getAppAuth(connection.appId)
      .then((a) => !canceled && setAuths(a))
      .catch((e) => !canceled && setError((e as Error).message));
    return () => {
      canceled = true;
    };
  }, [api, editable, connection.appId]);

  const authDef = auths?.find((a) => a.key === connection.authKey);
  const isOAuth = authDef?.type === "oauth2";
  const fields: AuthField[] = isOAuth ? [] : (authDef?.fields ?? []);

  /** `null` = nothing to update. Only a changed name and non-blank credential fields are sent. */
  function buildBody(): { displayName?: string; credential?: Record<string, unknown> } | null {
    const filled: Record<string, unknown> = {};
    for (const f of fields) {
      const v = credential[f.key];
      if (v !== undefined && v !== "") filled[f.key] = v;
    }
    const body: { displayName?: string; credential?: Record<string, unknown> } = {};
    if (displayName !== (connection.displayName ?? "")) body.displayName = displayName;
    if (Object.keys(filled).length > 0) body.credential = filled;
    return body.displayName === undefined && body.credential === undefined ? null : body;
  }

  async function save() {
    if (!editable || !update || pending) return;
    setError(null);
    const body = buildBody();
    if (!body) {
      setError("Nothing to update — change the name or a credential field.");
      return;
    }
    setPending(true);
    try {
      const updated = await update.call(api, connection.id, body);
      // Drop every typed secret before handing control back to the host.
      setCredential({});
      onSaved(updated);
    } catch (e) {
      // The rejection's message only — never the values the user typed.
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  const enterSubmit = useEnterSubmit(save, { enabled: editable && !pending });

  return (
    <Modal title="Edit connection" onClose={onClose}>
      <div className="w6w-stepconfig">
        <div className="w6w-modal-body">
          <div className="w6w-stack">
            {builtIn && (
              <p className="w6w-muted w6w-small">
                This connection is built in — it has no stored credential to edit.
              </p>
            )}
            {!builtIn && !editable && (
              <p className="w6w-muted w6w-small">Editing connections is not available here.</p>
            )}
            {editable && (
              <>
                <label className="w6w-field">
                  <span>Display name</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Connection name"
                    maxLength={80}
                    name="w6w-connection-label"
                    autoComplete="off"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    {...enterSubmit}
                  />
                </label>

                {auths === null && !error && (
                  <p className="w6w-muted w6w-small">Loading auth fields…</p>
                )}

                {isOAuth && (
                  <p className="w6w-muted w6w-small">
                    This is an OAuth connection. You can rename it here; its credential is renewed
                    by re-authorizing it.
                  </p>
                )}

                {fields.length > 0 && (
                  <>
                    <p className="w6w-muted w6w-small">
                      Leave a field blank to keep it unchanged. Filled fields replace the stored
                      credential.
                    </p>
                    <AuthFieldsForm
                      mode="edit"
                      fields={fields}
                      values={credential}
                      onChange={setCredential}
                      enterSubmitProps={enterSubmit}
                    />
                  </>
                )}
              </>
            )}

            {error && <div className="w6w-result w6w-error">{error}</div>}
          </div>
        </div>
        <div className="w6w-modal-actions">
          <button type="button" className="w6w-btn w6w-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          {editable && (
            <button type="button" className="w6w-btn" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
