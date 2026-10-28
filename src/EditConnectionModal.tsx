import { useEffect, useState } from "react";
import { AuthFieldsForm, parseJsonFields } from "./components/AuthFieldsForm.tsx";
import { bindingFieldsFor, buildBinding } from "./components/CredentialPicker.tsx";
import { Modal } from "./components/Modal.tsx";
import { useW6WApi } from "./provider.tsx";
import type {
  AuthDef,
  AuthField,
  ConnectionBinding,
  ConnectionSummary,
  CredentialTestResult,
  ThemeMode,
} from "./types.ts";
import { useEnterSubmit } from "./use-enter-submit.ts";

export interface EditConnectionModalProps {
  /** The row being edited. `builtIn` rows have nothing to edit: the modal shows a notice only. */
  connection: Pick<
    ConnectionSummary,
    "id" | "appId" | "authKey" | "displayName" | "builtIn" | "credentialId" | "lastTestOk"
  >;
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
 * A connection that uses a stored credential (`connection.credentialId`), when the host supplies
 * `api.rotateCredential`, is split in two: Save only renames it and changes its binding (never the
 * credential, which other connections may share), and "Rotate credential" is a separate explicit
 * action that replaces the stored secret for every connection using it.
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
  const [bindingVals, setBindingVals] = useState<Record<string, unknown>>({});
  const [rotating, setRotating] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [connectionCount, setConnectionCount] = useState<number | null>(null);
  const [health, setHealth] = useState<CredentialTestResult | null>(null);

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
  const credentialId = connection.credentialId;
  const split = !!credentialId && typeof api.rotateCredential === "function" && !isOAuth;
  const bindingFields =
    split && authDef?.serviceAccount ? bindingFieldsFor(authDef.serviceAccount) : [];

  // Impact of a rotation: how many connections share the stored credential.
  useEffect(() => {
    if (!editable || !split || !credentialId || typeof api.getCredential !== "function") return;
    let canceled = false;
    api
      .getCredential(credentialId)
      .then((c) => !canceled && setConnectionCount(c.connectionCount))
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [api, editable, split, credentialId]);

  /** `null` = nothing to update. Only a changed name and non-blank credential fields are sent. */
  function buildBody(): {
    displayName?: string;
    binding?: ConnectionBinding;
    credential?: Record<string, unknown>;
  } | null {
    if (split) {
      // Rename/binding only: the credential is never part of this body.
      const body: { displayName?: string; binding?: ConnectionBinding } = {};
      if (displayName !== (connection.displayName ?? "")) body.displayName = displayName;
      const binding = buildBinding(bindingFields, bindingVals);
      if (binding) body.binding = binding;
      return body.displayName === undefined && body.binding === undefined ? null : body;
    }
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
      setError(
        split
          ? "Nothing to update — change the name or a binding field."
          : "Nothing to update — change the name or a credential field.",
      );
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

  const rotateMissing = fields.some(
    (f) => f.required && (credential[f.key] === undefined || credential[f.key] === ""),
  );

  async function rotate() {
    if (!credentialId || !api.rotateCredential || pending) return;
    setError(null);
    const parsed = parseJsonFields(fields, credential);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setPending(true);
    try {
      await api.rotateCredential(credentialId, { source: parsed.values });
      setCredential({});
      setRotating(false);
      setRotated(true);
      setHealth(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function checkHealth() {
    if (!credentialId || !api.testCredential) return;
    setError(null);
    try {
      setHealth(await api.testCredential(credentialId));
    } catch (e) {
      setError((e as Error).message);
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

                {split && bindingFields.length > 0 && (
                  <>
                    <p className="w6w-muted w6w-small">
                      Leave a binding field blank to keep it unchanged.
                    </p>
                    <AuthFieldsForm
                      mode="edit"
                      fields={bindingFields}
                      values={bindingVals}
                      onChange={setBindingVals}
                      enterSubmitProps={enterSubmit}
                    />
                  </>
                )}

                {split && (
                  <div className="w6w-stack" data-w6w="credential-section">
                    {typeof api.testCredential === "function" && (
                      <div>
                        <button
                          type="button"
                          className="w6w-btn w6w-btn-ghost"
                          onClick={checkHealth}
                        >
                          Test credential
                        </button>
                        {health && (
                          <p className="w6w-small" data-w6w="credential-health">
                            Credential health: {health.ok ? "ok" : (health.code ?? "failed")}
                          </p>
                        )}
                      </div>
                    )}
                    <p className="w6w-small" data-w6w="app-access">
                      App access:{" "}
                      {connection.lastTestOk === true
                        ? "passed"
                        : connection.lastTestOk === false
                          ? "failed"
                          : "never tested"}
                    </p>
                    {rotated && <p className="w6w-small">Credential rotated.</p>}
                    {!rotating ? (
                      <button
                        type="button"
                        className="w6w-btn w6w-btn-ghost"
                        onClick={() => setRotating(true)}
                      >
                        Rotate credential
                      </button>
                    ) : (
                      <>
                        <p className="w6w-muted w6w-small">
                          Enter the full new credential; it replaces the stored one.
                          {connectionCount !== null &&
                            ` It is used by ${connectionCount} connection${connectionCount === 1 ? "" : "s"}, and all of them switch to it.`}
                        </p>
                        <AuthFieldsForm
                          fields={fields}
                          values={credential}
                          onChange={setCredential}
                        />
                        <div>
                          <button
                            type="button"
                            className="w6w-btn"
                            disabled={pending || rotateMissing}
                            onClick={rotate}
                          >
                            Rotate
                          </button>{" "}
                          <button
                            type="button"
                            className="w6w-btn w6w-btn-ghost"
                            onClick={() => {
                              setRotating(false);
                              setCredential({});
                            }}
                          >
                            Cancel rotation
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {!split && fields.length > 0 && (
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
